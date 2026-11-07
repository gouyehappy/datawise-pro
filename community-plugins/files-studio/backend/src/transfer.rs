use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Instant;

use chrono::{SecondsFormat, Utc};
use datawise_plugin_sdk::{PluginEmitter, PluginError};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::io::AsyncWriteExt;
use uuid::Uuid;

use crate::guard::GuardState;
use crate::mount::MountRegistry;
use crate::util::{normalize_object_path, plugin_err, required_string};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TransferKind {
    Upload,
    Download,
    Copy,
    Sync,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TransferState {
    Pending,
    Running,
    #[allow(dead_code)]
    Paused,
    Failed,
    Completed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferTask {
    pub id: String,
    pub kind: TransferKind,
    pub source_mount_id: String,
    pub source_path: String,
    pub dest_mount_id: String,
    pub dest_path: String,
    pub state: TransferState,
    pub bytes_done: u64,
    pub bytes_total: u64,
    pub rate_bps: u64,
    pub retries: u32,
    pub last_error: String,
    pub created_at: String,
    pub updated_at: String,
    pub log_tail: Vec<String>,
}

impl TransferTask {
    fn touch(&mut self) {
        self.updated_at = Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true);
    }

    fn log(&mut self, line: impl Into<String>) {
        self.log_tail.push(line.into());
        if self.log_tail.len() > 40 {
            let drain = self.log_tail.len() - 40;
            self.log_tail.drain(0..drain);
        }
        self.touch();
    }

    fn to_json(&self) -> Value {
        json!({
            "id": self.id,
            "kind": match self.kind {
                TransferKind::Upload => "upload",
                TransferKind::Download => "download",
                TransferKind::Copy => "copy",
                TransferKind::Sync => "sync",
            },
            "sourceMountId": self.source_mount_id,
            "sourcePath": self.source_path,
            "destMountId": self.dest_mount_id,
            "destPath": self.dest_path,
            "state": match self.state {
                TransferState::Pending => "pending",
                TransferState::Running => "running",
                TransferState::Paused => "paused",
                TransferState::Failed => "failed",
                TransferState::Completed => "completed",
                TransferState::Cancelled => "cancelled",
            },
            "bytesDone": self.bytes_done,
            "bytesTotal": self.bytes_total,
            "progress": if self.bytes_total == 0 {
                0.0
            } else {
                (self.bytes_done as f64 / self.bytes_total as f64) * 100.0
            },
            "rateBps": self.rate_bps,
            "retries": self.retries,
            "lastError": self.last_error,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
            "logTail": self.log_tail,
            "ageSeconds": 0,
        })
    }
}

pub struct TransferManager {
    tasks: Mutex<HashMap<String, TransferTask>>,
    cancelled: Mutex<HashMap<String, bool>>,
}

impl TransferManager {
    pub fn new() -> Self {
        Self {
            tasks: Mutex::new(HashMap::new()),
            cancelled: Mutex::new(HashMap::new()),
        }
    }

    pub fn list(&self, state_filter: Option<&str>) -> Vec<Value> {
        let map = self.tasks.lock().unwrap();
        let mut rows: Vec<_> = map.values().cloned().collect();
        rows.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        rows.into_iter()
            .filter(|t| {
                state_filter
                    .map(|f| {
                        if f == "all" || f.is_empty() {
                            true
                        } else {
                            format!("{:?}", t.state).eq_ignore_ascii_case(f)
                                || match (f, &t.state) {
                                    ("running", TransferState::Running) => true,
                                    ("failed", TransferState::Failed) => true,
                                    ("completed", TransferState::Completed) => true,
                                    ("pending", TransferState::Pending) => true,
                                    ("paused", TransferState::Paused) => true,
                                    ("cancelled", TransferState::Cancelled) => true,
                                    _ => false,
                                }
                        }
                    })
                    .unwrap_or(true)
            })
            .map(|t| t.to_json())
            .collect()
    }

    pub fn get(&self, id: &str) -> Result<Value, PluginError> {
        self.tasks
            .lock()
            .unwrap()
            .get(id)
            .map(|t| t.to_json())
            .ok_or_else(|| plugin_err(format!("Transfer not found: {id}")))
    }

    pub fn cancel(&self, id: &str) -> Result<Value, PluginError> {
        self.cancelled.lock().unwrap().insert(id.to_string(), true);
        if let Some(t) = self.tasks.lock().unwrap().get_mut(id) {
            if !matches!(t.state, TransferState::Completed | TransferState::Cancelled) {
                t.state = TransferState::Cancelled;
                t.log("Cancelled by user");
            }
            Ok(t.to_json())
        } else {
            Err(plugin_err(format!("Transfer not found: {id}")))
        }
    }

    fn is_cancelled(&self, id: &str) -> bool {
        *self.cancelled.lock().unwrap().get(id).unwrap_or(&false)
    }

    fn update<F: FnOnce(&mut TransferTask)>(&self, id: &str, f: F) {
        if let Some(t) = self.tasks.lock().unwrap().get_mut(id) {
            f(t);
        }
    }

    pub fn create_and_spawn(
        self: &Arc<Self>,
        mounts: Arc<MountRegistry>,
        guard: Arc<GuardState>,
        runtime: &tokio::runtime::Runtime,
        params: Value,
        emitter: PluginEmitter,
    ) -> Result<Value, PluginError> {
        let kind_str = required_string(&params, "kind")?;
        let kind = match kind_str {
            "upload" => TransferKind::Upload,
            "download" => TransferKind::Download,
            "copy" => TransferKind::Copy,
            "sync" => TransferKind::Sync,
            other => return Err(plugin_err(format!("Unknown transfer kind: {other}"))),
        };
        let source_mount_id = required_string(&params, "sourceMountId")?.to_string();
        let source_path = normalize_object_path(required_string(&params, "sourcePath")?);
        let dest_mount_id = required_string(&params, "destMountId")?.to_string();
        let dest_path = normalize_object_path(required_string(&params, "destPath")?);
        let overwrite = params
            .get("overwrite")
            .and_then(Value::as_bool)
            .unwrap_or(true);

        let now = Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true);
        let id = Uuid::new_v4().to_string();
        let task = TransferTask {
            id: id.clone(),
            kind: kind.clone(),
            source_mount_id: source_mount_id.clone(),
            source_path: source_path.clone(),
            dest_mount_id: dest_mount_id.clone(),
            dest_path: dest_path.clone(),
            state: TransferState::Pending,
            bytes_done: 0,
            bytes_total: 0,
            rate_bps: 0,
            retries: 0,
            last_error: String::new(),
            created_at: now.clone(),
            updated_at: now,
            log_tail: vec!["Queued".into()],
        };
        let snapshot = task.to_json();
        self.tasks.lock().unwrap().insert(id.clone(), task);

        let mgr = Arc::clone(self);
        runtime.spawn(async move {
            let _ = run_transfer(
                mgr,
                mounts,
                guard,
                id,
                kind,
                source_mount_id,
                source_path,
                dest_mount_id,
                dest_path,
                overwrite,
                emitter,
            )
            .await;
        });

        Ok(snapshot)
    }
}

