//! Signed S3 ListBuckets / ListObjectsV2.
//!
//! OpenDAL's list can come back empty against some MinIO gateways even when the
//! same keys return objects. Browser listing goes through this request so a
//! non-200 response is shown instead of a blank table.

use datawise_plugin_sdk::PluginError;
use hmac::{Hmac, Mac};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use crate::connection::{s3_settings, MountConfig, S3Settings};
use crate::util::{normalize_prefix, plugin_err};

type HmacSha256 = Hmac<Sha256>;

const EMPTY_SHA256: &str = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

#[derive(Clone)]
struct Target {
    origin: String,
    host: String,
    region: String,
    access_key: String,
    secret_key: String,
    bucket: String,
}

pub async fn probe(config: &MountConfig) -> Result<String, String> {
    let settings = s3_settings(config).map_err(|e| e.message.clone())?;
    let target = target_from(&settings)?;
    if settings.bucket.is_empty() {
        let names = list_bucket_names(&target).await?;
        Ok(format!(
            "已连接 {}，账号下有 {} 个存储桶",
            target.origin,
            names.len()
        ))
    } else {
        let rows = list_objects(&target, &config.default_prefix).await?;
        Ok(format!(
            "已连接 {}/{}，当前前缀有 {} 项",
            target.origin, settings.bucket, rows.len()
        ))
    }
}

pub async fn list(config: &MountConfig, params: &Value) -> Result<Value, PluginError> {
    let settings = s3_settings(config)?;
    let prefix = params
        .get("prefix")
        .and_then(Value::as_str)
        .map(normalize_prefix)
        .unwrap_or_else(|| normalize_prefix(&config.default_prefix));
    config.guard.assert_path_allowed(&prefix)?;

    let target = target_from(&settings).map_err(plugin_err)?;
    let (items, detail) = if settings.bucket.is_empty() {
        list_account(&target, &prefix).await.map_err(plugin_err)?
    } else {
        let rows = list_objects(&target, &prefix).await.map_err(plugin_err)?;
        let detail = format!(
            "桶 {} · AccessKey={} · {}",
            settings.bucket,
            settings.access_key,
            target.origin
        );
        (rows_to_items(&prefix, &rows, false), detail)
    };

    let total_size: u64 = items
        .iter()
        .filter_map(|i| i.get("size").and_then(Value::as_u64))
        .sum();
    Ok(json!({
        "prefix": prefix,
        "items": items,
        "count": items.len(),
        "totalSize": total_size,
        "listMode": "s3",
        "debug": {
            "scheme": "s3",
            "endpoint": config.endpoint_label,
            "scope": config.scope_label,
            "hasAccessKey": true,
            "hasSecretKey": true,
            "accessKeyId": settings.access_key,
            "bucket": settings.bucket,
            "detail": detail,
            "rawChosen": items.len(),
            "skipped": 0,
            "samplePaths": items.iter().take(8).filter_map(|i| i.get("path").and_then(Value::as_str)).collect::<Vec<_>>(),
        }
    }))
}

async fn list_account(target: &Target, prefix: &str) -> Result<(Vec<Value>, String), String> {
    let trimmed = prefix.trim_matches('/');
    if trimmed.is_empty() {
        let names = list_bucket_names(target).await?;
        let detail = format!("账号根目录 · AccessKey={} · {}", target.access_key, target.origin);
        let items = names
            .into_iter()
            .map(|name| {
                json!({
                    "name": name,
                    "path": format!("{name}/"),
                    "type": "DIR",
                    "size": 0,
                    "modified": "",
                    "etag": "",
                    "contentType": "",
                    "storageClass": "",
                })
            })
            .collect();
        return Ok((items, detail));
    }
    let (bucket, rest) = trimmed
        .split_once('/')
        .map(|(b, r)| (b.to_string(), r.to_string()))
        .unwrap_or_else(|| (trimmed.to_string(), String::new()));
    let mut scoped = target.clone();
    scoped.bucket = bucket.clone();
    let rows = list_objects(&scoped, &rest).await?;
    let mut items = rows_to_items(&rest, &rows, true);
    for item in &mut items {
        if let Some(path) = item.get("path").and_then(Value::as_str) {
            item["path"] = json!(format!("{bucket}/{path}"));
        }
    }
    let detail = format!("桶 {bucket} · AccessKey={} · {}", target.access_key, target.origin);
    Ok((items, detail))
}

