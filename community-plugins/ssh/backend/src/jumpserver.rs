//! JumpServer / KoKo bastion helpers.
//!
//! Asset list prefers the JumpServer HTTP API (same source as the web “我的资产”
//! page) so the workbench shows the full permission set. Favorites sync with
//! `/api/v1/assets/favorite-assets/` (same as the web star). Enter still drives
//! the live Opt> PTY by hostname / IP / numeric menu id.

use serde_json::{json, Value};
use std::collections::HashSet;
use std::path::Path;
use std::time::{Duration, Instant};

use russh::client;
use russh::ChannelMsg;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

use crate::model::StoredConnection;
use crate::ssh::SshRuntime;

/// List assets: HTTP API first (full catalog + favorites), Opt> `p` as fallback.
pub async fn list_assets(
    ssh: &SshRuntime,
    session_id: &str,
    search: Option<&str>,
) -> Result<Value, String> {
    let connection = ssh.connection_for_session(session_id).await?;
    if !is_jumpserver(&connection) {
        return Err("This connection is not in JumpServer mode".to_string());
    }
    let query = search.map(str::trim).unwrap_or("").to_string();
    let local_favs = load_local_favorites(&ssh.data_dir(), &connection);

    match list_via_http(&connection, &query).await {
        Ok(mut assets) => {
            apply_local_favorite_fallback(&mut assets, &local_favs);
            sort_favorites_first(&mut assets);
            return Ok(json!({
                "bastionMode": "jumpserver",
                "source": "http",
                "assets": assets,
            }));
        }
        Err(http_error) => {
            let handle = ssh.session_handle(session_id).await?;
            match list_via_opt_menu(&handle, &query).await {
                Ok(mut assets) => {
                    for row in &mut assets {
                        let key = local_favorite_key(row);
                        if let Some(obj) = row.as_object_mut() {
                            obj.insert("favorite".into(), json!(local_favs.contains(&key)));
                        }
                    }
                    sort_favorites_first(&mut assets);
                    Ok(json!({
                        "bastionMode": "jumpserver",
                        "source": "opt",
                        "httpError": http_error,
                        "assets": assets,
                    }))
                }
                Err(opt_error) => Err(format!(
                    "Asset list failed (HTTP: {http_error}; Opt>: {opt_error})"
                )),
            }
        }
    }
}

/// Toggle JumpServer web favorite (HTTP). Falls back to local plugin store when
/// the API is unavailable or the asset has no UUID (Opt> rows).
pub async fn set_favorite(
    ssh: &SshRuntime,
    session_id: &str,
    asset_id: &str,
    address: &str,
    name: &str,
    favorite: bool,
) -> Result<Value, String> {
    let connection = ssh.connection_for_session(session_id).await?;
    if !is_jumpserver(&connection) {
        return Err("This connection is not in JumpServer mode".to_string());
    }
    let asset_id = asset_id.trim();
    let address = address.trim();
    let name = name.trim();
    if asset_id.is_empty() && address.is_empty() && name.is_empty() {
        return Err("assetId or address is required".to_string());
    }

    let mut synced = false;
    let mut sync_error = String::new();
    // JumpServer favorite API needs a real asset UUID (not Opt> row numbers).
    if looks_like_uuid(asset_id) {
        match toggle_http_favorite(&connection, asset_id, favorite).await {
            Ok(()) => synced = true,
            Err(error) => sync_error = error,
        }
    }

    let mut local = load_local_favorites(&ssh.data_dir(), &connection);
    let key = if !asset_id.is_empty() && !asset_id.chars().all(|c| c.is_ascii_digit()) {
        asset_id.to_string()
    } else {
        format!("{address}|{name}")
    };
    if favorite {
        local.insert(key);
    } else {
        local.remove(&key);
        if looks_like_uuid(asset_id) {
            local.remove(asset_id);
        }
        local.remove(&format!("{address}|{name}"));
    }
    save_local_favorites(&ssh.data_dir(), &connection, &local)?;

    Ok(json!({
        "success": true,
        "favorite": favorite,
        "synced": synced,
        "syncError": sync_error,
    }))
}