async fn run_transfer(
    mgr: Arc<TransferManager>,
    mounts: Arc<MountRegistry>,
    guard: Arc<GuardState>,
    id: String,
    kind: TransferKind,
    source_mount_id: String,
    source_path: String,
    dest_mount_id: String,
    dest_path: String,
    overwrite: bool,
    emitter: PluginEmitter,
) -> Result<(), PluginError> {
    mgr.update(&id, |t| {
        t.state = TransferState::Running;
        t.log("Started");
    });
    emit_progress(&emitter, &mgr, &id);

    let result = match kind {
        TransferKind::Copy | TransferKind::Sync => {
            copy_between_mounts(
                &mgr,
                &mounts,
                &guard,
                &id,
                &source_mount_id,
                &source_path,
                &dest_mount_id,
                &dest_path,
                overwrite,
                &emitter,
            )
            .await
        }
        TransferKind::Upload => {
            // sourcePath = local filesystem path; dest = object on dest mount
            upload_local(
                &mgr,
                &mounts,
                &guard,
                &id,
                &source_path,
                &dest_mount_id,
                &dest_path,
                &emitter,
            )
            .await
        }
        TransferKind::Download => {
            download_local(
                &mgr,
                &mounts,
                &guard,
                &id,
                &source_mount_id,
                &source_path,
                &dest_path,
                &emitter,
            )
            .await
        }
    };

    match result {
        Ok(()) => {
            mgr.update(&id, |t| {
                t.state = TransferState::Completed;
                t.bytes_done = t.bytes_total.max(t.bytes_done);
                t.log("Completed");
            });
            guard.audit(
                &dest_mount_id,
                &format!("{:?}", kind).to_ascii_lowercase(),
                &dest_path,
                &source_path,
                true,
            );
        }
        Err(e) => {
            let msg = e.message.clone();
            mgr.update(&id, |t| {
                if t.state != TransferState::Cancelled {
                    t.state = TransferState::Failed;
                    t.last_error = msg.clone();
                    t.log(format!("Failed: {msg}"));
                }
            });
            guard.audit(
                &dest_mount_id,
                &format!("{:?}", kind).to_ascii_lowercase(),
                &dest_path,
                &msg,
                false,
            );
        }
    }
    emit_progress(&emitter, &mgr, &id);
    Ok(())
}