fn rows_to_items(prefix: &str, rows: &[ObjectRow], account: bool) -> Vec<Value> {
    let _ = account;
    let base = prefix.trim_matches('/');
    rows.iter()
        .map(|row| {
            let path = if base.is_empty() {
                row.rel.clone()
            } else if row.rel.starts_with(base) {
                row.rel.clone()
            } else {
                format!("{base}/{}", row.rel.trim_start_matches('/'))
            };
            json!({
                "name": row.name,
                "path": path,
                "type": if row.is_dir { "DIR" } else { "FILE" },
                "size": if row.is_dir { 0 } else { row.size },
                "modified": row.modified,
                "etag": "",
                "contentType": "",
                "storageClass": "",
            })
        })
        .collect()
}

struct ObjectRow {
    name: String,
    rel: String,
    is_dir: bool,
    size: u64,
    modified: String,
}

async fn list_bucket_names(target: &Target) -> Result<Vec<String>, String> {
    let (status, body) = signed_get(target, "/", &[]).await?;
    ensure_s3_body(status, &body)?;
    let mut names = Vec::new();
    for chunk in body.split("<Bucket>") {
        if let Some(name) = tag_text(chunk, "Name") {
            if !name.is_empty() {
                names.push(name);
            }
        }
    }
    names.sort();
    names.dedup();
    Ok(names)
}

async fn list_object_keys_flat(target: &Target, prefix: &str) -> Result<Vec<String>, String> {
    if target.bucket.is_empty() {
        return Err("缺少存储桶".into());
    }
    let object_prefix = prefix.trim_matches('/');
    let path = format!("/{}", aws_encode(&target.bucket));
    let mut keys = Vec::new();
    let mut token = String::new();
    for _ in 0..50 {
        let mut query = vec![
            ("list-type".to_string(), "2".to_string()),
            ("max-keys".to_string(), "1000".to_string()),
        ];
        if !object_prefix.is_empty() {
            query.push(("prefix".to_string(), format!("{object_prefix}/")));
        }
        if !token.is_empty() {
            query.push(("continuation-token".to_string(), token.clone()));
        }
        let (status, body) = signed_get(target, &path, &query).await?;
        ensure_s3_body(status, &body)?;
        for chunk in body.split("<Contents>") {
            if let Some(key) = tag_text(chunk, "Key") {
                if !key.is_empty() {
                    keys.push(key);
                }
            }
        }
        let truncated = tag_text(&body, "IsTruncated").unwrap_or_default();
        if !truncated.eq_ignore_ascii_case("true") {
            break;
        }
        token = tag_text(&body, "NextContinuationToken").unwrap_or_default();
        if token.is_empty() {
            break;
        }
    }
    if !object_prefix.is_empty() {
        keys.push(format!("{object_prefix}/"));
    }
    keys.sort();
    keys.dedup();
    Ok(keys)
}