/// Type hostname / IP / Opt> id into the live workbench PTY (async — never
/// `blocking_send` under `runtime.block_on`).
pub async fn enter_asset(
    ssh: &SshRuntime,
    session_id: &str,
    address: &str,
    menu_id: Option<&str>,
) -> Result<Value, String> {
    let connection = ssh.connection_for_session(session_id).await?;
    if !is_jumpserver(&connection) {
        return Err("This connection is not in JumpServer mode".to_string());
    }
    let address = address.trim();
    let name_hint = address;
    // Prefer Opt> numeric id; HTTP UUIDs must not be typed into the menu.
    let target = menu_id
        .map(str::trim)
        .filter(|value| !value.is_empty() && value.chars().all(|c| c.is_ascii_digit()))
        .or_else(|| {
            let trimmed = address.trim();
            (!trimmed.is_empty()).then_some(trimmed)
        })
        .ok_or_else(|| "Asset address or Opt> id is required".to_string())?;

    // Ctrl+C then target: cancel any half-typed Opt> input without quitting KoKo
    // (`exit` / `q` would leave the bastion session).
    ssh.write_terminal_async(session_id, b"\x03".to_vec())
        .await?;
    tokio::time::sleep(Duration::from_millis(120)).await;
    ssh.write_terminal_async(session_id, format!("{target}\r").into_bytes())
        .await?;

    Ok(json!({
        "success": true,
        "address": name_hint,
        "menuId": menu_id.unwrap_or(""),
        "typed": target,
    }))
}

pub fn is_jumpserver(connection: &StoredConnection) -> bool {
    connection.bastion_mode.eq_ignore_ascii_case("jumpserver")
}

struct JsHttpSession {
    host: String,
    port: u16,
    token: String,
    user_id: String,
}

