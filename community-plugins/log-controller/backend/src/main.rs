mod connection;
mod profile;
mod query;
mod ssh_pool;
mod util;

use std::sync::Arc;

use datawise_plugin_sdk::{
    PluginEmitter, PluginError, PluginHandler, PluginMetadata, PluginServer, PluginTransport,
    RequestContext,
};
use serde_json::{json, Value};

use crate::connection::GroupRegistry;
use crate::query::{group_id_from_params, list_files, probe_servers, search};

struct Plugin {
    runtime: tokio::runtime::Runtime,
    groups: Arc<GroupRegistry>,
}

impl Plugin {
    fn new() -> Self {
        Self {
            runtime: tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .worker_threads(4)
                .build()
                .expect("tokio runtime"),
            groups: Arc::new(GroupRegistry::new()),
        }
    }

    fn handle_request(&self, method: &str, params: Value) -> Result<Value, PluginError> {
        match method {
            "connection/test" => Ok(json!({
                "success": true,
                "message": "连接可用。打开工作台后填写日志目录和登录信息即可查询。",
            })),
            "connection/connect" => {
                let cfg = self.groups.upsert_from_params(&params)?;
                Ok(json!({
                    "success": true,
                    "group": GroupRegistry::summary(&cfg),
                }))
            }
            "connection/disconnect" => {
                let id = group_id_from_params(&params)?;
                ssh_pool::drop_group(&id);
                self.groups.remove(&id)?;
                Ok(json!({ "success": true }))
            }
            "workbench/close" => Ok(json!({ "success": true })),

            "logs/group" => {
                let id = group_id_from_params(&params)?;
                let cfg = self.groups.get(&id)?;
                Ok(json!({
                    "group": GroupRegistry::summary(&cfg),
                    "profile": profile::read(&id),
                }))
            }
            "logs/profile/put" => {
                let id = group_id_from_params(&params)?;
                profile::write(&id, &params)?;
                if self.groups.get(&id).is_ok() {
                    let cfg = self.groups.apply_session(&id, &params)?;
                    Ok(json!({
                        "ok": true,
                        "group": GroupRegistry::summary(&cfg),
                    }))
                } else {
                    Ok(json!({ "ok": true }))
                }
            }
            "logs/configure" => {
                let id = group_id_from_params(&params)?;
                ssh_pool::drop_group(&id);
                let cfg = self.groups.apply_session(&id, &params)?;
                Ok(json!({
                    "success": true,
                    "group": GroupRegistry::summary(&cfg),
                }))
            }
            "logs/probe" => {
                let id = group_id_from_params(&params)?;
                let cfg = self.groups.get(&id)?;
                cfg.ensure_ready()?;
                self.runtime.block_on(probe_servers(&cfg, &params))
            }
            "logs/files" => {
                let id = group_id_from_params(&params)?;
                let cfg = self.groups.get(&id)?;
                cfg.ensure_ready()?;
                self.runtime.block_on(list_files(&cfg, &params))
            }
            "logs/search" => {
                let id = group_id_from_params(&params)?;
                let cfg = self.groups.get(&id)?;
                cfg.ensure_ready()?;
                self.runtime.block_on(search(&cfg, &params))
            }
            "logs/tail" => {
                let id = group_id_from_params(&params)?;
                let cfg = self.groups.get(&id)?;
                cfg.ensure_ready()?;
                let mut p = params.clone();
                if let Some(obj) = p.as_object_mut() {
                    obj.entry("keyword").or_insert(json!(""));
                    obj.insert("remoteGrep".into(), json!(false));
                }
                self.runtime.block_on(search(&cfg, &p))
            }
            "logs/keepalive" => {
                let id = group_id_from_params(&params)?;
                let n = self.runtime.block_on(ssh_pool::keepalive_group(&id));
                Ok(json!({ "ok": true, "alive": n }))
            }
            "logs/reconnect" => {
                let id = group_id_from_params(&params)?;
                let cfg = self.groups.get(&id)?;
                cfg.ensure_ready()?;
                let mut servers = connection::servers_from_params(&params, cfg.default_port)?;
                if servers.is_empty() {
                    if let Some(sid) = params.get("serverId").and_then(Value::as_str) {
                        servers = cfg
                            .seed_servers
                            .iter()
                            .filter(|s| s.id == sid || s.host == sid)
                            .cloned()
                            .collect();
                    }
                }
                let Some(server) = servers.into_iter().next() else {
                    return Err(util::plugin_err("请指定要重连的实例"));
                };
                ssh_pool::drop_server(&id, &server);
                let message = self.runtime.block_on(ssh_pool::probe(&cfg, &server))?;
                Ok(json!({
                    "ok": true,
                    "id": server.id,
                    "label": server.label,
                    "message": message,
                }))
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
        _emitter: &PluginEmitter,
    ) -> Result<Value, PluginError> {
        self.handle_request(method, params)
    }
}

fn main() {
    let metadata = PluginMetadata::new("io.datawise.community.log-controller", "0.1.47")
        .with_capability("connections")
        .with_capability("events")
        .with_capability("workbench");
    let plugin = Plugin::new();
    PluginServer::new(metadata, plugin)
        .transport(PluginTransport::Framed)
        .worker_threads(4)
        .serve()
        .expect("log-controller plugin server");
}