/// File keys under a UI path. Account-root paths stay `bucket/key`.
pub async fn list_file_paths(config: &MountConfig, prefix: &str) -> Result<Vec<String>, PluginError> {
    let settings = s3_settings(config)?;
    let target = target_from(&settings).map_err(plugin_err)?;
    let trimmed = prefix.trim().trim_matches('/');
    let (bucket, key_prefix, ui_bucket) = if settings.bucket.is_empty() {
        if trimmed.is_empty() {
            return Err(plugin_err("请先进入某个存储桶再打包"));
        }
        let (bucket, rest) = trimmed
            .split_once('/')
            .map(|(b, r)| (b.to_string(), r.to_string()))
            .unwrap_or_else(|| (trimmed.to_string(), String::new()));
        (bucket, key_prefix_clean(&rest), true)
    } else {
        (settings.bucket.clone(), key_prefix_clean(trimmed), false)
    };
    let mut scoped = target;
    scoped.bucket = bucket.clone();
    let keys = list_object_keys_flat(&scoped, &key_prefix).await.map_err(plugin_err)?;
    let mut paths = Vec::new();
    for key in keys {
        if key.ends_with('/') {
            continue;
        }
        if ui_bucket {
            paths.push(format!("{bucket}/{key}"));
        } else {
            paths.push(key);
        }
    }
    Ok(paths)
}

fn key_prefix_clean(prefix: &str) -> String {
    prefix.trim_matches('/').to_string()
}

/// Copy an object onto itself (or another key) and optionally set storage class.
pub async fn copy_object(
    config: &MountConfig,
    source_path: &str,
    dest_path: &str,
    storage_class: Option<&str>,
) -> Result<(), PluginError> {
    let settings = s3_settings(config)?;
    let (src_bucket, src_key) = resolve_bucket_key(&settings, source_path).map_err(plugin_err)?;
    let (dst_bucket, dst_key) = resolve_bucket_key(&settings, dest_path).map_err(plugin_err)?;
    if src_key.is_empty() || src_key.ends_with('/') || dst_key.is_empty() || dst_key.ends_with('/') {
        return Err(plugin_err("存储类变更只能作用于文件，不能是存储桶或文件夹"));
    }
    let mut target = target_from(&settings).map_err(plugin_err)?;
    target.bucket = dst_bucket.clone();
    let uri = object_canonical_path(&dst_bucket, &dst_key);
    let copy_source = format!(
        "/{}/{}",
        aws_encode(&src_bucket),
        src_key
            .split('/')
            .filter(|s| !s.is_empty())
            .map(aws_encode)
            .collect::<Vec<_>>()
            .join("/")
    );
    let class = storage_class.unwrap_or("").trim();
    let mut extra = vec![
        ("x-amz-copy-source", copy_source.as_str()),
        ("x-amz-metadata-directive", "COPY"),
    ];
    if !class.is_empty() {
        extra.push(("x-amz-storage-class", class));
    }
    let (status, bytes, _, _) = signed_exchange(&target, "PUT", &uri, &[], &extra, &[])
        .await
        .map_err(plugin_err)?;
    let text = String::from_utf8_lossy(&bytes);
    if !(200..300).contains(&status) || text.contains("<Error>") {
        return Err(plugin_err(format_s3_error(status, &text)));
    }
    Ok(())
}

async fn list_objects(target: &Target, prefix: &str) -> Result<Vec<ObjectRow>, String> {
    if target.bucket.is_empty() {
        return Err("缺少存储桶".into());
    }
    let mut query = vec![
        ("delimiter".to_string(), "/".to_string()),
        ("list-type".to_string(), "2".to_string()),
        ("max-keys".to_string(), "1000".to_string()),
    ];
    let object_prefix = prefix.trim_matches('/');
    if !object_prefix.is_empty() {
        query.push(("prefix".to_string(), format!("{object_prefix}/")));
    }
    let path = format!("/{}", aws_encode(&target.bucket));
    let (status, body) = signed_get(target, &path, &query).await?;
    ensure_s3_body(status, &body)?;

    let mut rows = Vec::new();
    for chunk in body.split("<CommonPrefixes>") {
        if let Some(p) = tag_text(chunk, "Prefix") {
            let rel = p.trim_matches('/');
            let name = rel.rsplit('/').next().unwrap_or(rel).to_string();
            if name.is_empty() {
                continue;
            }
            rows.push(ObjectRow {
                name,
                rel: if p.ends_with('/') {
                    p
                } else {
                    format!("{p}/")
                },
                is_dir: true,
                size: 0,
                modified: String::new(),
            });
        }
    }
    for chunk in body.split("<Contents>") {
        let Some(key) = tag_text(chunk, "Key") else {
            continue;
        };
        if key.ends_with('/') {
            continue;
        }
        let rel = key.trim_start_matches('/');
        let name = rel.rsplit('/').next().unwrap_or(rel).to_string();
        if name.is_empty() {
            continue;
        }
        // Keep only the immediate child when a prefix is set.
        let under = if object_prefix.is_empty() {
            rel
        } else {
            let head = format!("{object_prefix}/");
            let Some(rest) = rel.strip_prefix(&head) else {
                continue;
            };
            rest
        };
        if under.contains('/') {
            continue;
        }
        rows.push(ObjectRow {
            name,
            rel: rel.to_string(),
            is_dir: false,
            size: tag_text(chunk, "Size").and_then(|s| s.parse().ok()).unwrap_or(0),
            modified: tag_text(chunk, "LastModified").unwrap_or_default(),
        });
    }
    rows.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_ascii_lowercase().cmp(&b.name.to_ascii_lowercase()),
    });
    Ok(rows)
}

