use datawise_plugin_sdk::PluginError;
use opendal::{EntryMode, Operator};
use serde_json::{json, Value};

use crate::connection::MountConfig;
use crate::guard::GuardState;
use crate::util::{
    normalize_object_path, normalize_prefix, plugin_err, required_string,
};

fn ts_string(meta: &opendal::Metadata) -> String {
    meta.last_modified()
        .map(|t| t.to_string())
        .unwrap_or_default()
}

pub async fn list(
    op: Option<&Operator>,
    config: &MountConfig,
    params: &Value,
) -> Result<Value, PluginError> {
    let prefix = params
        .get("prefix")
        .and_then(Value::as_str)
        .map(normalize_prefix)
        .unwrap_or_else(|| normalize_prefix(&config.default_prefix));
    config.guard.assert_path_allowed(&prefix)?;

    if config.scheme == "s3" {
        return crate::s3http::list(config, params).await;
    }
    if config.scheme == "sftp" {
        return crate::sftp::list(config, params).await;
    }
    let op = op.ok_or_else(|| plugin_err("连接尚未就绪"))?;

    // Try several OpenDAL list modes. Some MinIO/ingress setups return an empty
    // page for delimiter listings even when keys exist.
    let attempts = [
        ("shallow", false, None),
        ("recursive", true, None),
        ("recursive_limited", true, Some(1000usize)),
    ];
    let mut chosen: Vec<opendal::Entry> = Vec::new();
    let mut list_mode = "shallow";
    let mut raw_counts = serde_json::Map::new();
    let mut sample_paths: Vec<String> = Vec::new();
    let mut last_err: Option<String> = None;

    for (mode, recursive, limit) in attempts {
        let mut req = op.list_with(&prefix);
        if recursive {
            req = req.recursive(true);
        }
        if let Some(n) = limit {
            req = req.limit(n);
        }
        match req.await {
            Ok(entries) => {
                let raw = entries.len();
                raw_counts.insert(mode.to_string(), json!(raw));
                if sample_paths.is_empty() {
                    sample_paths = entries
                        .iter()
                        .take(12)
                        .map(|e| e.path().to_string())
                        .collect();
                }
                let children = entries
                    .iter()
                    .filter(|entry| !is_current_dir(entry.path(), &prefix))
                    .count();
                if children > 0 || chosen.is_empty() {
                    chosen = entries;
                    list_mode = mode;
                }
                if children > 0 {
                    break;
                }
            }
            Err(e) => {
                raw_counts.insert(mode.to_string(), json!(null));
                last_err = Some(e.to_string());
            }
        }
    }

    if chosen.is_empty() {
        if let Some(err) = last_err {
            return Err(plugin_err(format!(
                "List failed for prefix '{prefix}': {err}"
            )));
        }
    }

    let mut items = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let mut skipped = 0u64;
    for entry in &chosen {
        let path = entry.path().to_string();
        let meta = entry.metadata();
        let Some((name, is_dir, child_path)) = child_row(&prefix, &path, meta) else {
            skipped += 1;
            continue;
        };
        if !seen.insert(name.clone()) {
            continue;
        }
        items.push(json!({
            "name": name,
            "path": child_path,
            "type": if is_dir { "DIR" } else { "FILE" },
            "size": if is_dir { 0 } else { meta.content_length() },
            "modified": ts_string(meta),
            "etag": meta.etag().unwrap_or("").to_string(),
            "contentType": meta.content_type().unwrap_or("").to_string(),
            "storageClass": "",
        }));
    }
    items.sort_by(|a, b| {
        let ta = a.get("type").and_then(Value::as_str).unwrap_or("");
        let tb = b.get("type").and_then(Value::as_str).unwrap_or("");
        match (ta, tb) {
            ("DIR", "FILE") => std::cmp::Ordering::Less,
            ("FILE", "DIR") => std::cmp::Ordering::Greater,
            _ => a
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_ascii_lowercase()
                .cmp(
                    &b.get("name")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_ascii_lowercase(),
                ),
        }
    });

    let total_size: u64 = items
        .iter()
        .filter_map(|i| i.get("size").and_then(Value::as_u64))
        .sum();

    Ok(json!({
        "prefix": prefix,
        "items": items,
        "count": items.len(),
        "totalSize": total_size,
        "listMode": list_mode,
        "debug": {
            "scheme": config.scheme,
            "endpoint": config.endpoint_label,
            "scope": config.scope_label,
            "hasAccessKey": config
                .raw
                .get("connection_secrets")
                .and_then(|v| v.get("access_key_id"))
                .and_then(Value::as_str)
                .map(|s| !s.is_empty())
                .unwrap_or(false),
            "hasSecretKey": config
                .raw
                .get("connection_secrets")
                .and_then(|v| v.get("secret_access_key"))
                .and_then(Value::as_str)
                .map(|s| !s.is_empty())
                .unwrap_or(false),
            "hasUser": config
                .raw
                .get("user")
                .and_then(Value::as_str)
                .map(|s| !s.is_empty())
                .unwrap_or(false),
            "hasPassword": config
                .raw
                .get("password")
                .and_then(Value::as_str)
                .map(|s| !s.is_empty())
                .unwrap_or(false),
            "rawCounts": raw_counts,
            "rawChosen": chosen.len(),
            "skipped": skipped,
            "samplePaths": sample_paths,
        }
    }))
}

