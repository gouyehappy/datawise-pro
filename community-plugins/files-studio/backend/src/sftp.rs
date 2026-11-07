//! SFTP over russh. OpenDAL's SFTP service pulls a unix-only SSH stack, so
//! Windows builds talk to the subsystem directly.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use datawise_plugin_sdk::PluginError;
use russh::client::{self, AuthResult, Handler};
use russh::keys::{decode_secret_key, key::PrivateKeyWithHashAlg};
use russh_sftp::client::SftpSession;
use russh_sftp::protocol::FileType;
use serde_json::{json, Value};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

use crate::connection::MountConfig;
use crate::util::{normalize_prefix, plugin_err};

struct AcceptHost;

impl Handler for AcceptHost {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &russh::keys::PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true)
    }
}

struct Live {
    _session: client::Handle<AcceptHost>,
    sftp: SftpSession,
    home: String,
}

static SESSIONS: Mutex<Option<HashMap<String, Arc<tokio::sync::Mutex<Live>>>>> = Mutex::new(None);

fn map() -> std::sync::MutexGuard<'static, Option<HashMap<String, Arc<tokio::sync::Mutex<Live>>>>> {
    SESSIONS.lock().expect("sftp sessions")
}

pub fn drop_session(id: &str) {
    if let Some(map) = map().as_mut() {
        map.remove(id);
    }
}

fn store(id: &str, live: Live) {
    let mut guard = map();
    let map = guard.get_or_insert_with(HashMap::new);
    map.insert(id.to_string(), Arc::new(tokio::sync::Mutex::new(live)));
}

fn session(id: &str) -> Result<Arc<tokio::sync::Mutex<Live>>, PluginError> {
    map()
        .as_ref()
        .and_then(|m| m.get(id).cloned())
        .ok_or_else(|| plugin_err("SFTP 连接已断开，请重新打开"))
}

pub async fn connect(config: &MountConfig) -> Result<String, PluginError> {
    let creds = creds_from(config)?;
    let ssh_config = Arc::new(client::Config::default());
    let mut session = client::connect(ssh_config, (creds.host.as_str(), creds.port), AcceptHost)
        .await
        .map_err(|e| plugin_err(format!("SFTP 连不上 {}:{}: {e}", creds.host, creds.port)))?;
    authenticate(&mut session, &creds).await?;
    let channel = session
        .channel_open_session()
        .await
        .map_err(|e| plugin_err(format!("打不开 SSH 通道: {e}")))?;
    channel
        .request_subsystem(true, "sftp")
        .await
        .map_err(|e| plugin_err(format!("对方没有 SFTP 子系统: {e}")))?;
    let sftp = SftpSession::new(channel.into_stream())
        .await
        .map_err(|e| plugin_err(format!("SFTP 握手失败: {e}")))?;
    let home = sftp
        .canonicalize(".")
        .await
        .unwrap_or_else(|_| "/".to_string());
    let summary = format!("已连接 SFTP {}@{}:{} ({home})", creds.user, creds.host, creds.port);
    store(
        &config.id,
        Live {
            _session: session,
            sftp,
            home,
        },
    );
    Ok(summary)
}