fn ensure_s3_body(status: u16, body: &str) -> Result<(), String> {
    let lower = body.trim_start().to_ascii_lowercase();
    if lower.starts_with("<!doctype html") || lower.starts_with("<html") {
        return Err(format!(
            "端点返回的是网页（HTTP {status}），不是 S3 接口。请换成 API 端口。"
        ));
    }
    if !(200..300).contains(&status) {
        let code = tag_text(body, "Code").unwrap_or_else(|| format!("HTTP {status}"));
        let message = tag_text(body, "Message").unwrap_or_else(|| body.chars().take(180).collect());
        return Err(format!("MinIO 拒绝了列表请求：{code} {message}"));
    }
    Ok(())
}

fn tag_text(xml: &str, tag: &str) -> Option<String> {
    let open = format!("<{tag}");
    let start = xml.find(&open)?;
    let after = &xml[start + open.len()..];
    let gt = after.find('>')?;
    let rest = &after[gt + 1..];
    let close = format!("</{tag}>");
    let end = rest.find(&close)?;
    Some(rest[..end].trim().to_string())
}

fn target_from(settings: &S3Settings) -> Result<Target, String> {
    let endpoint = settings.endpoint.trim().trim_end_matches('/');
    let rest = endpoint
        .strip_prefix("https://")
        .or_else(|| endpoint.strip_prefix("http://"))
        .ok_or_else(|| format!("端点需要 http:// 或 https://，当前是 {endpoint}"))?;
    let host = rest.split('/').next().unwrap_or(rest);
    if host.is_empty() {
        return Err("端点缺少主机".into());
    }
    let origin = if endpoint.starts_with("https://") {
        format!("https://{host}")
    } else {
        format!("http://{host}")
    };
    Ok(Target {
        origin,
        host: host.to_string(),
        region: settings.region.clone(),
        access_key: settings.access_key.clone(),
        secret_key: settings.secret_key.clone(),
        bucket: settings.bucket.clone(),
    })
}

/// Split a UI path into `(bucket, object_key)`.
///
/// When the mount has no bucket (account root), the first path segment is the
/// real bucket name — never the OpenDAL placeholder `datawise-account-root`.
fn resolve_bucket_key(settings: &S3Settings, path: &str) -> Result<(String, String), String> {
    let path = path.trim().trim_start_matches('/');
    if path.is_empty() {
        return Err("路径为空".into());
    }
    if !settings.bucket.is_empty() {
        return Ok((settings.bucket.clone(), path.to_string()));
    }
    match path.split_once('/') {
        Some((bucket, key)) if !bucket.is_empty() => Ok((bucket.to_string(), key.to_string())),
        Some((bucket, _)) if !bucket.is_empty() => Ok((bucket.to_string(), String::new())),
        _ => Err("请先进入某个存储桶，再上传或下载文件".into()),
    }
}

