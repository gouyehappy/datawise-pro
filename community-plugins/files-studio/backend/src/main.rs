mod archive;
mod browser;
mod connection;
mod guard;
mod mount;
mod object_io;
mod s3http;
mod sftp;
mod smb;
mod transfer;
mod util;

use std::sync::Arc;

use datawise_plugin_sdk::{
    PluginEmitter, PluginError, PluginHandler, PluginMetadata, PluginServer, PluginTransport,
    RequestContext,
};
use serde_json::{json, Value};

use crate::archive::ArchiveManager;
use crate::connection::{build_operator, parse_mount};
use crate::guard::GuardState;
use crate::mount::MountRegistry;
use crate::transfer::TransferManager;
use crate::util::{plugin_err, required_string};

struct Plugin {
    runtime: tokio::runtime::Runtime,
    mounts: Arc<MountRegistry>,
    transfers: Arc<TransferManager>,
    archives: Arc<ArchiveManager>,
    guard: Arc<GuardState>,
}

impl Plugin {
    fn new() -> Self {
        Self {
            runtime: tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .worker_threads(4)
                .build()
                .expect("tokio runtime"),
            mounts: Arc::new(MountRegistry::new()),
            transfers: Arc::new(TransferManager::new()),
            archives: Arc::new(ArchiveManager::new()),
            guard: Arc::new(GuardState::new()),
        }
    }

    fn mount_id(params: &Value) -> Result<String, PluginError> {
        if let Ok(id) = required_string(params, "mountId") {
            return Ok(id.to_string());
        }
        if let Ok(id) = required_string(params, "connectionId") {
            return Ok(id.to_string());
        }
        params
            .get("connection")
            .and_then(|c| c.get("id"))
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .ok_or_else(|| plugin_err("Missing mountId / connectionId"))
    }