fn is_current_dir(path: &str, prefix: &str) -> bool {
    let path = path.trim_matches('/');
    let prefix = prefix.trim_matches('/');
    path.is_empty() || path == prefix
}

/// One visible row under `prefix`: a direct file, or the first folder segment.
fn child_row(prefix: &str, path: &str, meta: &opendal::Metadata) -> Option<(String, bool, String)> {
    let prefix_trim = prefix.trim_matches('/');
    let path_trim = path.trim_matches('/');
    let rest = if prefix_trim.is_empty() {
        path_trim
    } else {
        path_trim
            .strip_prefix(prefix_trim)?
            .trim_start_matches('/')
    };
    if rest.is_empty() {
        return None;
    }
    if let Some((head, _)) = rest.split_once('/') {
        if head.is_empty() {
            return None;
        }
        let child = if prefix_trim.is_empty() {
            format!("{head}/")
        } else {
            format!("{prefix_trim}/{head}/")
        };
        Some((head.to_string(), true, child))
    } else {
        let is_dir = matches!(meta.mode(), EntryMode::DIR) || path.ends_with('/');
        let child = if is_dir {
            if path.ends_with('/') {
                path.to_string()
            } else {
                format!("{path}/")
            }
        } else {
            path_trim.to_string()
        };
        Some((rest.to_string(), is_dir, child))
    }
}

pub async fn stat(op: Option<&Operator>, config: &MountConfig, params: &Value) -> Result<Value, PluginError> {
    let path = normalize_object_path(required_string(params, "path")?);
    if config.scheme == "s3" {
        if path.ends_with('/') {
            return Ok(json!({
                "path": path,
                "type": "DIR",
                "size": 0,
                "modified": "",
                "etag": "",
                "contentType": "",
                "contentDisposition": "",
            }));
        }
        let (size, content_type) = crate::s3http::head_object(config, &path).await?;
        return Ok(json!({
            "path": path,
            "type": "FILE",
            "size": size,
            "modified": "",
            "etag": "",
            "contentType": content_type,
            "contentDisposition": "",
        }));
    }
    if config.scheme == "sftp" {
        let (is_dir, size) = crate::sftp::stat(&config.id, &path).await?;
        return Ok(json!({
            "path": path,
            "type": if is_dir { "DIR" } else { "FILE" },
            "size": size,
            "modified": "",
            "etag": "",
            "contentType": "",
            "contentDisposition": "",
        }));
    }
    let op = op.ok_or_else(|| plugin_err("连接尚未就绪"))?;
    let meta = op
        .stat(&path)
        .await
        .map_err(|e| plugin_err(e.to_string()))?;
    Ok(json!({
        "path": path,
        "type": if matches!(meta.mode(), EntryMode::DIR) { "DIR" } else { "FILE" },
        "size": meta.content_length(),
        "modified": ts_string(&meta),
        "etag": meta.etag().unwrap_or("").to_string(),
        "contentType": meta.content_type().unwrap_or("").to_string(),
        "contentDisposition": meta.content_disposition().unwrap_or("").to_string(),
    }))
}

pub async fn mkdir(
    op: Option<&Operator>,
    config: &MountConfig,
    guard: &GuardState,
    params: &Value,
) -> Result<Value, PluginError> {
    config.guard.assert_writable()?;
    let path = normalize_prefix(required_string(params, "path")?);
    config.guard.assert_path_allowed(&path)?;
    if config.scheme == "s3" {
        crate::s3http::mkdir_object(config, &path).await?;
    } else if config.scheme == "sftp" {
        crate::sftp::mkdir(&config.id, &path).await?;
    } else {
        let op = op.ok_or_else(|| plugin_err("连接尚未就绪"))?;
        op.create_dir(&path)
            .await
            .map_err(|e| plugin_err(e.to_string()))?;
    }
    guard.audit(&config.id, "mkdir", &path, "", true);
    Ok(json!({ "success": true, "path": path }))
}