async fn copy_between_mounts(
    mgr: &TransferManager,
    mounts: &MountRegistry,
    guard: &GuardState,
    id: &str,
    source_mount_id: &str,
    source_path: &str,
    dest_mount_id: &str,
    dest_path: &str,
    overwrite: bool,
    emitter: &PluginEmitter,
) -> Result<(), PluginError> {
    let (src_cfg, src_op) = mounts.get(source_mount_id)?;
    let (dst_cfg, dst_op) = mounts.get(dest_mount_id)?;
    dst_cfg.guard.assert_writable()?;
    src_cfg.guard.assert_path_allowed(source_path)?;
    dst_cfg.guard.assert_path_allowed(dest_path)?;

    let as_dir = crate::object_io::is_dir(&src_cfg, src_op.as_ref(), source_path)
        .await
        .unwrap_or(source_path.ends_with('/'));
    let pairs = if as_dir {
        let files = crate::object_io::list_files(&src_cfg, src_op.as_ref(), source_path).await?;
        if files.is_empty() {
            return Err(plugin_err("源文件夹是空的，没有可复制的文件"));
        }
        let src_root = source_path.trim_matches('/');
        let dst_root = dest_path.trim_matches('/');
        files
            .into_iter()
            .map(|src| {
                let rel = if src_root.is_empty() {
                    src.clone()
                } else {
                    src.strip_prefix(src_root)
                        .unwrap_or(src.as_str())
                        .trim_start_matches('/')
                        .to_string()
                };
                let dst = if dst_root.is_empty() {
                    rel
                } else if rel.is_empty() {
                    dst_root.to_string()
                } else {
                    format!("{dst_root}/{rel}")
                };
                (src, dst)
            })
            .collect::<Vec<_>>()
    } else {
        vec![(source_path.to_string(), dest_path.to_string())]
    };

    let mut total = 0u64;
    for (src, _) in &pairs {
        total = total.saturating_add(
            crate::object_io::file_len(&src_cfg, src_op.as_ref(), src)
                .await
                .unwrap_or(0),
        );
    }
    dst_cfg.guard.assert_upload_size(total)?;
    mgr.update(id, |t| {
        t.bytes_total = total;
        t.log(format!("Copying {} item(s), {total} bytes", pairs.len()));
    });
    emit_progress(emitter, mgr, id);

    let started = Instant::now();
    let mut done = 0u64;
    for (src, dst) in &pairs {
        if mgr.is_cancelled(id) {
            return Err(plugin_err("Cancelled"));
        }
        src_cfg.guard.assert_path_allowed(src)?;
        dst_cfg.guard.assert_path_allowed(dst)?;
        if !overwrite && crate::object_io::exists(&dst_cfg, dst_op.as_ref(), dst).await? {
            return Err(plugin_err(format!(
                "Destination exists and overwrite=false: {dst}"
            )));
        }
        let bytes = crate::object_io::read_all(&src_cfg, src_op.as_ref(), src).await?;
        let len = bytes.len() as u64;
        crate::object_io::write_all(&dst_cfg, dst_op.as_ref(), dst, bytes).await?;
        done = done.saturating_add(len);
        let elapsed = started.elapsed().as_secs_f64().max(0.001);
        mgr.update(id, |t| {
            t.bytes_done = done;
            t.rate_bps = (done as f64 / elapsed) as u64;
            t.log(format!("Copied {src} → {dst}"));
        });
        emit_progress(emitter, mgr, id);
    }
    guard.audit(dest_mount_id, "copy", dest_path, source_path, true);
    Ok(())
}

