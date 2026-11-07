//! Shared SSH + SFTP sessions keyed by connectionId + host:port.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use datawise_plugin_sdk::PluginError;
use russh::client::{self, AuthResult, Handler};
use russh::keys::{decode_secret_key, key::PrivateKeyWithHashAlg};
use russh_sftp::client::SftpSession;

use crate::connection::{GroupConfig, JumpSpec, ServerSpec};
use crate::util::plugin_err;

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
    session: client::Handle<AcceptHost>,
    sftp: Option<SftpSession>,
    /// JumpServer menu session: one shell that has already entered the asset.
    shell: Option<russh::Channel<client::Msg>>,
    /// Kept alive so a direct-tcpip tunnel to the target stays open.
    _jump: Option<client::Handle<AcceptHost>>,
}

struct Login<'a> {
    user: &'a str,
    password: &'a str,
    private_key: &'a str,
    passphrase: &'a str,
}

static POOL: Mutex<Option<HashMap<String, Arc<tokio::sync::Mutex<Live>>>>> = Mutex::new(None);

fn pool() -> std::sync::MutexGuard<'static, Option<HashMap<String, Arc<tokio::sync::Mutex<Live>>>>> {
    POOL.lock().expect("ssh pool")
}

fn session_key(group_id: &str, server: &ServerSpec) -> String {
    format!(
        "{group_id}|{}:{}|{}|{}|{}|{}",
        server.host,
        server.port,
        server.jump_id.trim(),
        server.user.trim(),
        server.log_dir.trim(),
        cred_tag(&server.password)
    )
}

fn cred_tag(value: &str) -> u64 {
    value
        .bytes()
        .fold(0u64, |acc, byte| acc.wrapping_mul(131).wrapping_add(u64::from(byte)))
}

pub fn drop_group(group_id: &str) {
    let prefix = format!("{group_id}|");
    if let Some(map) = pool().as_mut() {
        map.retain(|k, _| !k.starts_with(&prefix));
    }
}

pub fn drop_server(group_id: &str, server: &ServerSpec) {
    let key = session_key(group_id, server);
    if let Some(map) = pool().as_mut() {
        map.remove(&key);
    }
}

/// Light noop on every live shell in the group so JumpServer idle kick is delayed.
pub async fn keepalive_group(group_id: &str) -> usize {
    let keys: Vec<String> = {
        let prefix = format!("{group_id}|");
        pool()
            .as_ref()
            .map(|map| {
                map.keys()
                    .filter(|k| k.starts_with(&prefix))
                    .cloned()
                    .collect()
            })
            .unwrap_or_default()
    };
    let mut ok = 0usize;
    for key in keys {
        let Some(live) = pool().as_ref().and_then(|m| m.get(&key).cloned()) else {
            continue;
        };
        let mut guard = live.lock().await;
        if let Some(shell) = guard.shell.as_mut() {
            if shell_exec(shell, "true").await.is_ok() {
                ok += 1;
            }
        } else {
            ok += 1;
        }
    }
    ok
}

fn target_login<'a>(cfg: &'a GroupConfig, server: &'a ServerSpec) -> Login<'a> {
    let own = !server.user.trim().is_empty() || !server.password.is_empty();
    Login {
        user: cfg.user_for(server),
        password: cfg.password_for(server),
        private_key: if own { "" } else { cfg.private_key.as_str() },
        passphrase: if own { "" } else { cfg.passphrase.as_str() },
    }
}

fn jump_login<'a>(cfg: &'a GroupConfig, jump: &'a JumpSpec) -> Login<'a> {
    let user = if jump.user.trim().is_empty() {
        cfg.user.as_str()
    } else {
        jump.user.trim()
    };
    if !jump.password.is_empty() {
        return Login {
            user,
            password: jump.password.as_str(),
            private_key: "",
            passphrase: "",
        };
    }
    if !cfg.private_key.trim().is_empty() {
        return Login {
            user,
            password: "",
            private_key: cfg.private_key.as_str(),
            passphrase: cfg.passphrase.as_str(),
        };
    }
    Login {
        user,
        password: cfg.password.as_str(),
        private_key: "",
        passphrase: "",
    }
}

