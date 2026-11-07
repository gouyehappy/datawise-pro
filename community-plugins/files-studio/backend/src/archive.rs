use std::collections::HashMap;
use std::io::{Cursor, Read, Write};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use chrono::{SecondsFormat, Utc};
use datawise_plugin_sdk::{PluginEmitter, PluginError};
use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use flate2::Compression;
use serde_json::{json, Value};
use tar::Builder as TarBuilder;
use uuid::Uuid;

use crate::guard::GuardState;
use crate::mount::MountRegistry;
use crate::util::{normalize_object_path, plugin_err, required_string};

#[derive(Clone)]
pub struct ArchiveTask {
    pub id: String,
    pub kind: String,
    pub mount_id: String,
    pub source_path: String,
    pub dest_path: String,
    pub state: String,
    pub bytes_done: u64,
    pub last_error: String,
    pub created_at: String,
    pub updated_at: String,
}

impl ArchiveTask {
    fn to_json(&self) -> Value {
        json!({
            "id": self.id,
            "kind": self.kind,
            "mountId": self.mount_id,
            "sourcePath": self.source_path,
            "destPath": self.dest_path,
            "state": self.state,
            "bytesDone": self.bytes_done,
            "lastError": self.last_error,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
        })
    }
}

pub struct ArchiveManager {
    tasks: Mutex<HashMap<String, ArchiveTask>>,
    cancelled: Mutex<HashMap<String, bool>>,
}

impl ArchiveManager {
    pub fn new() -> Self {
        Self {
            tasks: Mutex::new(HashMap::new()),
            cancelled: Mutex::new(HashMap::new()),
        }
    }

    pub fn list(&self) -> Vec<Value> {
        let mut rows: Vec<_> = self.tasks.lock().unwrap().values().cloned().collect();
        rows.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        rows.into_iter().map(|t| t.to_json()).collect()
    }

    pub fn cancel(&self, id: &str) -> Result<Value, PluginError> {
        self.cancelled.lock().unwrap().insert(id.to_string(), true);
        if let Some(t) = self.tasks.lock().unwrap().get_mut(id) {
            if t.state != "completed" && t.state != "cancelled" {
                t.state = "cancelled".into();
                t.updated_at = Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true);
            }
            Ok(t.to_json())
        } else {
            Err(plugin_err(format!("Archive not found: {id}")))
        }
    }

    fn is_cancelled(&self, id: &str) -> bool {
        *self.cancelled.lock().unwrap().get(id).unwrap_or(&false)
    }

    pub fn create_and_spawn(
        self: &Arc<Self>,
        mounts: Arc<MountRegistry>,
        guard: Arc<GuardState>,
        runtime: &tokio::runtime::Runtime,
        params: Value,
        emitter: PluginEmitter,
    ) -> Result<Value, PluginError> {
        let kind = required_string(&params, "kind")?;
        if !matches!(kind, "pack" | "unpack" | "lifecycle") {
            return Err(plugin_err(format!("Unknown archive kind: {kind}")));
        }
        let mount_id = required_string(&params, "mountId")?.to_string();
        let source_path = normalize_object_path(required_string(&params, "sourcePath")?);
        let dest_path = if kind == "lifecycle" {
            params
                .get("destPath")
                .and_then(Value::as_str)
                .filter(|s| !s.is_empty())
                .map(normalize_object_path)
                .unwrap_or_else(|| source_path.clone())
        } else {
            normalize_object_path(required_string(&params, "destPath")?)
        };
        let format = params
            .get("format")
            .and_then(Value::as_str)
            .unwrap_or("tar.gz");
        let storage_class = params
            .get("storageClass")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .unwrap_or("STANDARD_IA")
            .to_string();

        let now = Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true);
        let id = Uuid::new_v4().to_string();
        let task = ArchiveTask {
            id: id.clone(),
            kind: kind.to_string(),
            mount_id: mount_id.clone(),
            source_path: source_path.clone(),
            dest_path: dest_path.clone(),
            state: "pending".into(),
            bytes_done: 0,
            last_error: String::new(),
            created_at: now.clone(),
            updated_at: now,
        };
        let snap = task.to_json();
        self.tasks.lock().unwrap().insert(id.clone(), task);

        let mgr = Arc::clone(self);
        let kind_owned = kind.to_string();
        let format_owned = format.to_string();
        runtime.spawn(async move {
            let _ = run_archive(
                mgr,
                mounts,
                guard,
                id,
                kind_owned,
                format_owned,
                storage_class,
                mount_id,
                source_path,
                dest_path,
                emitter,
            )
            .await;
        });
        Ok(snap)
    }
}