fn object_canonical_path(bucket: &str, key: &str) -> String {
    let mut out = format!("/{}", aws_encode(bucket));
    let trimmed = key.trim_start_matches('/');
    if trimmed.is_empty() {
        return out;
    }
    for seg in trimmed.split('/') {
        if seg.is_empty() {
            continue;
        }
        out.push('/');
        out.push_str(&aws_encode(seg));
    }
    if key.ends_with('/') && !out.ends_with('/') {
        out.push('/');
    }
    out
}

pub async fn head_object(config: &MountConfig, path: &str) -> Result<(u64, String), PluginError> {
    let settings = s3_settings(config)?;
    let (bucket, key) = resolve_bucket_key(&settings, path).map_err(plugin_err)?;
    if key.is_empty() || key.ends_with('/') {
        return Ok((0, String::new()));
    }
    let mut target = target_from(&settings).map_err(plugin_err)?;
    target.bucket = bucket.clone();
    let uri = object_canonical_path(&bucket, &key);
    let (status, bytes, content_type, content_length) =
        signed_exchange(&target, "HEAD", &uri, &[], &[], &[])
            .await
            .map_err(plugin_err)?;
    if status == 404 {
        return Err(plugin_err(format!("对象不存在：{bucket}/{key}")));
    }
    if !(200..300).contains(&status) {
        let text = String::from_utf8_lossy(&bytes);
        return Err(plugin_err(format_s3_error(status, &text)));
    }
    Ok((content_length, content_type))
}

pub async fn read_object(
    config: &MountConfig,
    path: &str,
    max_bytes: u64,
) -> Result<(Vec<u8>, String), PluginError> {
    let settings = s3_settings(config)?;
    let (bucket, key) = resolve_bucket_key(&settings, path).map_err(plugin_err)?;
    if key.is_empty() || key.ends_with('/') {
        return Err(plugin_err("不能下载文件夹，请选择文件"));
    }
    let mut target = target_from(&settings).map_err(plugin_err)?;
    target.bucket = bucket.clone();
    let uri = object_canonical_path(&bucket, &key);
    let (head_status, _, content_type_head, content_length) =
        signed_exchange(&target, "HEAD", &uri, &[], &[], &[])
            .await
            .map_err(plugin_err)?;
    if head_status == 404 {
        return Err(plugin_err(format!("对象不存在：{bucket}/{key}")));
    }
    if !(200..300).contains(&head_status) {
        return Err(plugin_err(format!(
            "无法读取对象：HTTP {head_status} {bucket}/{key}"
        )));
    }
    if content_length > max_bytes {
        return Err(plugin_err(format!(
            "文件有 {content_length} 字节，超过下载上限 {max_bytes}。请改用传输任务。"
        )));
    }
    let (status, bytes, content_type, _) = signed_exchange(&target, "GET", &uri, &[], &[], &[])
        .await
        .map_err(plugin_err)?;
    if status == 404 {
        return Err(plugin_err(format!("对象不存在：{bucket}/{key}")));
    }
    if !(200..300).contains(&status) {
        let text = String::from_utf8_lossy(&bytes);
        return Err(plugin_err(format_s3_error(status, &text)));
    }
    if bytes.len() as u64 > max_bytes {
        return Err(plugin_err(format!(
            "文件有 {} 字节，超过下载上限 {max_bytes}。请改用传输任务。",
            bytes.len()
        )));
    }
    let content_type = if content_type.is_empty() {
        content_type_head
    } else {
        content_type
    };
    Ok((bytes, content_type))
}

pub async fn put_object(config: &MountConfig, path: &str, body: &[u8]) -> Result<(), PluginError> {
    let settings = s3_settings(config)?;
    let (bucket, key) = resolve_bucket_key(&settings, path).map_err(plugin_err)?;
    if key.is_empty() || key.ends_with('/') {
        return Err(plugin_err("上传路径必须是文件名"));
    }
    let mut target = target_from(&settings).map_err(plugin_err)?;
    target.bucket = bucket.clone();
    let uri = object_canonical_path(&bucket, &key);
    let (status, bytes, _, _) = signed_exchange(&target, "PUT", &uri, &[], &[], body)
        .await
        .map_err(plugin_err)?;
    if !(200..300).contains(&status) {
        let text = String::from_utf8_lossy(&bytes);
        return Err(plugin_err(format_s3_error(status, &text)));
    }
    Ok(())
}

