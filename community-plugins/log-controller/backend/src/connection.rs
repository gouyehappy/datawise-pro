use datawise_plugin_sdk::PluginError;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use crate::util::{merge_maps, obj_map, plugin_err, str_in, u64_in};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerSpec {
    pub id: String,
    pub host: String,
    #[serde(default = "default_port")]
    pub port: u16,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub enabled: bool,
    /// Which saved jump to use. Empty means connect directly.
    #[serde(default, rename = "jumpId", alias = "jump_id")]
    pub jump_id: String,
    /// Empty means use the workbench default login.
    #[serde(default)]
    pub user: String,
    #[serde(default)]
    pub password: String,
    /// Empty means use the workbench default log directory.
    #[serde(default, rename = "logDir", alias = "log_dir")]
    pub log_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JumpSpec {
    pub id: String,
    #[serde(default)]
    pub label: String,
    pub host: String,
    #[serde(default = "default_port")]
    pub port: u16,
    #[serde(default)]
    pub user: String,
    #[serde(default)]
    pub password: String,
}

fn default_port() -> u16 {
    22
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct GroupConfig {
    pub id: String,
    pub name: String,
    pub service_name: String,
    pub log_dir: String,
    pub log_glob: String,
    pub user: String,
    pub password: String,
    pub private_key: String,
    pub passphrase: String,
    pub jump_host: String,
    pub jump_port: u16,
    pub jump_user: String,
    pub jump_password: String,
    pub jumps: Vec<JumpSpec>,
    pub default_port: u16,
    pub max_bytes_per_host: u64,
    pub default_tail_lines: u64,
    pub seed_servers: Vec<ServerSpec>,
    pub raw: Value,
}

pub struct GroupRegistry {
    inner: Mutex<HashMap<String, Arc<GroupConfig>>>,
}

impl GroupRegistry {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(HashMap::new()),
        }
    }

    pub fn upsert_from_params(&self, params: &Value) -> Result<Arc<GroupConfig>, PluginError> {
        let cfg = Arc::new(parse_group(params)?);
        self.inner
            .lock()
            .map_err(|_| plugin_err("group registry lock"))?
            .insert(cfg.id.clone(), Arc::clone(&cfg));
        Ok(cfg)
    }

    pub fn get(&self, id: &str) -> Result<Arc<GroupConfig>, PluginError> {
        self.inner
            .lock()
            .map_err(|_| plugin_err("group registry lock"))?
            .get(id)
            .cloned()
            .ok_or_else(|| plugin_err("日志服务组未连接，请重新打开工作台"))
    }

    pub fn remove(&self, id: &str) -> Result<(), PluginError> {
        self.inner
            .lock()
            .map_err(|_| plugin_err("group registry lock"))?
            .remove(id);
        Ok(())
    }

    pub fn summary(cfg: &GroupConfig) -> Value {
        json!({
            "id": cfg.id,
            "name": cfg.name,
            "serviceName": cfg.service_name,
            "logDir": cfg.log_dir,
            "logGlob": cfg.log_glob,
            "defaultPort": cfg.default_port,
            "maxBytesPerHost": cfg.max_bytes_per_host,
            "defaultTailLines": cfg.default_tail_lines,
            "seedServers": cfg.seed_servers,
            "user": cfg.user,
            "hasPassword": !cfg.password.is_empty(),
            "hasPrivateKey": !cfg.private_key.trim().is_empty(),
            "jumpHost": cfg.jump_host,
            "jumpPort": cfg.jump_port,
            "jumpUser": cfg.jump_user,
            "hasJumpPassword": !cfg.jump_password.is_empty(),
            "jumps": cfg.jumps.iter().map(|j| json!({
                "id": j.id,
                "label": j.label,
                "host": j.host,
                "port": j.port,
                "user": j.user,
                "hasPassword": !j.password.is_empty(),
            })).collect::<Vec<_>>(),
            "ready": cfg.is_ready(),
        })
    }

    pub fn apply_session(&self, id: &str, patch: &Value) -> Result<Arc<GroupConfig>, PluginError> {
        let mut guard = self
            .inner
            .lock()
            .map_err(|_| plugin_err("group registry lock"))?;
        let current = guard
            .get(id)
            .cloned()
            .ok_or_else(|| plugin_err("日志服务组未连接，请重新打开工作台"))?;
        let next = Arc::new(current.with_session(patch)?);
        guard.insert(id.to_string(), Arc::clone(&next));
        Ok(next)
    }
}

impl GroupConfig {
    pub fn is_ready(&self) -> bool {
        !self.log_dir.trim().is_empty()
    }