async fn authenticate(
    session: &mut client::Handle<AcceptHost>,
    login: Login<'_>,
    where_: &str,
) -> Result<(), PluginError> {
    if !login.private_key.trim().is_empty() {
        let text = login.private_key.replace("\r\n", "\n");
        let pass = if login.passphrase.is_empty() {
            None
        } else {
            Some(login.passphrase)
        };
        let key = decode_secret_key(&text, pass)
            .map_err(|_| plugin_err("私钥无法使用，请检查私钥内容"))?;
        let hash = session
            .best_supported_rsa_hash()
            .await
            .ok()
            .flatten()
            .flatten();
        let result = session
            .authenticate_publickey(login.user, PrivateKeyWithHashAlg::new(Arc::new(key), hash))
            .await
            .map_err(|_| plugin_err(format!("{where_}登录没有通过，请检查私钥")))?;
        if matches!(result, AuthResult::Success) {
            return Ok(());
        }
        return Err(plugin_err(format!("{where_}登录没有通过，请检查私钥")));
    }
    if login.password.is_empty() {
        return Err(plugin_err(format!("请填写{where_}的密码或私钥")));
    }
    let result = session
        .authenticate_password(login.user, login.password)
        .await
        .map_err(|_| plugin_err(format!("{where_}登录没有通过，请检查用户名和密码")))?;
    if matches!(result, AuthResult::Success) {
        Ok(())
    } else {
        Err(plugin_err(format!("{where_}登录没有通过，请检查用户名和密码")))
    }
}

fn safe_host(host: &str) -> Result<(), PluginError> {
    let ok = !host.is_empty()
        && host
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | ':' | '-' | '_'));
    if ok {
        Ok(())
    } else {
        Err(plugin_err("服务器地址不正确"))
    }
}

fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 0xf) as usize] as char);
    }
    out
}

fn python_relay(host: &str, port: u16) -> String {
    let script = format!(
        "import socket,sys,threading\n\
s=socket.create_connection(({host:?},{port}),20)\n\
def pump(src):\n\
    try:\n\
        while True:\n\
            data=src.recv(65536)\n\
            if not data:\n\
                break\n\
            sys.stdout.buffer.write(data)\n\
            sys.stdout.buffer.flush()\n\
    except Exception:\n\
        pass\n\
threading.Thread(target=pump,args=(s,),daemon=True).start()\n\
while True:\n\
    data=sys.stdin.buffer.read(65536)\n\
    if not data:\n\
        break\n\
    s.sendall(data)\n"
    );
    format!(
        "python3 -c \"import sys;exec(bytes.fromhex('{}').decode())\"",
        hex_encode(script.as_bytes())
    )
}

async fn handshake(
    ssh_config: &Arc<client::Config>,
    stream: impl tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static,
) -> Result<client::Handle<AcceptHost>, ()> {
    match tokio::time::timeout(
        Duration::from_secs(8),
        client::connect_stream(Arc::clone(ssh_config), stream, AcceptHost),
    )
    .await
    {
        Ok(Ok(session)) => Ok(session),
        _ => Err(()),
    }
}

async fn try_direct_tcpip(
    ssh_config: &Arc<client::Config>,
    jump: &client::Handle<AcceptHost>,
    server: &ServerSpec,
) -> Result<client::Handle<AcceptHost>, ()> {
    let opened = tokio::time::timeout(
        Duration::from_secs(8),
        jump.channel_open_direct_tcpip(
            server.host.as_str(),
            u32::from(server.port),
            "127.0.0.1",
            0,
        ),
    )
    .await;
    let Ok(Ok(channel)) = opened else {
        return Err(());
    };
    handshake(ssh_config, channel.into_stream()).await
}