pub async fn mkdir_object(config: &MountConfig, path: &str) -> Result<(), PluginError> {
    let settings = s3_settings(config)?;
    let mut dir = path.trim().trim_start_matches('/').to_string();
    if !dir.ends_with('/') {
        dir.push('/');
    }
    let (bucket, key) = resolve_bucket_key(&settings, &dir).map_err(plugin_err)?;
    if key.is_empty() {
        return Err(plugin_err("不能在账号根目录直接新建文件夹，请先进入存储桶"));
    }
    let mut target = target_from(&settings).map_err(plugin_err)?;
    target.bucket = bucket.clone();
    let uri = object_canonical_path(&bucket, &key);
    let (status, bytes, _, _) = signed_exchange(&target, "PUT", &uri, &[], &[], &[])
        .await
        .map_err(plugin_err)?;
    if !(200..300).contains(&status) {
        let text = String::from_utf8_lossy(&bytes);
        return Err(plugin_err(format_s3_error(status, &text)));
    }
    Ok(())
}

pub async fn delete_object(config: &MountConfig, path: &str, recursive: bool) -> Result<(), PluginError> {
    let settings = s3_settings(config)?;
    let (bucket, key) = resolve_bucket_key(&settings, path).map_err(plugin_err)?;
    let mut target = target_from(&settings).map_err(plugin_err)?;
    target.bucket = bucket.clone();

    if recursive && (key.is_empty() || key.ends_with('/') || path.ends_with('/')) {
        let prefix = key.trim_matches('/');
        let keys = list_object_keys_flat(&target, prefix).await.map_err(plugin_err)?;
        for k in keys {
            delete_one(&target, &bucket, &k).await.map_err(plugin_err)?;
        }
        return Ok(());
    }
    delete_one(&target, &bucket, &key).await.map_err(plugin_err)
}

async fn delete_one(target: &Target, bucket: &str, key: &str) -> Result<(), String> {
    if key.is_empty() {
        return Err("不能删除整个存储桶".into());
    }
    let uri = object_canonical_path(bucket, key);
    let (status, bytes, _, _) = signed_exchange(target, "DELETE", &uri, &[], &[], &[]).await?;
    if status == 404 {
        return Ok(());
    }
    if !(200..300).contains(&status) {
        let text = String::from_utf8_lossy(&bytes);
        return Err(format_s3_error(status, &text));
    }
    Ok(())
}

fn format_s3_error(status: u16, body: &str) -> String {
    let code = tag_text(body, "Code").unwrap_or_else(|| format!("HTTP {status}"));
    let message = tag_text(body, "Message").unwrap_or_else(|| body.chars().take(180).collect());
    format!("MinIO 请求失败：{code} {message}")
}

async fn signed_get(target: &Target, path: &str, query: &[(String, String)]) -> Result<(u16, String), String> {
    let (status, bytes, _, _) = signed_exchange(target, "GET", path, query, &[], &[]).await?;
    Ok((status, String::from_utf8_lossy(&bytes).into_owned()))
}