async fn upload_local(
    mgr: &TransferManager,
    mounts: &MountRegistry,
    guard: &GuardState,
    id: &str,
    local_path: &str,
    dest_mount_id: &str,
    dest_path: &str,
    emitter: &PluginEmitter,
) -> Result<(), PluginError> {
    let (dst_cfg, dst_op) = mounts.get(dest_mount_id)?;
    dst_cfg.guard.assert_writable()?;
    dst_cfg.guard.assert_path_allowed(dest_path)?;

    let path = PathBuf::from(local_path);
    let meta = tokio::fs::metadata(&path)
        .await
        .map_err(|e| plugin_err(format!("Local source: {e}")))?;

    let pairs = if meta.is_dir() {
        let files = collect_local_files(&path).await?;
        if files.is_empty() {
            return Err(plugin_err("本地文件夹是空的"));
        }
        let dst_root = dest_path.trim_matches('/');
        files
            .into_iter()
            .map(|(abs, rel)| {
                let dst = if dst_root.is_empty() {
                    rel
                } else {
                    format!("{dst_root}/{rel}")
                };
                (abs, dst)
            })
            .collect::<Vec<_>>()
    } else {
        vec![(path, dest_path.to_string())]
    };

    let mut total = 0u64;
    for (abs, _) in &pairs {
        total = total.saturating_add(tokio::fs::metadata(abs).await.map(|m| m.len()).unwrap_or(0));
    }
    dst_cfg.guard.assert_upload_size(total)?;
    mgr.update(id, |t| {
        t.bytes_total = total;
        t.log(format!("Uploading {} local item(s), {total} bytes", pairs.len()));
    });
    emit_progress(emitter, mgr, id);

    let started = Instant::now();
    let mut done = 0u64;
    for (abs, dst) in &pairs {
        if mgr.is_cancelled(id) {
            return Err(plugin_err("Cancelled"));
        }
        dst_cfg.guard.assert_path_allowed(dst)?;
        let data = tokio::fs::read(abs)
            .await
            .map_err(|e| plugin_err(e.to_string()))?;
        let len = data.len() as u64;
        crate::object_io::write_all(&dst_cfg, dst_op.as_ref(), dst, data).await?;
        done = done.saturating_add(len);
        let elapsed = started.elapsed().as_secs_f64().max(0.001);
        mgr.update(id, |t| {
            t.bytes_done = done;
            t.rate_bps = (done as f64 / elapsed) as u64;
            t.log(format!("Uploaded {} → {dst}", abs.display()));
        });
        emit_progress(emitter, mgr, id);
    }
    guard.audit(dest_mount_id, "upload", dest_path, local_path, true);
    Ok(())
}