async fn try_relays(
    ssh_config: &Arc<client::Config>,
    jump: &client::Handle<AcceptHost>,
    server: &ServerSpec,
) -> Result<client::Handle<AcceptHost>, PluginError> {
    let commands = [
        python_relay(&server.host, server.port),
        format!(
            "stdbuf -o0 nc -w 20 {} {} || nc -w 20 {} {}",
            server.host, server.port, server.host, server.port
        ),
        format!("socat - TCP:{}:{}", server.host, server.port),
    ];
    for command in commands {
        let channel = match jump.channel_open_session().await {
            Ok(channel) => channel,
            Err(_) => break,
        };
        if channel.exec(true, command.as_bytes()).await.is_err() {
            continue;
        }
        if let Ok(session) = handshake(ssh_config, channel.into_stream()).await {
            return Ok(session);
        }
    }
    Err(plugin_err("跳板已经登录，但没有转到这台服务器"))
}

/// JumpServer / KoKo direct asset login:
/// `ssh -p2222 jumpserverUser@assetAccount@assetIp`
async fn open_jumpserver_asset(
    cfg: &GroupConfig,
    server: &ServerSpec,
    jump: &JumpSpec,
) -> Result<Live, PluginError> {
    safe_host(&server.host)?;
    let js_user = if jump.user.trim().is_empty() {
        cfg.user.trim()
    } else {
        jump.user.trim()
    };
    let account = cfg.user_for(server).trim();
    let password = if jump.password.is_empty() {
        cfg.password.as_str()
    } else {
        jump.password.as_str()
    };
    if js_user.is_empty() || account.is_empty() || password.is_empty() {
        return Err(plugin_err("跳板已经登录，但没有转到这台服务器"));
    }
    let jump_host = jump.host.trim();
    let jump_port = if jump.port == 0 { 2222 } else { jump.port };
    let candidates = [
        format!("{js_user}@{account}@{}", server.host),
        format!("{js_user}@{account}@{}@{jump_host}", server.host),
    ];
    let mut last_err = plugin_err("跳板已经登录，但没有转到这台服务器");
    for login_name in candidates {
        let ssh_config = Arc::new(client::Config::default());
        let mut session = match client::connect(ssh_config, (jump_host, jump_port), AcceptHost).await
        {
            Ok(session) => session,
            Err(_) => {
                last_err = plugin_err("连不上跳板机，请检查跳板地址和端口");
                continue;
            }
        };
        match session.authenticate_password(&login_name, password).await {
            Ok(AuthResult::Success) => {
                return finish_session(session, None, cfg, server, true).await;
            }
            Ok(_) => {
                last_err = plugin_err("跳板已经登录，但没有转到这台服务器");
            }
            Err(_) => {
                last_err = plugin_err("跳板已经登录，但没有转到这台服务器");
            }
        }
    }
    Err(last_err)
}

fn strip_ansi(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '\u{1b}' {
            if chars.peek() == Some(&'[') {
                chars.next();
                for next in chars.by_ref() {
                    if next.is_ascii_alphabetic() {
                        break;
                    }
                }
                continue;
            }
            if chars.peek() == Some(&']') {
                chars.next();
                for next in chars.by_ref() {
                    if next == '\u{7}' || next == '\u{1b}' {
                        break;
                    }
                }
                continue;
            }
        }
        if ch == '\r' {
            continue;
        }
        out.push(ch);
    }
    out
}

async fn send_line(channel: &russh::Channel<client::Msg>, line: &str) -> Result<(), PluginError> {
    let text = format!("{line}\r");
    channel
        .data(std::io::Cursor::new(text.into_bytes()))
        .await
        .map_err(|_| plugin_err("已经登录跳板，但没有进入这台服务器"))
}

async fn pump(channel: &mut russh::Channel<client::Msg>, buf: &mut String, idle: Duration) -> bool {
    match tokio::time::timeout(idle, channel.wait()).await {
        Ok(Some(russh::ChannelMsg::Data { data }))
        | Ok(Some(russh::ChannelMsg::ExtendedData { data, .. })) => {
            buf.push_str(&strip_ansi(&String::from_utf8_lossy(&data)));
            true
        }
        _ => false,
    }
}