    pub fn user_for<'a>(&'a self, server: &'a ServerSpec) -> &'a str {
        if server.user.trim().is_empty() {
            self.user.as_str()
        } else {
            server.user.trim()
        }
    }

    pub fn password_for<'a>(&'a self, server: &'a ServerSpec) -> &'a str {
        if !server.password.is_empty() {
            server.password.as_str()
        } else if server.user.trim().is_empty() {
            self.password.as_str()
        } else {
            ""
        }
    }

    pub fn log_dir_for<'a>(&'a self, server: &'a ServerSpec) -> &'a str {
        if server.log_dir.trim().is_empty() {
            self.log_dir.as_str()
        } else {
            server.log_dir.trim()
        }
    }

    pub fn ensure_ready(&self) -> Result<(), PluginError> {
        if self.is_ready() {
            return Ok(());
        }
        Err(plugin_err(
            "请先填写日志目录",
        ))
    }

    pub fn with_session(&self, patch: &Value) -> Result<Self, PluginError> {
        let mut next = self.clone();
        if let Some(v) = optional_str(patch, "serviceName").or_else(|| optional_str(patch, "service_name")) {
            next.service_name = v.to_string();
        }
        if let Some(v) = optional_str(patch, "logDir").or_else(|| optional_str(patch, "log_dir")) {
            next.log_dir = v.to_string();
        }
        if let Some(v) = optional_str(patch, "logGlob").or_else(|| optional_str(patch, "log_glob")) {
            next.log_glob = v.to_string();
        }
        if let Some(v) = optional_str(patch, "user").or_else(|| optional_str(patch, "username")) {
            next.user = v.to_string();
        }
        if let Some(v) = patch
            .get("password")
            .and_then(Value::as_str)
            .map(str::to_string)
        {
            next.password = v;
        }
        if let Some(v) = patch
            .get("privateKey")
            .or_else(|| patch.get("private_key"))
            .and_then(Value::as_str)
            .map(str::to_string)
        {
            next.private_key = v;
        }
        if let Some(v) = patch
            .get("passphrase")
            .or_else(|| patch.get("private_key_passphrase"))
            .and_then(Value::as_str)
            .map(str::to_string)
        {
            next.passphrase = v;
        }
        if let Some(port) = patch
            .get("defaultPort")
            .or_else(|| patch.get("default_port"))
            .and_then(Value::as_u64)
            .filter(|p| *p > 0)
        {
            next.default_port = port as u16;
        }
        if patch.get("jumpHost").is_some() || patch.get("jump_host").is_some() {
            next.jump_host = optional_str(patch, "jumpHost")
                .or_else(|| optional_str(patch, "jump_host"))
                .unwrap_or("")
                .to_string();
        }
        if let Some(port) = patch
            .get("jumpPort")
            .or_else(|| patch.get("jump_port"))
            .and_then(Value::as_u64)
            .filter(|p| *p > 0)
        {
            next.jump_port = port as u16;
        }
        if patch.get("jumpUser").is_some() || patch.get("jump_user").is_some() {
            next.jump_user = optional_str(patch, "jumpUser")
                .or_else(|| optional_str(patch, "jump_user"))
                .unwrap_or("")
                .to_string();
        }
        if patch.get("jumpPassword").is_some() || patch.get("jump_password").is_some() {
            next.jump_password = patch
                .get("jumpPassword")
                .or_else(|| patch.get("jump_password"))
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
        }
        if let Some(arr) = patch.get("jumps").and_then(Value::as_array) {
            next.jumps = parse_jumps(arr, &self.jumps);
            if let Some(first) = next.jumps.first() {
                next.jump_host = first.host.clone();
                next.jump_port = first.port;
                next.jump_user = first.user.clone();
                next.jump_password = first.password.clone();
            } else {
                next.jump_host.clear();
                next.jump_port = 2222;
                next.jump_user.clear();
                next.jump_password.clear();
            }
        }
        if patch.get("servers").is_some() {
            next.seed_servers = servers_from_params(patch, next.default_port)?;
        }
        if let Some(host) = optional_str(patch, "primaryHost")
            .or_else(|| optional_str(patch, "host"))
            .map(str::trim)
            .filter(|s| !s.is_empty() && *s != "localhost")
        {
            if !next.seed_servers.iter().any(|s| s.host == host) {
                next.seed_servers.insert(
                    0,
                    ServerSpec {
                        id: format!("{host}:{}", next.default_port),
                        host: host.to_string(),
                        port: next.default_port,
                        label: host.to_string(),
                        enabled: true,
                        jump_id: String::new(),
                        user: String::new(),
                        password: String::new(),
                        log_dir: String::new(),
                    },
                );
            }
        }
        Ok(next)
    }