    fn handle_request(
        &self,
        method: &str,
        params: Value,
        emitter: &PluginEmitter,
    ) -> Result<Value, PluginError> {
        match method {
            "connection/test" => {
                let config = parse_mount(&params)?;
                if config.scheme == "s3" {
                    let summary = self
                        .runtime
                        .block_on(s3http::probe(&config))
                        .map_err(plugin_err)?;
                    return Ok(json!({
                        "success": true,
                        "message": summary,
                    }));
                }
                if config.scheme == "sftp" {
                    let summary = self.runtime.block_on(sftp::connect(&config))?;
                    sftp::drop_session(&config.id);
                    return Ok(json!({ "success": true, "message": summary }));
                }
                if config.scheme == "smb" || config.scheme == "cifs" {
                    let root = self.runtime.block_on(smb::connect(&config))?;
                    let op = connection::build_fs_at(&root)?;
                    self.runtime.block_on(async {
                        op.list("").await.map_err(|e| plugin_err(e.to_string()))
                    })?;
                    return Ok(json!({
                        "success": true,
                        "message": format!("已连接共享 {root}"),
                    }));
                }
                let op = build_operator(&config)?;
                let prefix = if config.default_prefix.is_empty() {
                    String::new()
                } else {
                    format!("{}/", config.default_prefix.trim_matches('/'))
                };
                self.runtime.block_on(async {
                    op.list(&prefix)
                        .await
                        .map_err(|e| plugin_err(e.to_string()))
                })?;
                Ok(json!({
                    "success": true,
                    "message": format!("Connected to {} ({})", config.endpoint_label, config.scheme),
                }))
            }
            "connection/connect" => {
                let config = self.mounts.upsert_from_params(self.runtime.handle(), &params)?;
                self.guard.audit(&config.id, "connect", "", &config.scheme, true);
                Ok(json!({
                    "success": true,
                    "mount": {
                        "id": config.id,
                        "name": config.name,
                        "scheme": config.scheme,
                        "endpoint": config.endpoint_label,
                        "scope": config.scope_label,
                        "defaultPrefix": config.default_prefix,
                        "guard": config.guard.to_json(),
                    }
                }))
            }
            "connection/disconnect" => {
                let id = Self::mount_id(&params)?;
                self.mounts.remove(&id)?;
                self.guard.audit(&id, "disconnect", "", "", true);
                Ok(json!({ "success": true }))
            }
            "workbench/close" => Ok(json!({ "success": true })),

            "files/mounts" => Ok(json!({ "mounts": self.mounts.list()? })),
            "files/guard" => {
                let id = Self::mount_id(&params)?;
                Ok(self.mounts.policy(&id)?)
            }
            "files/guard/pending" => {
                let mount_id = params.get("mountId").and_then(Value::as_str);
                Ok(json!({ "pending": self.guard.list_pending(mount_id) }))
            }
            "files/guard/confirm" => {
                let pending_id = required_string(&params, "pendingId")?;
                let confirm_name = params
                    .get("confirmName")
                    .and_then(Value::as_str)
                    .filter(|s| !s.is_empty());
                let pending = self.guard.take_pending(pending_id)?;
                if let Some(name) = confirm_name {
                    let (cfg, _) = self.mounts.get(&pending.mount_id)?;
                    if name != cfg.name && name != cfg.id {
                        // re-queue
                        self.guard.enqueue_confirm(
                            &pending.mount_id,
                            &pending.kind,
                            &pending.path,
                            &pending.detail,
                        );
                        return Err(plugin_err(
                            "Confirmation name does not match mount name/id",
                        ));
                    }
                }
                if pending.kind == "delete" {
                    let (cfg, op) = self.mounts.get(&pending.mount_id)?;
                    let mut p = params.clone();
                    if let Some(obj) = p.as_object_mut() {
                        obj.insert("path".into(), json!(pending.path));
                        obj.insert("recursive".into(), json!(true));
                    }
                    return self.runtime.block_on(browser::delete_path(
                        op.as_ref(), &cfg, &self.guard, &p, true,
                    ));
                }
                Ok(json!({ "success": true, "pending": pending }))
            }
            "files/guard/audit" => {
                let mount_id = params.get("mountId").and_then(Value::as_str);
                let limit = params
                    .get("limit")
                    .and_then(Value::as_u64)
                    .unwrap_or(100) as usize;
                Ok(json!({ "entries": self.guard.list_audit(mount_id, limit) }))
            }

            "files/list" => {
                let id = Self::mount_id(&params)?;
                let (cfg, op) = self.mounts.get(&id)?;
                self.runtime
                    .block_on(browser::list(op.as_ref(), &cfg, &params))
            }
            "files/stat" => {
                let id = Self::mount_id(&params)?;
                let (cfg, op) = self.mounts.get(&id)?;
                self.runtime.block_on(browser::stat(op.as_ref(), &cfg, &params))
            }
            "files/mkdir" => {
                let id = Self::mount_id(&params)?;
                let (cfg, op) = self.mounts.get(&id)?;
                self.runtime
                    .block_on(browser::mkdir(op.as_ref(), &cfg, &self.guard, &params))
            }
            "files/delete" => {
                let id = Self::mount_id(&params)?;
                let (cfg, op) = self.mounts.get(&id)?;
                let confirmed = params
                    .get("confirmed")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                self.runtime.block_on(browser::delete_path(
                    op.as_ref(), &cfg, &self.guard, &params, confirmed,
                ))
            }
            "files/put" => {
                let id = Self::mount_id(&params)?;
                let (cfg, op) = self.mounts.get(&id)?;
                self.runtime
                    .block_on(browser::put_bytes(op.as_ref(), &cfg, &self.guard, &params))
            }
            "files/read" => {
                let id = Self::mount_id(&params)?;
                let (cfg, op) = self.mounts.get(&id)?;
                self.runtime
                    .block_on(browser::read_bytes(op.as_ref(), &cfg, &params))
            }

            "files/transfer/create" => self.transfers.create_and_spawn(
                Arc::clone(&self.mounts),
                Arc::clone(&self.guard),
                &self.runtime,
                params,
                emitter.clone(),
            ),
            "files/transfer/list" => {
                let filter = params.get("state").and_then(Value::as_str);
                Ok(json!({ "tasks": self.transfers.list(filter) }))
            }
            "files/transfer/get" => {
                let id = required_string(&params, "id")?;
                self.transfers.get(id)
            }
            "files/transfer/cancel" => {
                let id = required_string(&params, "id")?;
                self.transfers.cancel(id)
            }

            "files/archive/create" => self.archives.create_and_spawn(
                Arc::clone(&self.mounts),
                Arc::clone(&self.guard),
                &self.runtime,
                params,
                emitter.clone(),
            ),
            "files/archive/list" => Ok(json!({ "tasks": self.archives.list() })),
            "files/archive/cancel" => {
                let id = required_string(&params, "id")?;
                self.archives.cancel(id)
            }

            _ => Err(PluginError::method_not_found(method)),
        }
    }
}

impl PluginHandler for Plugin {
    fn handle(
        &self,
        _context: RequestContext,
        method: &str,
        params: Value,
        emitter: &PluginEmitter,
    ) -> Result<Value, PluginError> {
        self.handle_request(method, params, emitter)
    }
}

fn main() {
    let metadata = PluginMetadata::new("io.datawise.community.files-studio", "0.1.0")
        .with_capability("connections")
        .with_capability("events")
        .with_capability("workbench");
    let plugin = Plugin::new();
    PluginServer::new(metadata, plugin)
        .transport(PluginTransport::Framed)
        .worker_threads(4)
        .serve()
        .expect("files-studio plugin server");
}