fn asset_choice(text: &str, host: &str) -> Option<String> {
    for line in text.lines() {
        if !line.contains(host) {
            continue;
        }
        let id = line.split_whitespace().next()?.trim();
        if !id.is_empty() && id.chars().all(|c| c.is_ascii_digit()) {
            return Some(id.to_string());
        }
    }
    None
}

/// Log into JumpServer as the bastion user, then type the asset address at `Opt>`.
async fn enter_jumpserver_menu(
    session: &client::Handle<AcceptHost>,
    server: &ServerSpec,
) -> Result<russh::Channel<client::Msg>, PluginError> {
    safe_host(&server.host)?;
    let mut channel = session
        .channel_open_session()
        .await
        .map_err(|_| plugin_err("NOT_MENU"))?;
    let _ = channel
        .request_pty(false, "xterm", 220, 50, 0, 0, &[])
        .await;
    channel
        .request_shell(false)
        .await
        .map_err(|_| plugin_err("NOT_MENU"))?;

    let mut buf = String::new();
    let deadline = Instant::now() + Duration::from_secs(25);
    let mut saw_menu = false;
    let mut sent_search = false;
    let mut sent_partial = false;
    let mut sent_id = false;
    let mut sent_ready = false;
    let mut search_at = 0usize;
    let partial = server.host.rsplit('.').next().unwrap_or("");
    while Instant::now() < deadline {
        let idle = if buf.is_empty() {
            Duration::from_secs(8)
        } else {
            Duration::from_secs(3)
        };
        let got = pump(&mut channel, &mut buf, idle).await;
        if buf.contains("Opt>") || buf.contains("欢迎使用") {
            saw_menu = true;
        }
        if !saw_menu && !got && buf.is_empty() {
            return Err(plugin_err("NOT_MENU"));
        }
        if saw_menu && !sent_search && buf.contains("Opt>") {
            send_line(&channel, &server.host).await?;
            sent_search = true;
            search_at = buf.len();
            continue;
        }
        if buf.contains("没有匹配") || buf.contains("未找到") || buf.contains("No matching") {
            return Err(plugin_err("已经登录跳板，但没有进入这台服务器"));
        }
        let connected = buf.contains("开始连接")
            || buf.contains("Connecting to")
            || buf.contains("Last login");
        if sent_search && !sent_id && !connected {
            if let Some(id) = asset_choice(&buf, &server.host) {
                if buf.contains("ID>")
                    || buf.contains("请选择")
                    || buf.contains("输入ID")
                    || buf.contains("选择资产")
                {
                    send_line(&channel, &id).await?;
                    sent_id = true;
                    continue;
                }
            }
        }
        if sent_search && !sent_partial && !connected {
            let fresh = &buf[search_at.min(buf.len())..];
            if fresh.contains("Opt>") && !partial.is_empty() && partial != server.host {
                send_line(&channel, partial).await?;
                sent_partial = true;
                search_at = buf.len();
                continue;
            }
        }
        if connected && !sent_ready {
            send_line(&channel, "stty -echo 2>/dev/null; export PS1='DWPS1# '").await?;
            sent_ready = true;
            continue;
        }
        if buf.contains("DWPS1#") {
            return Ok(channel);
        }
        if !got && Instant::now() + Duration::from_secs(6) > deadline && !saw_menu {
            return Err(plugin_err("NOT_MENU"));
        }
    }
    if saw_menu {
        Err(plugin_err("已经登录跳板，但没有进入这台服务器"))
    } else {
        Err(plugin_err("NOT_MENU"))
    }
}