    /// Resolve the jump host for one server. Empty jumpId means direct connect,
    /// unless a legacy session-wide jump is still configured.
    pub fn resolve_jump(&self, server: &ServerSpec) -> Option<JumpSpec> {
        if !server.jump_id.trim().is_empty() {
            return self
                .jumps
                .iter()
                .find(|j| j.id == server.jump_id)
                .cloned()
                .or_else(|| {
                    if server.jump_id == "_default" && !self.jump_host.trim().is_empty() {
                        Some(self.legacy_jump())
                    } else {
                        None
                    }
                });
        }
        if !self.jumps.is_empty() {
            return None;
        }
        if self.jump_host.trim().is_empty() {
            None
        } else {
            Some(self.legacy_jump())
        }
    }

    fn legacy_jump(&self) -> JumpSpec {
        JumpSpec {
            id: "_default".to_string(),
            label: self.jump_host.clone(),
            host: self.jump_host.trim().to_string(),
            port: if self.jump_port == 0 {
                22
            } else {
                self.jump_port
            },
            user: self.jump_user.clone(),
            password: self.jump_password.clone(),
        }
    }
}

fn optional_str<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
}

pub fn parse_group(params: &Value) -> Result<GroupConfig, PluginError> {
    let connection = params
        .get("connection")
        .cloned()
        .unwrap_or_else(|| params.clone());

    let id = connection
        .get("id")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| plugin_err("请从连接菜单打开"))?
        .to_string();

    let name = connection
        .get("name")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .unwrap_or(&id)
        .to_string();

    let external = merge_maps(
        obj_map(connection.get("external_config")),
        obj_map(connection.get("advancedConfig")),
    );
    let secrets = merge_maps(
        obj_map(connection.get("connection_secrets")),
        obj_map(connection.get("secrets")),
    );

    // Connection form only needs a display name. Log dir / SSH creds are filled
    // in the workbench at query time via logs/configure.
    let service_name = str_in(&external, "service_name")
        .unwrap_or(&name)
        .to_string();
    let log_dir = str_in(&external, "log_dir")
        .or_else(|| str_in(&external, "logDir"))
        .unwrap_or("")
        .to_string();
    let log_glob = str_in(&external, "log_glob")
        .or_else(|| str_in(&external, "logGlob"))
        .unwrap_or("*.log")
        .to_string();

    let user = connection
        .get("user")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .or_else(|| str_in(&external, "username"))
        .unwrap_or("")
        .to_string();

    let password = connection
        .get("password")
        .and_then(Value::as_str)
        .or_else(|| str_in(&secrets, "password"))
        .unwrap_or("")
        .to_string();
    let private_key = str_in(&secrets, "private_key").unwrap_or("").to_string();
    let passphrase = str_in(&secrets, "private_key_passphrase")
        .unwrap_or("")
        .to_string();

    let default_port = connection
        .get("port")
        .and_then(Value::as_u64)
        .filter(|p| *p > 0)
        .or_else(|| u64_in(&external, "default_port"))
        .unwrap_or(22) as u16;

    let max_bytes_per_host = u64_in(&external, "max_bytes_per_host")
        .or_else(|| u64_in(&external, "maxBytesPerHost"))
        .unwrap_or(2 * 1024 * 1024)
        .clamp(64 * 1024, 32 * 1024 * 1024);

    let default_tail_lines = u64_in(&external, "default_tail_lines")
        .or_else(|| u64_in(&external, "defaultTailLines"))
        .unwrap_or(500)
        .clamp(50, 50_000);

    let mut seed_servers = parse_seed_servers(
        str_in(&external, "servers_json").or_else(|| str_in(&external, "serversJson")),
        default_port,
    )?;
    // The connection host is the first instance. Older forms stored the IP in
    // service_name and left host empty, which made the workbench look connected
    // with an empty server list.
    let primary_host = connection
        .get("host")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty() && *s != "localhost")
        .map(|s| s.to_string())
        .or_else(|| {
            if looks_like_host(&service_name) {
                Some(service_name.clone())
            } else {
                None
            }
        });
    if let Some(host) = primary_host {
        if !seed_servers.iter().any(|s| s.host == host) {
            seed_servers.insert(
                0,
                ServerSpec {
                    id: format!("{host}:{default_port}"),
                    host: host.clone(),
                    port: default_port,
                    label: host,
                    enabled: true,
                    jump_id: String::new(),
                    user: String::new(),
                    password: String::new(),
                    log_dir: String::new(),
                },
            );
        }
    }

    Ok(GroupConfig {
        id,
        name,
        service_name,
        log_dir,
        log_glob,
        user,
        password,
        private_key,
        passphrase,
        jump_host: String::new(),
        jump_port: 22,
        jump_user: String::new(),
        jump_password: String::new(),
        jumps: Vec::new(),
        default_port,
        max_bytes_per_host,
        default_tail_lines,
        seed_servers,
        raw: connection,
    })
}