async fn login_http(connection: &StoredConnection) -> Result<JsHttpSession, String> {
    let host = if connection.host.is_empty() {
        connection.runtime_host.clone()
    } else {
        connection.host.clone()
    };
    let port = if connection.bastion_web_port > 0 {
        connection.bastion_web_port
    } else {
        801
    };
    if connection.username.is_empty() || connection.password.is_empty() {
        return Err("JumpServer HTTP needs bastion user + password".to_string());
    }
    let auth_body = json!({
        "username": connection.username,
        "password": connection.password,
    });
    let (status, auth_raw) = http_json(
        &host,
        port,
        "POST",
        "/api/v1/authentication/auth/",
        Some(auth_body.to_string().as_bytes()),
        None,
    )
    .await?;
    if !(200..300).contains(&status) {
        return Err(format!(
            "auth HTTP {status}: {}",
            truncate_for_error(&auth_raw)
        ));
    }
    let auth_json: Value =
        serde_json::from_str(&auth_raw).map_err(|error| format!("auth JSON: {error}"))?;
    let token = auth_json
        .get("token")
        .or_else(|| auth_json.pointer("/data/token"))
        .and_then(Value::as_str)
        .ok_or_else(|| "auth response missing token".to_string())?
        .to_string();
    let user_id = auth_json
        .pointer("/user/id")
        .or_else(|| auth_json.pointer("/data/user/id"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    Ok(JsHttpSession {
        host,
        port,
        token,
        user_id,
    })
}

async fn list_via_http(connection: &StoredConnection, search: &str) -> Result<Vec<Value>, String> {
    let session = login_http(connection).await?;
    let favorites = fetch_favorite_ids(&session).await.unwrap_or_default();

    let mut paths = vec!["/api/v1/perms/users/assets/".to_string()];
    if !session.user_id.is_empty() {
        paths.push(format!("/api/v1/perms/users/{}/assets/", session.user_id));
    }

    let mut last_error = String::new();
    for path in paths {
        match fetch_asset_pages(&session, &path, search).await {
            Ok(mut assets) => {
                if assets.is_empty() && !search.is_empty() {
                    last_error = format!("{path} returned 0 assets");
                    continue;
                }
                for row in &mut assets {
                    let id = row.get("id").and_then(Value::as_str).unwrap_or("");
                    let marked = favorites.contains(id)
                        || row
                            .get("favorite")
                            .and_then(Value::as_bool)
                            .unwrap_or(false);
                    if let Some(obj) = row.as_object_mut() {
                        obj.insert("favorite".into(), json!(marked));
                    }
                }
                return Ok(assets);
            }
            Err(error) => last_error = error,
        }
    }
    Err(if last_error.is_empty() {
        "no asset API path succeeded".to_string()
    } else {
        last_error
    })
}

async fn toggle_http_favorite(
    connection: &StoredConnection,
    asset_id: &str,
    favorite: bool,
) -> Result<(), String> {
    let session = login_http(connection).await?;
    if favorite {
        let body = json!({ "asset": asset_id });
        let (status, raw) = http_json(
            &session.host,
            session.port,
            "POST",
            "/api/v1/assets/favorite-assets/",
            Some(body.to_string().as_bytes()),
            Some(&session.token),
        )
        .await?;
        if !(200..300).contains(&status) {
            return Err(format!(
                "favorite HTTP {status}: {}",
                truncate_for_error(&raw)
            ));
        }
    } else {
        let path = format!(
            "/api/v1/assets/favorite-assets/?asset={}",
            urlencoding_encode(asset_id)
        );
        let (status, raw) = http_json(
            &session.host,
            session.port,
            "DELETE",
            &path,
            None,
            Some(&session.token),
        )
        .await?;
        // 204/200 ok; 404 already unfavorited.
        if !(200..300).contains(&status) && status != 404 {
            return Err(format!(
                "unfavorite HTTP {status}: {}",
                truncate_for_error(&raw)
            ));
        }
    }
    Ok(())
}

async fn fetch_favorite_ids(session: &JsHttpSession) -> Result<HashSet<String>, String> {
    let mut ids = HashSet::new();
    let mut offset = 0_usize;
    let limit = 100_usize;
    for _ in 0..50 {
        let path = format!("/api/v1/assets/favorite-assets/?limit={limit}&offset={offset}");
        let (status, body) = http_json(
            &session.host,
            session.port,
            "GET",
            &path,
            None,
            Some(&session.token),
        )
        .await?;
        if !(200..300).contains(&status) {
            return Err(format!(
                "favorites HTTP {status}: {}",
                truncate_for_error(&body)
            ));
        }
        let parsed: Value =
            serde_json::from_str(&body).map_err(|error| format!("favorites JSON: {error}"))?;
        let page = asset_page_items(&parsed);
        let page_len = page.len();
        for item in page {
            if let Some(id) = favorite_item_asset_id(&item) {
                ids.insert(id);
            }
        }
        offset += page_len;
        if page_len == 0 {
            break;
        }
        let total = parsed
            .get("count")
            .and_then(Value::as_u64)
            .map(|value| value as usize);
        if let Some(total) = total {
            if offset >= total {
                break;
            }
        } else if page_len < limit {
            break;
        }
    }
    Ok(ids)
}

fn favorite_item_asset_id(item: &Value) -> Option<String> {
    if let Some(id) = item
        .get("asset")
        .and_then(|value| value.as_str().map(str::to_string).or_else(|| {
            value.as_object().and_then(|obj| {
                obj.get("id")
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
        }))
    {
        return Some(id);
    }
    item.pointer("/asset_info/id")
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| item.get("id").and_then(Value::as_str).map(str::to_string))
}

fn looks_like_uuid(value: &str) -> bool {
    let value = value.trim();
    value.len() >= 32
        && value.chars().filter(|c| *c == '-').count() >= 4
        && value
            .chars()
            .all(|c| c.is_ascii_hexdigit() || c == '-')
}

fn local_favorites_path(data_dir: &Path, connection: &StoredConnection) -> std::path::PathBuf {
    let host = if connection.host.is_empty() {
        connection.runtime_host.as_str()
    } else {
        connection.host.as_str()
    };
    let safe = format!(
        "{}__{}",
        host.replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_"),
        connection.username.replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_")
    );
    data_dir
        .join("jumpserver-favorites")
        .join(format!("{safe}.json"))
}

fn load_local_favorites(data_dir: &Path, connection: &StoredConnection) -> HashSet<String> {
    let path = local_favorites_path(data_dir, connection);
    let Ok(raw) = std::fs::read_to_string(path) else {
        return HashSet::new();
    };
    let Ok(value) = serde_json::from_str::<Value>(&raw) else {
        return HashSet::new();
    };
    value
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::to_string)
        .collect()
}

fn save_local_favorites(
    data_dir: &Path,
    connection: &StoredConnection,
    favorites: &HashSet<String>,
) -> Result<(), String> {
    let path = local_favorites_path(data_dir, connection);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("create favorites dir: {error}"))?;
    }
    let mut list: Vec<&String> = favorites.iter().collect();
    list.sort();
    let raw = serde_json::to_string_pretty(&list)
        .map_err(|error| format!("serialize favorites: {error}"))?;
    std::fs::write(&path, raw).map_err(|error| format!("write favorites: {error}"))
}