async fn run_archive(
    mgr: Arc<ArchiveManager>,
    mounts: Arc<MountRegistry>,
    guard: Arc<GuardState>,
    id: String,
    kind: String,
    format: String,
    storage_class: String,
    mount_id: String,
    source_path: String,
    dest_path: String,
    emitter: PluginEmitter,
) -> Result<(), PluginError> {
    {
        let mut map = mgr.tasks.lock().unwrap();
        if let Some(t) = map.get_mut(&id) {
            t.state = "running".into();
            t.updated_at = Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true);
        }
    }
    emit(&emitter, &mgr, &id);

    if mgr.is_cancelled(&id) {
        emit(&emitter, &mgr, &id);
        return Ok(());
    }

    let result = match kind.as_str() {
        "pack" => pack_prefix(&mounts, &mount_id, &source_path, &dest_path, &format).await,
        "unpack" => unpack_file(&mounts, &mount_id, &source_path, &dest_path).await,
        "lifecycle" => {
            set_storage_class(&mounts, &mount_id, &source_path, &dest_path, &storage_class).await
        }
        _ => Err(plugin_err("Unsupported archive kind")),
    };

    let cancelled = mgr.is_cancelled(&id);
    match result {
        Ok(bytes) => {
            let mut map = mgr.tasks.lock().unwrap();
            if let Some(t) = map.get_mut(&id) {
                if cancelled {
                    t.state = "cancelled".into();
                } else {
                    t.state = "completed".into();
                    t.bytes_done = bytes;
                }
                t.updated_at = Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true);
            }
            drop(map);
            if !cancelled {
                guard.audit(&mount_id, &kind, &dest_path, &source_path, true);
            }
        }
        Err(e) => {
            let msg = e.message.clone();
            let mut map = mgr.tasks.lock().unwrap();
            if let Some(t) = map.get_mut(&id) {
                if cancelled {
                    t.state = "cancelled".into();
                } else {
                    t.state = "failed".into();
                    t.last_error = msg.clone();
                }
                t.updated_at = Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true);
            }
            drop(map);
            if !cancelled {
                guard.audit(&mount_id, &kind, &dest_path, &msg, false);
            }
        }
    }
    emit(&emitter, &mgr, &id);
    Ok(())
}

fn emit(emitter: &PluginEmitter, mgr: &ArchiveManager, id: &str) {
    let _ = emitter.event(
        "files-studio/archive/progress",
        mgr.tasks
            .lock()
            .unwrap()
            .get(id)
            .map(|t| t.to_json())
            .unwrap_or(json!({})),
    );
}

async fn pack_prefix(
    mounts: &MountRegistry,
    mount_id: &str,
    source_path: &str,
    dest_path: &str,
    format: &str,
) -> Result<u64, PluginError> {
    let (cfg, op) = mounts.get(mount_id)?;
    cfg.guard.assert_writable()?;
    cfg.guard.assert_path_allowed(source_path)?;
    cfg.guard.assert_path_allowed(dest_path)?;

    let _started = Instant::now();
    let prefix = if source_path.is_empty() {
        String::new()
    } else if source_path.ends_with('/') {
        source_path.to_string()
    } else {
        format!("{source_path}/")
    };
    let paths = crate::object_io::list_files(&cfg, op.as_ref(), &prefix).await?;

    let mut files: Vec<(String, Vec<u8>)> = Vec::new();
    for path in paths {
        let name = path
            .strip_prefix(prefix.trim_matches('/'))
            .unwrap_or(path.as_str())
            .trim_start_matches('/')
            .to_string();
        if name.is_empty() {
            continue;
        }
        let data = crate::object_io::read_all(&cfg, op.as_ref(), &path).await?;
        files.push((name, data));
    }

    let format = format.to_string();
    let archive_bytes = tokio::task::spawn_blocking(move || build_archive_bytes(format, files))
        .await
        .map_err(|e| plugin_err(e.to_string()))??;

    let out_len = archive_bytes.len() as u64;
    crate::object_io::write_all(&cfg, op.as_ref(), dest_path, archive_bytes).await?;
    Ok(out_len)
}

async fn set_storage_class(
    mounts: &MountRegistry,
    mount_id: &str,
    source_path: &str,
    dest_path: &str,
    storage_class: &str,
) -> Result<u64, PluginError> {
    let (cfg, _) = mounts.get(mount_id)?;
    cfg.guard.assert_writable()?;
    cfg.guard.assert_path_allowed(source_path)?;
    cfg.guard.assert_path_allowed(dest_path)?;
    if cfg.scheme != "s3" {
        return Err(plugin_err("更改存储类只支持 S3 / MinIO"));
    }
    crate::s3http::copy_object(&cfg, source_path, dest_path, Some(storage_class)).await?;
    let (size, _) = crate::s3http::head_object(&cfg, dest_path).await?;
    Ok(size)
}

