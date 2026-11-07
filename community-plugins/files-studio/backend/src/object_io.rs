//! Scheme-aware read / write / list used by transfers and archives.
//!
//! S3 goes through signed HTTP so account-root paths (`bucket/key`) hit the
//! real bucket. SFTP uses the live SSH session. Everything else uses OpenDAL.

use datawise_plugin_sdk::PluginError;
use opendal::Operator;

use crate::connection::MountConfig;
use crate::util::plugin_err;

pub async fn file_len(
    config: &MountConfig,
    op: Option<&Operator>,
    path: &str,
) -> Result<u64, PluginError> {
    match config.scheme.as_str() {
        "s3" => Ok(crate::s3http::head_object(config, path).await?.0),
        "sftp" => crate::sftp::file_len(&config.id, path).await,
        _ => {
            let op = op.ok_or_else(|| plugin_err("连接尚未就绪"))?;
            let meta = op.stat(path).await.map_err(|e| plugin_err(e.to_string()))?;
            Ok(meta.content_length())
        }
    }
}

pub async fn is_dir(
    config: &MountConfig,
    op: Option<&Operator>,
    path: &str,
) -> Result<bool, PluginError> {
    if path.is_empty() || path.ends_with('/') {
        return Ok(true);
    }
    match config.scheme.as_str() {
        "s3" => match crate::s3http::head_object(config, path).await {
            Ok(_) => Ok(false),
            Err(_) => {
                let kids = crate::s3http::list_file_paths(config, path).await?;
                Ok(!kids.is_empty())
            }
        },
        "sftp" => Ok(crate::sftp::stat(&config.id, path).await?.0),
        _ => {
            let op = op.ok_or_else(|| plugin_err("连接尚未就绪"))?;
            let meta = op.stat(path).await.map_err(|e| plugin_err(e.to_string()))?;
            Ok(meta.is_dir())
        }
    }
}

pub async fn exists(
    config: &MountConfig,
    op: Option<&Operator>,
    path: &str,
) -> Result<bool, PluginError> {
    match file_len(config, op, path).await {
        Ok(_) => Ok(true),
        Err(e) if e.message.contains("不存在") || e.message.contains("NotFound") => Ok(false),
        Err(e) => {
            let lower = e.message.to_ascii_lowercase();
            if lower.contains("not found") || lower.contains("no such") || lower.contains("404") {
                Ok(false)
            } else {
                Err(e)
            }
        }
    }
}

pub async fn read_all(
    config: &MountConfig,
    op: Option<&Operator>,
    path: &str,
) -> Result<Vec<u8>, PluginError> {
    match config.scheme.as_str() {
        "s3" => Ok(crate::s3http::read_object(config, path, u64::MAX).await?.0),
        "sftp" => crate::sftp::read_all(&config.id, path).await,
        _ => {
            let op = op.ok_or_else(|| plugin_err("连接尚未就绪"))?;
            let buf = op.read(path).await.map_err(|e| plugin_err(e.to_string()))?;
            Ok(buf.to_bytes().to_vec())
        }
    }
}

pub async fn write_all(
    config: &MountConfig,
    op: Option<&Operator>,
    path: &str,
    bytes: Vec<u8>,
) -> Result<(), PluginError> {
    match config.scheme.as_str() {
        "s3" => crate::s3http::put_object(config, path, &bytes).await,
        "sftp" => crate::sftp::write_all(&config.id, path, &bytes).await,
        _ => {
            let op = op.ok_or_else(|| plugin_err("连接尚未就绪"))?;
            op.write(path, bytes)
                .await
                .map(|_| ())
                .map_err(|e| plugin_err(e.to_string()))
        }
    }
}

/// Object paths of files under `prefix` (not directories).
pub async fn list_files(
    config: &MountConfig,
    op: Option<&Operator>,
    prefix: &str,
) -> Result<Vec<String>, PluginError> {
    match config.scheme.as_str() {
        "s3" => crate::s3http::list_file_paths(config, prefix).await,
        "sftp" => crate::sftp::list_files(&config.id, prefix).await,
        _ => {
            let op = op.ok_or_else(|| plugin_err("连接尚未就绪"))?;
            let list_prefix = if prefix.is_empty() {
                String::new()
            } else if prefix.ends_with('/') {
                prefix.to_string()
            } else {
                format!("{prefix}/")
            };
            let entries = op
                .list_with(&list_prefix)
                .recursive(true)
                .await
                .map_err(|e| plugin_err(e.to_string()))?;
            let mut paths = Vec::new();
            for entry in entries {
                let path = entry.path().to_string();
                if path.ends_with('/') || entry.metadata().is_dir() {
                    continue;
                }
                paths.push(path.trim_start_matches('/').to_string());
            }
            Ok(paths)
        }
    }
}