async fn download_local(
    mgr: &TransferManager,
    mounts: &MountRegistry,
    guard: &GuardState,
    id: &str,
    source_mount_id: &str,
    source_path: &str,
    local_dest: &str,
    emitter: &PluginEmitter,
) -> Result<(), PluginError> {
    let (src_cfg, src_op) = mounts.get(source_mount_id)?;
    src_cfg.guard.assert_path_allowed(source_path)?;

    let as_dir = crate::object_io::is_dir(&src_cfg, src_op.as_ref(), source_path)
        .await
        .unwrap_or(source_path.ends_with('/'));
    let pairs = if as_dir {
        let files = crate::object_io::list_files(&src_cfg, src_op.as_ref(), source_path).await?;
        if files.is_empty() {
            return Err(plugin_err("远程文件夹是空的"));
        }
        let src_root = source_path.trim_matches('/');
        let dest_root = PathBuf::from(local_dest);
        files
            .into_iter()
            .map(|src| {
                let rel = if src_root.is_empty() {
                    src.clone()
                } else {
                    src.strip_prefix(src_root)
                        .unwrap_or(src.as_str())
                        .trim_start_matches('/')
                        .to_string()
                };
                (src, dest_root.join(rel.replace('/', std::path::MAIN_SEPARATOR_STR)))
            })
            .collect::<Vec<_>>()
    } else {
        vec![(source_path.to_string(), PathBuf::from(local_dest))]
    };

    let mut total = 0u64;
    for (src, _) in &pairs {
        total = total.saturating_add(
            crate::object_io::file_len(&src_cfg, src_op.as_ref(), src)
                .await
                .unwrap_or(0),
        );
    }
    mgr.update(id, |t| {
        t.bytes_total = total;
        t.log(format!("Downloading {} item(s), {total} bytes", pairs.len()));
    });
    emit_progress(emitter, mgr, id);

    let started = Instant::now();
    let mut done = 0u64;
    for (src, path) in &pairs {
        if mgr.is_cancelled(id) {
            return Err(plugin_err("Cancelled"));
        }
        let bytes = crate::object_io::read_all(&src_cfg, src_op.as_ref(), src).await?;
        let len = bytes.len() as u64;
        if let Some(parent) = path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|e| plugin_err(e.to_string()))?;
        }
        let mut file = tokio::fs::File::create(path)
            .await
            .map_err(|e| plugin_err(e.to_string()))?;
        file.write_all(&bytes)
            .await
            .map_err(|e| plugin_err(e.to_string()))?;
        file.flush().await.map_err(|e| plugin_err(e.to_string()))?;
        done = done.saturating_add(len);
        let elapsed = started.elapsed().as_secs_f64().max(0.001);
        mgr.update(id, |t| {
            t.bytes_done = done;
            t.rate_bps = (done as f64 / elapsed) as u64;
            t.log(format!("Downloaded {src} → {}", path.display()));
        });
        emit_progress(emitter, mgr, id);
    }
    guard.audit(source_mount_id, "download", source_path, local_dest, true);
    Ok(())
}

async fn collect_local_files(root: &PathBuf) -> Result<Vec<(PathBuf, String)>, PluginError> {
    let mut out = Vec::new();
    let mut stack = vec![root.clone()];
    while let Some(dir) = stack.pop() {
        let mut entries = tokio::fs::read_dir(&dir)
            .await
            .map_err(|e| plugin_err(e.to_string()))?;
        while let Some(entry) = entries
            .next_entry()
            .await
            .map_err(|e| plugin_err(e.to_string()))?
        {
            let path = entry.path();
            let meta = entry.metadata().await.map_err(|e| plugin_err(e.to_string()))?;
            if meta.is_dir() {
                stack.push(path);
            } else if meta.is_file() {
                let rel = path
                    .strip_prefix(root)
                    .unwrap_or(&path)
                    .to_string_lossy()
                    .replace('\\', "/");
                out.push((path, rel));
            }
        }
    }
    out.sort_by(|a, b| a.1.cmp(&b.1));
    Ok(out)
}

fn emit_progress(emitter: &PluginEmitter, mgr: &TransferManager, id: &str) {
    if let Ok(v) = mgr.get(id) {
        let _ = emitter.event("files-studio/transfer/progress", v);
    }
}