fn build_archive_bytes(
    format: String,
    files: Vec<(String, Vec<u8>)>,
) -> Result<Vec<u8>, PluginError> {
    if format == "zip" {
        let cursor = Cursor::new(Vec::new());
        let mut zip = zip::ZipWriter::new(cursor);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);
        for (name, bytes) in files {
            zip.start_file(name, options)
                .map_err(|e| plugin_err(e.to_string()))?;
            zip.write_all(&bytes)
                .map_err(|e| plugin_err(e.to_string()))?;
        }
        let cursor = zip.finish().map_err(|e| plugin_err(e.to_string()))?;
        Ok(cursor.into_inner())
    } else {
        let mut raw = Vec::new();
        {
            let mut tar = TarBuilder::new(&mut raw);
            for (name, bytes) in files {
                let mut header = tar::Header::new_gnu();
                header.set_size(bytes.len() as u64);
                header.set_mode(0o644);
                header.set_cksum();
                tar.append_data(&mut header, name, Cursor::new(bytes))
                    .map_err(|e| plugin_err(e.to_string()))?;
            }
            tar.finish().map_err(|e| plugin_err(e.to_string()))?;
        }
        let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
        encoder
            .write_all(&raw)
            .map_err(|e| plugin_err(e.to_string()))?;
        encoder.finish().map_err(|e| plugin_err(e.to_string()))
    }
}

async fn unpack_file(
    mounts: &MountRegistry,
    mount_id: &str,
    source_path: &str,
    dest_path: &str,
) -> Result<u64, PluginError> {
    let (cfg, op) = mounts.get(mount_id)?;
    cfg.guard.assert_writable()?;
    cfg.guard.assert_path_allowed(source_path)?;
    cfg.guard.assert_path_allowed(dest_path)?;

    let bytes = crate::object_io::read_all(&cfg, op.as_ref(), source_path).await?;
    let is_zip = source_path.ends_with(".zip");
    let dest_prefix = if dest_path.is_empty() {
        String::new()
    } else if dest_path.ends_with('/') {
        dest_path.to_string()
    } else {
        format!("{dest_path}/")
    };

    let files = tokio::task::spawn_blocking(move || extract_archive_bytes(is_zip, bytes))
        .await
        .map_err(|e| plugin_err(e.to_string()))??;

    let mut total = 0u64;
    for (name, buf) in files {
        total += buf.len() as u64;
        let out = format!("{dest_prefix}{name}");
        crate::object_io::write_all(&cfg, op.as_ref(), &out, buf).await?;
    }
    Ok(total)
}

fn extract_archive_bytes(
    is_zip: bool,
    bytes: Vec<u8>,
) -> Result<Vec<(String, Vec<u8>)>, PluginError> {
    let mut out = Vec::new();
    if is_zip {
        let mut archive =
            zip::ZipArchive::new(Cursor::new(bytes)).map_err(|e| plugin_err(e.to_string()))?;
        for i in 0..archive.len() {
            let mut file = archive.by_index(i).map_err(|e| plugin_err(e.to_string()))?;
            if file.is_dir() {
                continue;
            }
            let name = file.name().to_string();
            let mut buf = Vec::new();
            std::io::copy(&mut file, &mut buf).map_err(|e| plugin_err(e.to_string()))?;
            out.push((name, buf));
        }
    } else {
        let mut decoder = GzDecoder::new(Cursor::new(bytes));
        let mut tar_bytes = Vec::new();
        decoder
            .read_to_end(&mut tar_bytes)
            .map_err(|e| plugin_err(e.to_string()))?;
        let mut archive = tar::Archive::new(Cursor::new(tar_bytes));
        for entry in archive.entries().map_err(|e| plugin_err(e.to_string()))? {
            let mut entry = entry.map_err(|e| plugin_err(e.to_string()))?;
            let path = entry
                .path()
                .map_err(|e| plugin_err(e.to_string()))?
                .to_string_lossy()
                .to_string();
            if entry.header().entry_type().is_dir() {
                continue;
            }
            let mut buf = Vec::new();
            entry
                .read_to_end(&mut buf)
                .map_err(|e| plugin_err(e.to_string()))?;
            out.push((path, buf));
        }
    }
    Ok(out)
}