fn local_favorite_key(row: &Value) -> String {
    let id = row.get("id").and_then(Value::as_str).unwrap_or("");
    if looks_like_uuid(id) {
        return id.to_string();
    }
    format!(
        "{}|{}",
        row.get("address").and_then(Value::as_str).unwrap_or(""),
        row.get("name").and_then(Value::as_str).unwrap_or("")
    )
}

fn apply_local_favorite_fallback(assets: &mut [Value], local: &HashSet<String>) {
    for row in assets {
        let already = row
            .get("favorite")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        if already {
            continue;
        }
        let key = local_favorite_key(row);
        if local.contains(&key) {
            if let Some(obj) = row.as_object_mut() {
                obj.insert("favorite".into(), json!(true));
            }
        }
    }
}

fn sort_favorites_first(assets: &mut [Value]) {
    assets.sort_by(|a, b| {
        let af = a.get("favorite").and_then(Value::as_bool).unwrap_or(false);
        let bf = b.get("favorite").and_then(Value::as_bool).unwrap_or(false);
        bf.cmp(&af).then_with(|| {
            let an = a.get("name").and_then(Value::as_str).unwrap_or("");
            let bn = b.get("name").and_then(Value::as_str).unwrap_or("");
            an.cmp(bn)
        })
    });
}

async fn fetch_asset_pages(
    session: &JsHttpSession,
    base_path: &str,
    search: &str,
) -> Result<Vec<Value>, String> {
    let mut assets = Vec::new();
    let mut seen = HashSet::new();
    let mut offset = 0_usize;
    let limit = 100_usize;
    for _ in 0..50 {
        let mut path = format!("{base_path}?limit={limit}&offset={offset}");
        if !search.is_empty() {
            path.push_str(&format!("&search={}", urlencoding_encode(search)));
        }
        let (status, body) = http_json(
            &session.host,
            session.port,
            "GET",
            &path,
            None,
            Some(&session.token),
        )
        .await?;
        if status == 401 || status == 403 {
            return Err(format!("assets HTTP {status}: {}", truncate_for_error(&body)));
        }
        if !(200..300).contains(&status) {
            return Err(format!("assets HTTP {status}: {}", truncate_for_error(&body)));
        }
        let parsed: Value =
            serde_json::from_str(&body).map_err(|error| format!("assets JSON: {error}"))?;
        let page = asset_page_items(&parsed);
        let page_len = page.len();
        for item in page {
            if let Some(row) = normalize_http_asset(&item) {
                let key = format!(
                    "{}|{}|{}",
                    row["id"].as_str().unwrap_or(""),
                    row["address"].as_str().unwrap_or(""),
                    row["name"].as_str().unwrap_or("")
                );
                if seen.insert(key) {
                    assets.push(row);
                }
            }
        }
        let total = parsed
            .get("count")
            .and_then(Value::as_u64)
            .map(|value| value as usize);
        offset += page_len;
        if page_len == 0 {
            break;
        }
        if let Some(total) = total {
            if offset >= total {
                break;
            }
        } else if page_len < limit {
            break;
        }
    }
    if !search.is_empty() {
        let filter = search.to_ascii_lowercase();
        assets.retain(|row| {
            let hay = format!(
                "{} {} {}",
                row["name"].as_str().unwrap_or(""),
                row["address"].as_str().unwrap_or(""),
                row["comment"].as_str().unwrap_or("")
            )
            .to_ascii_lowercase();
            hay.contains(&filter)
        });
    }
    Ok(assets)
}