pub async fn list(config: &MountConfig, params: &Value) -> Result<Value, PluginError> {
    let requested = params
        .get("prefix")
        .and_then(Value::as_str)
        .map(normalize_prefix)
        .unwrap_or_else(|| normalize_prefix(&config.default_prefix));
    config.guard.assert_path_allowed(&requested)?;
    let live = session(&config.id)?;
    let live = live.lock().await;
    let dir = if requested.trim_matches('/').is_empty() {
        live.home.clone()
    } else {
        abs_path(&live.home, requested.trim_matches('/'))
    };
    let entries = live
        .sftp
        .read_dir(&dir)
        .await
        .map_err(|e| plugin_err(format!("列目录失败: {e}")))?;
    let shown = display_path(&dir);
    let mut items = Vec::new();
    for entry in entries {
        let name = entry.file_name();
        if name == "." || name == ".." || name.is_empty() {
            continue;
        }
        let is_dir = matches!(entry.file_type(), FileType::Dir);
        let child = format!(
            "{}/{}{}",
            shown.trim_matches('/'),
            name,
            if is_dir { "/" } else { "" }
        );
        let size = entry.metadata().size.unwrap_or(0);
        items.push(json!({
            "name": name,
            "path": child,
            "type": if is_dir { "DIR" } else { "FILE" },
            "size": if is_dir { 0 } else { size },
            "modified": "",
            "etag": "",
            "contentType": "",
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
                .cmp(b.get("name").and_then(Value::as_str).unwrap_or("")),
        }
    });
    let prefix = if shown.ends_with('/') {
        shown
    } else {
        format!("{shown}/")
    };
    Ok(json!({
        "prefix": prefix.trim_start_matches('/'),
        "items": items,
        "count": items.len(),
        "totalSize": 0,
        "listMode": "sftp",
    }))
}

pub async fn stat(id: &str, path: &str) -> Result<(bool, u64), PluginError> {
    let live = session(id)?;
    let live = live.lock().await;
    let abs = abs_path(&live.home, path);
    let meta = live
        .sftp
        .symlink_metadata(&abs)
        .await
        .map_err(|e| plugin_err(format!("对象不存在：{path} ({e})")))?;
    let is_dir = matches!(meta.file_type(), FileType::Dir) || path.ends_with('/');
    Ok((is_dir, meta.size.unwrap_or(0)))
}

pub async fn file_len(id: &str, path: &str) -> Result<u64, PluginError> {
    let (is_dir, size) = stat(id, path).await?;
    if is_dir {
        return Err(plugin_err("这是文件夹"));
    }
    Ok(size)
}

pub async fn read_all(id: &str, path: &str) -> Result<Vec<u8>, PluginError> {
    let live = session(id)?;
    let live = live.lock().await;
    let abs = abs_path(&live.home, path);
    let mut file = live
        .sftp
        .open(&abs)
        .await
        .map_err(|e| plugin_err(format!("读取失败: {e}")))?;
    let mut buf = Vec::new();
    file.read_to_end(&mut buf)
        .await
        .map_err(|e| plugin_err(e.to_string()))?;
    Ok(buf)
}

pub async fn write_all(id: &str, path: &str, bytes: &[u8]) -> Result<(), PluginError> {
    let live = session(id)?;
    let live = live.lock().await;
    let abs = abs_path(&live.home, path);
    if let Some(parent) = abs.rsplit_once('/').map(|(p, _)| p.to_string()) {
        if !parent.is_empty() {
            let _ = live.sftp.create_dir(&parent).await;
        }
    }
    let mut file = live
        .sftp
        .create(&abs)
        .await
        .map_err(|e| plugin_err(format!("写入失败: {e}")))?;
    file.write_all(bytes)
        .await
        .map_err(|e| plugin_err(e.to_string()))?;
    file.flush().await.map_err(|e| plugin_err(e.to_string()))?;
    Ok(())
}

pub async fn mkdir(id: &str, path: &str) -> Result<(), PluginError> {
    let live = session(id)?;
    let live = live.lock().await;
    let abs = abs_path(&live.home, path.trim_end_matches('/'));
    live.sftp
        .create_dir(&abs)
        .await
        .map_err(|e| plugin_err(format!("新建文件夹失败: {e}")))?;
    Ok(())
}

pub async fn delete(id: &str, path: &str, recursive: bool) -> Result<(), PluginError> {
    let live = session(id)?;
    let mut live = live.lock().await;
    let abs = abs_path(&live.home, path.trim_end_matches('/'));
    delete_tree(&mut live.sftp, &abs, recursive).await
}

async fn delete_tree(sftp: &mut SftpSession, path: &str, recursive: bool) -> Result<(), PluginError> {
    let meta = sftp.symlink_metadata(path).await.ok();
    let is_dir = meta
        .as_ref()
        .map(|m| matches!(m.file_type(), FileType::Dir))
        .unwrap_or(false);
    if is_dir {
        if recursive {
            let entries = sftp
                .read_dir(path)
                .await
                .map_err(|e| plugin_err(e.to_string()))?;
            for entry in entries {
                let name = entry.file_name();
                if name == "." || name == ".." {
                    continue;
                }
                let child = format!("{path}/{name}");
                Box::pin(delete_tree(sftp, &child, true)).await?;
            }
        }
        sftp.remove_dir(path)
            .await
            .map_err(|e| plugin_err(e.to_string()))?;
    } else {
        sftp.remove_file(path)
            .await
            .map_err(|e| plugin_err(e.to_string()))?;
    }
    Ok(())
}

pub async fn list_files(id: &str, prefix: &str) -> Result<Vec<String>, PluginError> {
    let live = session(id)?;
    let mut live = live.lock().await;
    let start = if prefix.trim_matches('/').is_empty() {
        live.home.clone()
    } else {
        abs_path(&live.home, prefix.trim_matches('/'))
    };
    let mut out = Vec::new();
    collect_files(&mut live.sftp, &start, &mut out).await?;
    Ok(out)
}

async fn collect_files(
    sftp: &mut SftpSession,
    dir: &str,
    out: &mut Vec<String>,
) -> Result<(), PluginError> {
    let entries = sftp
        .read_dir(dir)
        .await
        .map_err(|e| plugin_err(e.to_string()))?;
    for entry in entries {
        let name = entry.file_name();
        if name == "." || name == ".." || name.is_empty() {
            continue;
        }
        let child = format!("{dir}/{name}");
        if matches!(entry.file_type(), FileType::Dir) {
            Box::pin(collect_files(sftp, &child, out)).await?;
        } else {
            out.push(display_path(&child));
        }
    }
    Ok(())
}

struct Creds {
    host: String,
    port: u16,
    user: String,
    password: String,
    private_key: String,
    passphrase: String,
}

fn creds_from(config: &MountConfig) -> Result<Creds, PluginError> {
    let connection = &config.raw;
    let external = obj(connection.get("external_config"));
    let secrets = obj(connection.get("connection_secrets"));
    let host = connection
        .get("host")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .or_else(|| str_of(&external, "host"))
        .ok_or_else(|| plugin_err("SFTP 需要主机"))?
        .to_string();
    let port = connection
        .get("port")
        .and_then(Value::as_u64)
        .filter(|p| *p > 0)
        .unwrap_or(22) as u16;
    let user = connection
        .get("user")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .or_else(|| str_of(&external, "username"))
        .ok_or_else(|| plugin_err("SFTP 需要用户名"))?
        .to_string();
    let password = connection
        .get("password")
        .and_then(Value::as_str)
        .or_else(|| str_of(&secrets, "password"))
        .unwrap_or("")
        .to_string();
    let private_key = str_of(&secrets, "private_key").unwrap_or("").to_string();
    let passphrase = str_of(&secrets, "private_key_passphrase")
        .unwrap_or("")
        .to_string();
    Ok(Creds {
        host,
        port,
        user,
        password,
        private_key,
        passphrase,
    })
}

async fn authenticate(
    session: &mut client::Handle<AcceptHost>,
    creds: &Creds,
) -> Result<(), PluginError> {
    if !creds.private_key.trim().is_empty() {
        let text = creds.private_key.replace("\r\n", "\n");
        let pass = if creds.passphrase.is_empty() {
            None
        } else {
            Some(creds.passphrase.as_str())
        };
        let key = decode_secret_key(&text, pass)
            .map_err(|e| plugin_err(format!("私钥无法解析: {e}")))?;
        let hash = session
            .best_supported_rsa_hash()
            .await
            .ok()
            .flatten()
            .flatten();
        let result = session
            .authenticate_publickey(&creds.user, PrivateKeyWithHashAlg::new(Arc::new(key), hash))
            .await
            .map_err(|e| plugin_err(format!("私钥登录失败: {e}")))?;
        if matches!(result, AuthResult::Success) {
            return Ok(());
        }
        return Err(plugin_err("私钥登录被拒绝"));
    }
    if creds.password.is_empty() {
        return Err(plugin_err("SFTP 需要密码或私钥"));
    }
    let result = session
        .authenticate_password(&creds.user, &creds.password)
        .await
        .map_err(|e| plugin_err(format!("密码登录失败: {e}")))?;
    if matches!(result, AuthResult::Success) {
        Ok(())
    } else {
        Err(plugin_err("密码登录被拒绝"))
    }
}

fn abs_path(home: &str, path: &str) -> String {
    let path = path.trim().trim_matches('/');
    if path.is_empty() {
        return home.to_string();
    }
    if path.starts_with('/') {
        return path.to_string();
    }
    let home_disp = home.trim_matches('/');
    if path == home_disp || path.starts_with(&format!("{home_disp}/")) {
        format!("/{path}")
    } else if home == "/" {
        format!("/{path}")
    } else {
        format!("{}/{}", home.trim_end_matches('/'), path)
    }
}

fn display_path(abs: &str) -> String {
    abs.trim_start_matches('/').trim_end_matches('/').to_string()
}

fn obj(value: Option<&Value>) -> serde_json::Map<String, Value> {
    value
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default()
}

fn str_of<'a>(map: &'a serde_json::Map<String, Value>, key: &str) -> Option<&'a str> {
    map.get(key).and_then(Value::as_str).filter(|s| !s.is_empty())
}