async fn signed_exchange(
    target: &Target,
    method: &str,
    path: &str,
    query: &[(String, String)],
    extra: &[(&str, &str)],
    body: &[u8],
) -> Result<(u16, Vec<u8>, String, u64), String> {
    let amz_date = chrono::Utc::now().format("%Y%m%dT%H%M%SZ").to_string();
    let date = &amz_date[..8];
    let payload_hash = if body.is_empty() {
        EMPTY_SHA256.to_string()
    } else {
        sha256_hex(body)
    };
    let mut pairs: Vec<(String, String)> = query
        .iter()
        .map(|(k, v)| (aws_encode(k), aws_encode(v)))
        .collect();
    pairs.sort();
    let canonical_query = pairs
        .iter()
        .map(|(k, v)| format!("{k}={v}"))
        .collect::<Vec<_>>()
        .join("&");
    let mut headers: Vec<(String, String)> = vec![
        ("host".into(), target.host.clone()),
        ("x-amz-content-sha256".into(), payload_hash.clone()),
        ("x-amz-date".into(), amz_date.clone()),
    ];
    for (name, value) in extra {
        headers.push((name.to_ascii_lowercase(), value.trim().to_string()));
    }
    headers.sort_by(|a, b| a.0.cmp(&b.0));
    let canonical_headers = headers
        .iter()
        .map(|(name, value)| format!("{name}:{value}\n"))
        .collect::<String>();
    let signed_names = headers
        .iter()
        .map(|(name, _)| name.as_str())
        .collect::<Vec<_>>()
        .join(";");
    let canonical = format!(
        "{method}\n{path}\n{canonical_query}\n{canonical_headers}\n{signed_names}\n{payload_hash}"
    );
    let scope = format!("{date}/{}/s3/aws4_request", target.region);
    let string_to_sign = format!(
        "AWS4-HMAC-SHA256\n{amz_date}\n{scope}\n{}",
        sha256_hex(canonical.as_bytes())
    );
    let signature = hex::encode(hmac_sha256(
        &signing_key(&target.secret_key, date, &target.region),
        string_to_sign.as_bytes(),
    ));
    let authorization = format!(
        "AWS4-HMAC-SHA256 Credential={}/{scope}, SignedHeaders={signed_names}, Signature={signature}",
        target.access_key
    );
    let url = if canonical_query.is_empty() {
        format!("{}{path}", target.origin)
    } else {
        format!("{}{path}?{canonical_query}", target.origin)
    };
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| e.to_string())?;
    let mut req = match method {
        "GET" => client.get(&url),
        "PUT" => client.put(&url),
        "DELETE" => client.delete(&url),
        "HEAD" => client.head(&url),
        other => return Err(format!("不支持的方法 {other}")),
    };
    req = req
        .header("x-amz-date", &amz_date)
        .header("x-amz-content-sha256", &payload_hash)
        .header("authorization", authorization);
    for (name, value) in &headers {
        if name == "host" || name == "x-amz-date" || name == "x-amz-content-sha256" {
            continue;
        }
        req = req.header(name.as_str(), value.as_str());
    }
    if method == "PUT" {
        req = req
            .header("content-length", body.len().to_string())
            .body(body.to_vec());
    }
    let response = req
        .send()
        .await
        .map_err(|e| format!("连不上 {}: {e}", target.origin))?;
    let status = response.status().as_u16();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    let content_length = response
        .headers()
        .get(reqwest::header::CONTENT_LENGTH)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(0);
    let bytes = response.bytes().await.map_err(|e| e.to_string())?.to_vec();
    let len = if content_length > 0 {
        content_length
    } else {
        bytes.len() as u64
    };
    Ok((status, bytes, content_type, len))
}

fn aws_encode(value: &str) -> String {
    let mut out = String::new();
    for b in value.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

fn sha256_hex(data: &[u8]) -> String {
    hex::encode(Sha256::digest(data))
}

fn hmac_sha256(key: &[u8], data: &[u8]) -> Vec<u8> {
    let mut mac = HmacSha256::new_from_slice(key).expect("hmac key");
    mac.update(data);
    mac.finalize().into_bytes().to_vec()
}

fn signing_key(secret: &str, date: &str, region: &str) -> Vec<u8> {
    let k_date = hmac_sha256(format!("AWS4{secret}").as_bytes(), date.as_bytes());
    let k_region = hmac_sha256(&k_date, region.as_bytes());
    let k_service = hmac_sha256(&k_region, b"s3");
    hmac_sha256(&k_service, b"aws4_request")
}