fn asset_page_items(parsed: &Value) -> Vec<Value> {
    if let Some(results) = parsed.get("results").and_then(Value::as_array) {
        return results.clone();
    }
    if let Some(data) = parsed.get("data") {
        if let Some(results) = data.get("results").and_then(Value::as_array) {
            return results.clone();
        }
        if let Some(arr) = data.as_array() {
            return arr.clone();
        }
    }
    if let Some(arr) = parsed.as_array() {
        return arr.clone();
    }
    Vec::new()
}

fn normalize_http_asset(item: &Value) -> Option<Value> {
    let id = item
        .get("id")
        .and_then(|value| value.as_str().map(str::to_string).or_else(|| {
            value.as_i64().map(|n| n.to_string())
        }))
        .unwrap_or_default();
    let name = first_string(item, &["hostname", "name", "asset_name", "title"])
        .unwrap_or_default();
    let address = first_string(item, &["ip", "address", "host"]).unwrap_or_else(|| name.clone());
    let comment = first_string(item, &["comment", "remark", "notes"]).unwrap_or_default();
    if name.is_empty() && address.is_empty() {
        return None;
    }
    let display_name = if name.is_empty() {
        address.clone()
    } else {
        name.clone()
    };
    let display_address = if address.is_empty() { name } else { address };
    let favorite = item
        .get("is_favorite")
        .or_else(|| item.get("favorite"))
        .or_else(|| item.get("is_favorited"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    Some(json!({
        "id": id,
        "name": display_name,
        "address": display_address,
        "comment": comment,
        "favorite": favorite,
    }))
}

fn first_string(item: &Value, keys: &[&str]) -> Option<String> {
    for key in keys {
        if let Some(value) = item.get(*key) {
            if let Some(text) = value.as_str() {
                let trimmed = text.trim();
                if !trimmed.is_empty() {
                    return Some(trimmed.to_string());
                }
            }
        }
    }
    None
}

fn urlencoding_encode(value: &str) -> String {
    let mut out = String::with_capacity(value.len() * 3);
    for byte in value.as_bytes() {
        match *byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(char::from(*byte));
            }
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

fn truncate_for_error(text: &str) -> String {
    const MAX: usize = 240;
    let flat: String = text.chars().map(|c| if c.is_control() { ' ' } else { c }).collect();
    if flat.chars().count() <= MAX {
        flat
    } else {
        format!("{}…", flat.chars().take(MAX).collect::<String>())
    }
}

/// Minimal HTTP/1.1 JSON client (JumpServer web port is typically cleartext).
async fn http_json(
    host: &str,
    port: u16,
    method: &str,
    path: &str,
    body: Option<&[u8]>,
    bearer: Option<&str>,
) -> Result<(u16, String), String> {
    let addr = format!("{host}:{port}");
    let mut stream = tokio::time::timeout(Duration::from_secs(8), TcpStream::connect(&addr))
        .await
        .map_err(|_| format!("HTTP connect to {addr} timed out"))?
        .map_err(|error| format!("HTTP connect to {addr}: {error}"))?;

    let mut request = format!(
        "{method} {path} HTTP/1.1\r\nHost: {host}:{port}\r\nAccept: application/json\r\nConnection: close\r\nUser-Agent: datawise-ssh-plugin\r\n"
    );
    if let Some(token) = bearer {
        request.push_str(&format!("Authorization: Bearer {token}\r\n"));
    }
    if let Some(bytes) = body {
        request.push_str("Content-Type: application/json\r\n");
        request.push_str(&format!("Content-Length: {}\r\n", bytes.len()));
        request.push_str("\r\n");
        stream
            .write_all(request.as_bytes())
            .await
            .map_err(|error| format!("HTTP write headers: {error}"))?;
        stream
            .write_all(bytes)
            .await
            .map_err(|error| format!("HTTP write body: {error}"))?;
    } else {
        request.push_str("\r\n");
        stream
            .write_all(request.as_bytes())
            .await
            .map_err(|error| format!("HTTP write: {error}"))?;
    }

    let mut raw = Vec::with_capacity(64 * 1024);
    let mut buf = [0_u8; 8192];
    let deadline = Instant::now() + Duration::from_secs(20);
    loop {
        if Instant::now() > deadline {
            break;
        }
        let n = tokio::time::timeout(Duration::from_secs(5), stream.read(&mut buf))
            .await
            .map_err(|_| "HTTP read timed out".to_string())?
            .map_err(|error| format!("HTTP read: {error}"))?;
        if n == 0 {
            break;
        }
        raw.extend_from_slice(&buf[..n]);
        if raw.len() > 8 * 1024 * 1024 {
            return Err("HTTP response too large".to_string());
        }
    }

    let text = String::from_utf8_lossy(&raw);
    let (header, body) = text
        .split_once("\r\n\r\n")
        .or_else(|| text.split_once("\n\n"))
        .ok_or_else(|| "HTTP response missing header terminator".to_string())?;
    let status = header
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|code| code.parse::<u16>().ok())
        .unwrap_or(0);

    let lower = header.to_ascii_lowercase();
    let body = if lower.contains("transfer-encoding: chunked") {
        decode_chunked(body).unwrap_or_else(|| body.to_string())
    } else {
        body.to_string()
    };
    Ok((status, body))
}

fn decode_chunked(body: &str) -> Option<String> {
    let mut out = String::new();
    let mut rest = body;
    while !rest.is_empty() {
        let (size_line, after) = rest.split_once("\r\n").or_else(|| rest.split_once('\n'))?;
        let size = usize::from_str_radix(size_line.trim(), 16).ok()?;
        if size == 0 {
            break;
        }
        if after.len() < size {
            return None;
        }
        out.push_str(&after[..size]);
        rest = after[size..].trim_start_matches("\r\n").trim_start_matches('\n');
    }
    Some(out)
}

async fn list_via_opt_menu(
    handle: &client::Handle<crate::ssh::SshClient>,
    search: &str,
) -> Result<Vec<Value>, String> {
    let mut channel = handle
        .channel_open_session()
        .await
        .map_err(|error| format!("Failed to open JumpServer menu channel: {error}"))?;
    let _ = channel
        .request_pty(false, "xterm", 220, 60, 0, 0, &[])
        .await;
    channel
        .request_shell(false)
        .await
        .map_err(|error| format!("Failed to start JumpServer menu shell: {error}"))?;

    let mut buf = String::new();
    wait_for_opt(&mut channel, &mut buf).await?;

    let command = if search.is_empty() {
        "p".to_string()
    } else if search.starts_with('/') {
        search.to_string()
    } else {
        format!("/{search}")
    };
    send_line(&channel, &command).await?;
    pump_until_idle(&mut channel, &mut buf, Duration::from_secs(4)).await;

    for _ in 0..12 {
        let (page, total) = parse_page_indicator(&buf);
        if total <= 1 || page == 0 || page >= total {
            break;
        }
        send_line(&channel, "n").await?;
        pump_until_idle(&mut channel, &mut buf, Duration::from_secs(3)).await;
    }

    let _ = channel.close().await;
    let assets = parse_opt_assets(&buf, search);
    if assets.is_empty() {
        return Err(format!(
            "No assets parsed from Opt> (sent {command:?})"
        ));
    }
    Ok(assets)
}

async fn wait_for_opt(
    channel: &mut russh::Channel<client::Msg>,
    buf: &mut String,
) -> Result<(), String> {
    let deadline = Instant::now() + Duration::from_secs(18);
    while Instant::now() < deadline {
        pump_until_idle(channel, buf, Duration::from_secs(2)).await;
        if buf.contains("Opt>") {
            return Ok(());
        }
    }
    Err("JumpServer menu not detected. Confirm KoKo SSH login lands on Opt>.".to_string())
}

async fn send_line(
    channel: &russh::Channel<client::Msg>,
    line: &str,
) -> Result<(), String> {
    let text = format!("{line}\r");
    channel
        .data(std::io::Cursor::new(text.into_bytes()))
        .await
        .map_err(|error| format!("Failed to write JumpServer menu input: {error}"))
}

async fn pump_until_idle(
    channel: &mut russh::Channel<client::Msg>,
    buf: &mut String,
    idle: Duration,
) {
    loop {
        match tokio::time::timeout(idle, channel.wait()).await {
            Ok(Some(ChannelMsg::Data { data }))
            | Ok(Some(ChannelMsg::ExtendedData { data, .. })) => {
                buf.push_str(&strip_ansi(&String::from_utf8_lossy(&data)));
            }
            Ok(Some(_)) => continue,
            Ok(None) | Err(_) => break,
        }
    }
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

fn parse_page_indicator(text: &str) -> (usize, usize) {
    for line in text.lines().rev().take(40) {
        let lower = line.to_ascii_lowercase();
        if let Some(pair) = extract_page_pair(&lower).or_else(|| extract_page_pair(line)) {
            return pair;
        }
    }
    (0, 0)
}

fn extract_page_pair(line: &str) -> Option<(usize, usize)> {
    let has_page = line.contains("page") || line.contains('页');
    let bytes = line.as_bytes();
    let mut i = 0;
    while i + 2 < bytes.len() {
        if bytes[i].is_ascii_digit() {
            let start = i;
            while i < bytes.len() && bytes[i].is_ascii_digit() {
                i += 1;
            }
            if i < bytes.len() && bytes[i] == b'/' {
                i += 1;
                let mid = i;
                while i < bytes.len() && bytes[i].is_ascii_digit() {
                    i += 1;
                }
                if mid < i {
                    let left: usize = line[start..mid - 1].parse().ok()?;
                    let right: usize = line[mid..i].parse().ok()?;
                    if right > 0 && left > 0 && left <= right && (has_page || right <= 200) {
                        return Some((left, right));
                    }
                }
            }
        } else {
            i += 1;
        }
    }
    None
}

fn parse_opt_assets(text: &str, search: &str) -> Vec<Value> {
    let mut assets = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let filter = search.trim().trim_start_matches('/').to_ascii_lowercase();
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let lower = trimmed.to_ascii_lowercase();
        if trimmed.contains("Opt>")
            || trimmed.contains("ID>")
            || trimmed.contains("欢迎")
            || lower.contains("welcome")
            || lower.starts_with("page")
            || trimmed.contains('页')
            || trimmed.starts_with("---")
            || lower.starts_with("tips:")
            || (lower.starts_with("id ")
                && (lower.contains("name") || lower.contains("hostname") || lower.contains("ip")))
        {
            continue;
        }
        if trimmed
            .chars()
            .next()
            .is_some_and(|c| c.is_ascii_digit())
            && trimmed.contains(')')
            && (lower.contains("enter ") || trimmed.contains('）'))
        {
            continue;
        }
        let cols: Vec<&str> = trimmed.split_whitespace().collect();
        if cols.len() < 2 {
            continue;
        }
        let id = cols[0];
        if id.is_empty() || !id.chars().all(|c| c.is_ascii_digit()) {
            continue;
        }
        let name = cols.get(1).copied().unwrap_or("").to_string();
        if name == ")" || name.starts_with(')') {
            continue;
        }
        let address = cols
            .iter()
            .skip(2)
            .find(|col| looks_like_host(col))
            .or_else(|| cols.iter().skip(1).find(|col| looks_like_ipv4(col)))
            .copied()
            .unwrap_or("")
            .to_string();
        if name.is_empty() && address.is_empty() {
            continue;
        }
        if !filter.is_empty() {
            let hay = format!("{name} {address} {id}").to_ascii_lowercase();
            if !hay.contains(&filter) {
                continue;
            }
        }
        let key = format!("{id}:{address}:{name}");
        if !seen.insert(key) {
            continue;
        }
        assets.push(json!({
            "id": id,
            "name": name,
            "address": if address.is_empty() { name.clone() } else { address },
            "comment": "",
            "favorite": false,
        }));
    }
    assets
}

fn looks_like_ipv4(value: &str) -> bool {
    let parts: Vec<&str> = value.split('.').collect();
    parts.len() == 4 && parts.iter().all(|p| p.parse::<u8>().is_ok())
}

fn looks_like_host(value: &str) -> bool {
    if looks_like_ipv4(value) {
        return true;
    }
    value.contains('.') && value.contains(char::is_alphabetic)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_opt_assets_reads_numbered_rows() {
        let text = r#"
欢迎使用 JumpServer
  ID  Name     Address      User
  1   web-01   10.0.0.8     root
  2   db-01    10.0.0.9     deploy
Opt>
"#;
        let rows = parse_opt_assets(text, "");
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0]["name"], "web-01");
    }

    #[test]
    fn parse_opt_assets_filters_search() {
        let text = "1 web-01 10.0.0.8\n2 db-01 10.0.0.9\nOpt>\n";
        let rows = parse_opt_assets(text, "db");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0]["name"], "db-01");
    }

    #[test]
    fn parse_opt_assets_skips_banner_help_lines() {
        let text = r#"
         3) Enter p to display the assets you have permission.
         1   k8s-126   192.0.2.126
