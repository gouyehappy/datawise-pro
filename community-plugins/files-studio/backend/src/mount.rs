use std::collections::HashMap;
use std::sync::Mutex;

use datawise_plugin_sdk::PluginError;
use opendal::Operator;
use serde_json::{json, Value};

use crate::connection::{build_fs_at, build_operator, parse_mount, MountConfig};
use crate::util::plugin_err;

pub struct MountRegistry {
    inner: Mutex<HashMap<String, MountEntry>>,
}

struct MountEntry {
    config: MountConfig,
    operator: Option<Operator>,
}

impl MountRegistry {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(HashMap::new()),
        }
    }

    pub fn upsert_from_params(
        &self,
        handle: &tokio::runtime::Handle,
        params: &Value,
    ) -> Result<MountConfig, PluginError> {
        let config = parse_mount(params)?;
        let operator = match config.scheme.as_str() {
            "sftp" => {
                handle.block_on(crate::sftp::connect(&config))?;
                None
            }
            "smb" | "cifs" => {
                let root = handle.block_on(crate::smb::connect(&config))?;
                Some(build_fs_at(&root)?)
            }
            _ => Some(build_operator(&config)?),
        };
        let mut map = self
            .inner
            .lock()
            .map_err(|_| plugin_err("Mount registry lock poisoned"))?;
        map.insert(
            config.id.clone(),
            MountEntry {
                config: config.clone(),
                operator,
            },
        );
        Ok(config)
    }

    pub fn remove(&self, id: &str) -> Result<(), PluginError> {
        let mut map = self
            .inner
            .lock()
            .map_err(|_| plugin_err("Mount registry lock poisoned"))?;
        if let Some(entry) = map.remove(id) {
            if entry.config.scheme == "sftp" {
                crate::sftp::drop_session(id);
            }
            if entry.config.scheme == "smb" || entry.config.scheme == "cifs" {
                crate::smb::disconnect(&entry.config);
            }
        }
        Ok(())
    }

    pub fn get(&self, id: &str) -> Result<(MountConfig, Option<Operator>), PluginError> {
        let map = self
            .inner
            .lock()
            .map_err(|_| plugin_err("Mount registry lock poisoned"))?;
        map.get(id)
            .map(|e| (e.config.clone(), e.operator.clone()))
            .ok_or_else(|| {
                plugin_err(format!(
                    "Mount '{id}' is not connected. Re-open the connection from the gallery."
                ))
            })
    }

    pub fn list(&self) -> Result<Vec<Value>, PluginError> {
        let map = self
            .inner
            .lock()
            .map_err(|_| plugin_err("Mount registry lock poisoned"))?;
        let mut rows: Vec<_> = map
            .values()
            .map(|e| {
                json!({
                    "id": e.config.id,
                    "name": e.config.name,
                    "scheme": e.config.scheme,
                    "endpoint": e.config.endpoint_label,
                    "scope": e.config.scope_label,
                    "defaultPrefix": e.config.default_prefix,
                    "guard": e.config.guard.to_json(),
                })
            })
            .collect();
        rows.sort_by(|a, b| {
            a.get("name")
                .and_then(Value::as_str)
                .unwrap_or("")
                .cmp(b.get("name").and_then(Value::as_str).unwrap_or(""))
        });
        Ok(rows)
    }

    pub fn policy(&self, id: &str) -> Result<Value, PluginError> {
        let (config, _) = self.get(id)?;
        Ok(json!({
            "mountId": config.id,
            "name": config.name,
            "scheme": config.scheme,
            "endpoint": config.endpoint_label,
            "scope": config.scope_label,
            "defaultPrefix": config.default_prefix,
            "guard": config.guard.to_json(),
        }))
    }
}