fn looks_like_host(value: &str) -> bool {
    let value = value.trim();
    if value.parse::<std::net::IpAddr>().is_ok() {
        return true;
    }
    value.contains('.') && !value.contains(' ') && !value.contains('/')
}

fn parse_seed_servers(raw: Option<&str>, default_port: u16) -> Result<Vec<ServerSpec>, PluginError> {
    let Some(text) = raw.map(str::trim).filter(|s| !s.is_empty()) else {
        return Ok(Vec::new());
    };
    let value: Value =
        serde_json::from_str(text).map_err(|e| plugin_err(format!("servers_json 无法解析: {e}")))?;
    let arr = value
        .as_array()
        .ok_or_else(|| plugin_err("servers_json 必须是数组"))?;
    let mut out = Vec::new();
    for (idx, item) in arr.iter().enumerate() {
        let host = item
            .get("host")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .ok_or_else(|| plugin_err(format!("servers_json[{idx}] 缺少 host")))?
            .to_string();
        let port = item
            .get("port")
            .and_then(Value::as_u64)
            .filter(|p| *p > 0)
            .unwrap_or(default_port as u64) as u16;
        let label = item
            .get("label")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or(&host)
            .to_string();
        let id = item
            .get("id")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .unwrap_or_else(|| format!("{host}:{port}"));
        let enabled = item
            .get("enabled")
            .and_then(Value::as_bool)
            .unwrap_or(true);
        out.push(ServerSpec {
            id,
            host,
            port,
            label,
            enabled,
            jump_id: jump_id_from(item),
            user: auth_user(item),
            password: auth_password(item),
            log_dir: auth_log_dir(item),
        });
    }
    Ok(out)
}

pub fn servers_from_params(params: &Value, default_port: u16) -> Result<Vec<ServerSpec>, PluginError> {
    if let Some(arr) = params.get("servers").and_then(Value::as_array) {
        let mut out = Vec::new();
        for (idx, item) in arr.iter().enumerate() {
            let host = item
                .get("host")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .ok_or_else(|| plugin_err(format!("servers[{idx}] 缺少 host")))?
                .to_string();
            let port = item
                .get("port")
                .and_then(Value::as_u64)
                .filter(|p| *p > 0)
                .unwrap_or(default_port as u64) as u16;
            let label = item
                .get("label")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .unwrap_or(&host)
                .to_string();
            let id = item
                .get("id")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string())
                .unwrap_or_else(|| format!("{host}:{port}"));
            let enabled = item
                .get("enabled")
                .and_then(Value::as_bool)
                .unwrap_or(true);
            out.push(ServerSpec {
                id,
                host,
                port,
                label,
                enabled,
                jump_id: jump_id_from(item),
            user: auth_user(item),
            password: auth_password(item),
            log_dir: auth_log_dir(item),
            });
        }
        return Ok(out);
    }
    Ok(Vec::new())
}

fn auth_user(item: &Value) -> String {
    optional_str(item, "user").unwrap_or("").to_string()
}

fn auth_password(item: &Value) -> String {
    item.get("password")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
}

fn auth_log_dir(item: &Value) -> String {
    optional_str(item, "logDir")
        .or_else(|| optional_str(item, "log_dir"))
        .unwrap_or("")
        .to_string()
}

fn jump_id_from(item: &Value) -> String {
    item.get("jumpId")
        .or_else(|| item.get("jump_id"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("")
        .to_string()
}

fn parse_jumps(arr: &[Value], previous: &[JumpSpec]) -> Vec<JumpSpec> {
    let mut out = Vec::new();
    for item in arr {
        let Some(host) = optional_str(item, "host") else {
            continue;
        };
        let host = host.to_string();
        let port = item
            .get("port")
            .and_then(Value::as_u64)
            .filter(|p| *p > 0)
            .unwrap_or(2222) as u16;
        let id = optional_str(item, "id")
            .map(|s| s.to_string())
            .unwrap_or_else(|| format!("{host}:{port}"));
        let prev = previous.iter().find(|j| j.id == id);
        let typed_password = item
            .get("password")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let password = if typed_password.is_empty() {
            prev.map(|p| p.password.clone()).unwrap_or_default()
        } else {
            typed_password
        };
        out.push(JumpSpec {
            id,
            label: optional_str(item, "label").unwrap_or("").to_string(),
            host,
            port,
            user: optional_str(item, "user").unwrap_or("").to_string(),
            password,
        });
    }
    out
}