pub async fn delete_path(
    op: Option<&Operator>,
    config: &MountConfig,
    guard: &GuardState,
    params: &Value,
    confirmed: bool,
) -> Result<Value, PluginError> {
    config.guard.assert_writable()?;
    if config.guard.deny_delete {
        return Err(plugin_err("Delete is denied by Guard policy"));
    }
    let path = normalize_object_path(required_string(params, "path")?);
    config.guard.assert_path_allowed(&path)?;

    if config.guard.require_confirm_delete && !confirmed {
        let pending = guard.enqueue_confirm(
            &config.id,
            "delete",
            &path,
            "Recursive/object delete requires confirmation",
        );
        return Ok(json!({
            "success": false,
            "needsConfirm": true,
            "pendingId": pending.id,
            "message": "Delete queued for Guard confirmation",
        }));
    }

    let recursive = params
        .get("recursive")
        .and_then(Value::as_bool)
        .unwrap_or(true);
    if config.scheme == "s3" {
        crate::s3http::delete_object(config, &path, recursive).await?;
    } else if config.scheme == "sftp" {
        crate::sftp::delete(&config.id, &path, recursive).await?;
    } else if recursive {
        let op = op.ok_or_else(|| plugin_err("连接尚未就绪"))?;
        op.delete_with(&path)
            .recursive(true)
            .await
            .map_err(|e| plugin_err(e.to_string()))?;
    } else {
        let op = op.ok_or_else(|| plugin_err("连接尚未就绪"))?;
        op.delete(&path)
            .await
            .map_err(|e| plugin_err(e.to_string()))?;
    }
    guard.audit(&config.id, "delete", &path, "", true);
    Ok(json!({ "success": true, "path": path }))
}

pub async fn put_bytes(
    op: Option<&Operator>,
    config: &MountConfig,
    guard: &GuardState,
    params: &Value,
) -> Result<Value, PluginError> {
    config.guard.assert_writable()?;
    let path = normalize_object_path(required_string(params, "path")?);
    config.guard.assert_path_allowed(&path)?;
    let b64 = required_string(params, "contentBase64")?;
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64)
        .map_err(|e| plugin_err(format!("Invalid base64: {e}")))?;
    config.guard.assert_upload_size(bytes.len() as u64)?;
    if config.scheme == "s3" {
        crate::s3http::put_object(config, &path, &bytes).await?;
    } else if config.scheme == "sftp" {
        crate::sftp::write_all(&config.id, &path, &bytes).await?;
    } else {
        let op = op.ok_or_else(|| plugin_err("连接尚未就绪"))?;
        op.write(&path, bytes)
            .await
            .map_err(|e| plugin_err(e.to_string()))?;
    }
    guard.audit(&config.id, "put", &path, "", true);
    Ok(json!({ "success": true, "path": path }))
}

pub async fn read_bytes(
    op: Option<&Operator>,
    config: &MountConfig,
    params: &Value,
) -> Result<Value, PluginError> {
    let path = normalize_object_path(required_string(params, "path")?);
    let max = params
        .get("maxBytes")
        .and_then(Value::as_u64)
        .unwrap_or(4 * 1024 * 1024);
    if config.scheme == "s3" {
        let (bytes, content_type) = crate::s3http::read_object(config, &path, max).await?;
        use base64::Engine;
        let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
        return Ok(json!({
            "path": path,
            "size": bytes.len(),
            "contentBase64": b64,
            "contentType": content_type,
        }));
    }
    if config.scheme == "sftp" {
        let bytes = crate::sftp::read_all(&config.id, &path).await?;
        if bytes.len() as u64 > max {
            return Err(plugin_err(format!(
                "文件有 {} 字节，超过下载上限 {max}。请改用传输任务。",
                bytes.len()
            )));
        }
        use base64::Engine;
        let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
        return Ok(json!({
            "path": path,
            "size": bytes.len(),
            "contentBase64": b64,
            "contentType": "",
        }));
    }
    let op = op.ok_or_else(|| plugin_err("连接尚未就绪"))?;
    let meta = op
        .stat(&path)
        .await
        .map_err(|e| plugin_err(e.to_string()))?;
    if meta.content_length() > max {
        return Err(plugin_err(format!(
            "Object is {} bytes; maxBytes={max}. Use transfer/download instead.",
            meta.content_length()
        )));
    }
    let buf = op
        .read(&path)
        .await
        .map_err(|e| plugin_err(e.to_string()))?;
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(buf.to_bytes());
    Ok(json!({
        "path": path,
        "size": meta.content_length(),
        "contentBase64": b64,
        "contentType": meta.content_type().unwrap_or("").to_string(),
    }))
}