async fn shell_exec(
    channel: &mut russh::Channel<client::Msg>,
    command: &str,
) -> Result<String, PluginError> {
    let token = format!(
        "DW{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    );
    let begin = format!("{token}B");
    let end = format!("{token}E");
    let script = format!("printf '%s\\n' {begin}; {command}; printf '%s\\n' {end}");
    send_line(channel, &script).await?;
    let mut buf = String::new();
    let deadline = Instant::now() + Duration::from_secs(25);
    while Instant::now() < deadline {
        let _ = pump(channel, &mut buf, Duration::from_secs(8)).await;
        if buf.contains(&end) {
            break;
        }
    }
    let Some(end_at) = buf.rfind(&end) else {
        return Err(plugin_err("暂时读不到日志"));
    };
    let Some(begin_at) = buf[..end_at].rfind(&begin) else {
        return Err(plugin_err("暂时读不到日志"));
    };
    let body = buf[begin_at + begin.len()..end_at]
        .trim_matches(|c| c == '\n' || c == '\r' || c == ' ')
        .to_string();
    Ok(body)
}

async fn open_via_jump(
    cfg: &GroupConfig,
    server: &ServerSpec,
    jump: &JumpSpec,
) -> Result<Live, PluginError> {
    // JumpServer (usually :2222) does not expose TCP forwarding; try asset login first.
    if jump.port == 2222 || jump.port == 22222 {
        if let Ok(live) = open_jumpserver_asset(cfg, server, jump).await {
            return Ok(live);
        }
    }
    let ssh_config = Arc::new(client::Config::default());
    let jump_host = jump.host.trim();
    let jump_port = if jump.port == 0 { 22 } else { jump.port };
    let login = jump_login(cfg, jump);
    let mut jump_handle = client::connect(Arc::clone(&ssh_config), (jump_host, jump_port), AcceptHost)
        .await
        .map_err(|_| plugin_err("连不上跳板机，请检查跳板地址和端口"))?;
    authenticate(&mut jump_handle, login, "跳板").await?;
    match enter_jumpserver_menu(&jump_handle, server).await {
        Ok(channel) => {
            return Ok(Live {
                session: jump_handle,
                sftp: None,
                shell: Some(channel),
                _jump: None,
            });
        }
        Err(err) if err.message.contains("没有进入") => return Err(err),
        Err(_) => {}
    }
    if let Ok(session) = try_direct_tcpip(&ssh_config, &jump_handle, server).await {
        return finish_session(session, Some(jump_handle), cfg, server, false).await;
    }
    if let Ok(live) = open_jumpserver_asset(cfg, server, jump).await {
        return Ok(live);
    }
    let session = try_relays(&ssh_config, &jump_handle, server).await?;
    finish_session(session, Some(jump_handle), cfg, server, false).await
}

async fn open_live(cfg: &GroupConfig, server: &ServerSpec) -> Result<Live, PluginError> {
    if let Some(jump) = cfg.resolve_jump(server) {
        return open_via_jump(cfg, server, &jump).await;
    }
    let ssh_config = Arc::new(client::Config::default());
    let session = client::connect(
        ssh_config,
        (server.host.as_str(), server.port),
        AcceptHost,
    )
    .await
    .map_err(|_| plugin_err("连不上这台服务器，请检查地址和端口"))?;
    finish_session(session, None, cfg, server, false).await
}

async fn finish_session(
    mut session: client::Handle<AcceptHost>,
    jump: Option<client::Handle<AcceptHost>>,
    cfg: &GroupConfig,
    server: &ServerSpec,
    already_authed: bool,
) -> Result<Live, PluginError> {
    if !already_authed {
        authenticate(&mut session, target_login(cfg, server), "服务器").await?;
    }
    let channel = session
        .channel_open_session()
        .await
        .map_err(|_| plugin_err("这台服务器暂时无法读取日志"))?;
    channel
        .request_subsystem(true, "sftp")
        .await
        .map_err(|_| plugin_err("这台服务器暂时无法读取日志"))?;
    let sftp = SftpSession::new(channel.into_stream())
        .await
        .map_err(|_| plugin_err("这台服务器暂时无法读取日志"))?;
    Ok(Live {
        session,
        sftp: Some(sftp),
        shell: None,
        _jump: jump,
    })
}

async fn ensure(
    cfg: &GroupConfig,
    server: &ServerSpec,
) -> Result<Arc<tokio::sync::Mutex<Live>>, PluginError> {
    let key = session_key(&cfg.id, server);
    if let Some(existing) = pool().as_ref().and_then(|m| m.get(&key).cloned()) {
        return Ok(existing);
    }
    let live = open_live(cfg, server).await?;
    let arc = Arc::new(tokio::sync::Mutex::new(live));
    let mut guard = pool();
    let map = guard.get_or_insert_with(HashMap::new);
    map.insert(key, Arc::clone(&arc));
    Ok(arc)
}

pub async fn probe(cfg: &GroupConfig, server: &ServerSpec) -> Result<String, PluginError> {
    let key = session_key(&cfg.id, server);
    if let Some(map) = pool().as_mut() {
        map.remove(&key);
    }
    let live = open_live(cfg, server).await?;
    let arc = Arc::new(tokio::sync::Mutex::new(live));
    {
        let mut guard = pool();
        let map = guard.get_or_insert_with(HashMap::new);
        map.insert(key, arc);
    }
    Ok(if cfg.resolve_jump(server).is_some() {
        "已通过跳板连上".to_string()
    } else {
        "连接成功".to_string()
    })
}

#[derive(Debug, Clone)]
pub struct RemoteEntry {
    pub name: String,
    pub size: u64,
    pub is_dir: bool,
    pub mtime: i64,
}

pub async fn list_dir(
    cfg: &GroupConfig,
    server: &ServerSpec,
    path: &str,
) -> Result<Vec<RemoteEntry>, PluginError> {
    let live = ensure(cfg, server).await?;
    let mut live = live.lock().await;
    let dir = normalize_remote_path(path);
    if live.shell.is_some() {
        let output = shell_exec(live.shell.as_mut().unwrap(), &format!(
            "find {} -mindepth 1 -maxdepth 1 -printf '%f\\t%s\\t%y\\t%T@\\n'",
            shell_single_quote(&dir)
        )).await?;
        let mut out = Vec::new();
        for line in output.lines() {
            let mut parts = line.split('\t');
            let Some(name) = parts.next().map(str::trim).filter(|s| !s.is_empty()) else {
                continue;
            };
            if name == "." || name == ".." || name.contains("DWPS1") {
                continue;
            }
            let size = parts.next().unwrap_or("0").trim().parse::<u64>().unwrap_or(0);
            let kind = parts.next().unwrap_or("").trim();
            let mtime = parts
                .next()
                .and_then(|s| s.trim().parse::<f64>().ok())
                .map(|n| n as i64)
                .unwrap_or(0);
            out.push(RemoteEntry {
                name: name.to_string(),
                size,
                is_dir: kind == "d",
                mtime,
            });
        }
        out.sort_by(|a, b| a.name.cmp(&b.name));
        return Ok(out);
    }
    let sftp = live.sftp.as_ref().ok_or_else(|| plugin_err("打不开这台机器上的日志目录"))?;
    let entries = sftp
        .read_dir(&dir)
        .await
        .map_err(|_| plugin_err("打不开这台机器上的日志目录"))?;
    let mut out = Vec::new();
    for entry in entries {
        let name = entry.file_name();
        if name == "." || name == ".." || name.is_empty() {
            continue;
        }
        let meta = entry.metadata();
        let is_dir = meta.file_type().is_dir();
        let size = meta.size.unwrap_or(0);
        let mtime = meta.mtime.unwrap_or(0) as i64;
        out.push(RemoteEntry {
            name,
            size,
            is_dir,
            mtime,
        });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

async fn exec_stdout(
    cfg: &GroupConfig,
    server: &ServerSpec,
    command: &str,
) -> Result<Vec<u8>, PluginError> {
    let live = ensure(cfg, server).await?;
    let mut live = live.lock().await;
    if let Some(shell) = live.shell.as_mut() {
        let text = shell_exec(shell, command).await?;
        return Ok(text.into_bytes());
    }
    let mut channel = live
        .session
        .channel_open_session()
        .await
        .map_err(|_| plugin_err("暂时读不到日志"))?;
    channel
        .exec(true, command.as_bytes())
        .await
        .map_err(|_| plugin_err("暂时读不到日志"))?;

    let mut stdout = Vec::new();
    let mut closed = false;
    while !closed {
        match channel.wait().await {
            Some(russh::ChannelMsg::Data { ref data }) => stdout.extend_from_slice(data),
            Some(russh::ChannelMsg::Eof) | Some(russh::ChannelMsg::Close) | None => closed = true,
            Some(russh::ChannelMsg::ExitStatus { .. }) => {}
            Some(russh::ChannelMsg::ExtendedData { .. }) => {}
            _ => {}
        }
    }
    Ok(stdout)
}

/// Pull the last `max_bytes` of a remote file via `tail -c` (POSIX).
pub async fn read_tail_bytes(
    cfg: &GroupConfig,
    server: &ServerSpec,
    path: &str,
    max_bytes: u64,
) -> Result<Vec<u8>, PluginError> {
    let path = normalize_remote_path(path);
    let cmd = format!(
        "tail -c {} -- {}",
        max_bytes.max(1),
        shell_single_quote(&path)
    );
    exec_stdout(cfg, server, &cmd)
        .await
        .map_err(|_| plugin_err("暂时读不到日志"))
}

/// One page earlier than the live tail. Page 0 is the newest `page_size` lines.
pub async fn read_older_page(
    cfg: &GroupConfig,
    server: &ServerSpec,
    path: &str,
    page: usize,
    page_size: usize,
) -> Result<String, PluginError> {
    if page == 0 {
        return read_tail_lines(cfg, server, path, page_size).await;
    }
    let path = normalize_remote_path(path);
    let page_size = page_size.max(1).min(20_000);
    let total = page_size.saturating_mul(page.saturating_add(1)).min(20_000);
    let cmd = format!(
        "tail -n {} -- {} | head -n {}",
        total,
        shell_single_quote(&path),
        page_size
    );
    let bytes = exec_stdout(cfg, server, &cmd)
        .await
        .map_err(|_| plugin_err("暂时读不到更早的日志"))?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

/// Pull the last `n` lines via `tail -n` (same idea as `tail -200`).
pub async fn read_tail_lines(
    cfg: &GroupConfig,
    server: &ServerSpec,
    path: &str,
    n: usize,
) -> Result<String, PluginError> {
    let path = normalize_remote_path(path);
    let cmd = format!(
        "tail -n {} -- {}",
        n.max(1),
        shell_single_quote(&path)
    );
    let bytes = exec_stdout(cfg, server, &cmd)
        .await
        .map_err(|_| plugin_err("暂时读不到日志"))?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

/// File size and inode (`stat -c '%s %i'`). Inode is empty when unavailable.
pub async fn file_stat(
    cfg: &GroupConfig,
    server: &ServerSpec,
    path: &str,
) -> Result<(u64, String), PluginError> {
    let path = normalize_remote_path(path);
    let cmd = format!(
        "stat -c '%s %i' -- {} 2>/dev/null || wc -c < {}",
        shell_single_quote(&path),
        shell_single_quote(&path)
    );
    let text = exec_stdout(cfg, server, &cmd)
        .await
        .map_err(|_| plugin_err("暂时读不到日志"))?;
    let text = String::from_utf8_lossy(&text);
    let mut parts = text.split_whitespace();
    let size = parts
        .next()
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(0);
    let inode = parts.next().unwrap_or("").trim().to_string();
    Ok((size, inode))
}

/// Bytes from `offset` to EOF (for follow incremental reads).
pub async fn read_from_offset(
    cfg: &GroupConfig,
    server: &ServerSpec,
    path: &str,
    offset: u64,
) -> Result<String, PluginError> {
    let path = normalize_remote_path(path);
    if offset == 0 {
        return read_tail_lines(cfg, server, &path, 200).await;
    }
    // `tail -c +N` is 1-based: start at byte N.
    let cmd = format!(
        "tail -c +{} -- {}",
        offset.saturating_add(1),
        shell_single_quote(&path)
    );
    let bytes = exec_stdout(cfg, server, &cmd)
        .await
        .map_err(|_| plugin_err("暂时读不到日志"))?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

fn sanitize_log_ts(raw: &str) -> Result<String, PluginError> {
    let text = raw.trim().replace('T', " ");
    let ok = text.len() >= 16
        && text.bytes().all(|b| {
            b.is_ascii_digit() || b == b'-' || b == b':' || b == b' ' || b == b'.'
        });
    if !ok {
        return Err(plugin_err("时间格式不对，请用 年-月-日 时:分:秒"));
    }
    Ok(text.chars().take(19).collect())
}

/// Read lines whose leading timestamp falls in `[from, to]` (inclusive).
pub async fn read_time_range(
    cfg: &GroupConfig,
    server: &ServerSpec,
    path: &str,
    from: &str,
    to: &str,
    max_lines: usize,
) -> Result<String, PluginError> {
    let path = normalize_remote_path(path);
    let from = sanitize_log_ts(from)?;
    let to = sanitize_log_ts(to)?;
    if from > to {
        return Err(plugin_err("开始时间不能晚于结束时间"));
    }
    let n = max_lines.max(1).min(20_000);
    // Chronological logs: print in-range rows (and continuation lines), stop after `to`.
    let cmd = format!(
        "awk -v from={} -v to={} 'BEGIN{{s=0}} {{ if (match($0,/^[0-9]{{4}}-[0-9]{{2}}-[0-9]{{2}}[ T][0-9]{{2}}:[0-9]{{2}}:[0-9]{{2}}/)) {{ ts=substr($0,RSTART,19); gsub(/T/,\" \",ts); if (ts>to) {{ if (s) exit; next }} if (ts>=from) {{ s=1; print; next }} next }} if (s) print }}' {} | tail -n {}",
        shell_single_quote(&from),
        shell_single_quote(&to),
        shell_single_quote(&path),
        n
    );
    let bytes = exec_stdout(cfg, server, &cmd)
        .await
        .map_err(|_| plugin_err("这个时间段暂时读不到日志"))?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

#[derive(Debug, Clone, Copy, Default)]
pub struct GrepFlags {
    pub ignore_case: bool,
    pub whole_word: bool,
    pub whole_line: bool,
    pub fixed: bool,
}

/// Remote grep; returns `lineNo:content` lines.
pub async fn remote_grep(
    cfg: &GroupConfig,
    server: &ServerSpec,
    path: &str,
    patterns: &[String],
    max_lines: usize,
    flags: GrepFlags,
) -> Result<String, PluginError> {
    let exprs: Vec<String> = patterns
        .iter()
        .map(|p| p.trim())
        .filter(|p| !p.is_empty())
        .map(|p| format!("-e {}", shell_single_quote(p)))
        .collect();
    if exprs.is_empty() {
        return Ok(String::new());
    }
    let path = normalize_remote_path(path);
    let mut opts = String::from("-a -n");
    if flags.fixed {
        opts.push_str(" -F");
    }
    if flags.ignore_case {
        opts.push_str(" -i");
    }
    if flags.whole_word {
        opts.push_str(" -w");
    }
    if flags.whole_line {
        opts.push_str(" -x");
    }
    let cmd = format!(
        "grep {opts} {} -- {} 2>/dev/null | tail -n {}",
        exprs.join(" "),
        shell_single_quote(&path),
        max_lines.max(1)
    );
    let bytes = exec_stdout(cfg, server, &cmd).await?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

fn normalize_remote_path(path: &str) -> String {
    let t = path.trim();
    if t.is_empty() {
        "/".to_string()
    } else if t.starts_with('/') {
        t.trim_end_matches('/').to_string()
    } else {
        format!("/{}", t.trim_end_matches('/'))
    }
}

fn shell_single_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}