Opt>
"#;
        let rows = parse_opt_assets(text, "");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0]["name"], "k8s-126");
    }

    #[test]
    fn parse_page_indicator_reads_slash_form() {
        assert_eq!(parse_page_indicator("Page: 2/6\nOpt>\n"), (2, 6));
    }

    #[test]
    fn hostname_as_ip_column() {
        let text = "1 192.0.2.82 192.0.2.82 root\nOpt>\n";
        let rows = parse_opt_assets(text, "");
        assert_eq!(rows[0]["address"], "192.0.2.82");
    }

    #[test]
    fn normalize_http_asset_maps_jumpserver_fields() {
        let item = json!({
            "id": "abc-uuid",
            "hostname": "k8s-126",
            "ip": "192.0.2.126",
            "comment": "prod"
        });
        let row = normalize_http_asset(&item).unwrap();
        assert_eq!(row["id"], "abc-uuid");
        assert_eq!(row["name"], "k8s-126");
        assert_eq!(row["address"], "192.0.2.126");
        assert_eq!(row["comment"], "prod");
    }

    #[test]
    fn asset_page_items_reads_results_envelope() {
        let parsed = json!({"count": 2, "results": [{"hostname": "a"}, {"hostname": "b"}]});
        assert_eq!(asset_page_items(&parsed).len(), 2);
    }

    #[test]
    fn decode_chunked_body() {
        let raw = "5\r\nhello\r\n0\r\n\r\n";
        assert_eq!(decode_chunked(raw).as_deref(), Some("hello"));
    }

    #[test]
    fn looks_like_uuid_accepts_jumpserver_ids() {
        assert!(looks_like_uuid("a1b2c3d4-e5f6-7890-abcd-ef1234567890"));
        assert!(!looks_like_uuid("12"));
        assert!(!looks_like_uuid("k8s-126"));
    }

    #[test]
    fn favorite_item_reads_nested_asset() {
        let item = json!({"asset": "uuid-1"});
        assert_eq!(favorite_item_asset_id(&item).as_deref(), Some("uuid-1"));
        let nested = json!({"asset": {"id": "uuid-2", "hostname": "x"}});
        assert_eq!(favorite_item_asset_id(&nested).as_deref(), Some("uuid-2"));
    }

    #[test]
    fn sort_favorites_first_orders_rows() {
        let mut rows = vec![
            json!({"name": "b", "favorite": false}),
            json!({"name": "a", "favorite": true}),
            json!({"name": "c", "favorite": true}),
        ];
        sort_favorites_first(&mut rows);
        assert_eq!(rows[0]["name"], "a");
        assert_eq!(rows[1]["name"], "c");
        assert_eq!(rows[2]["name"], "b");
    }
}
