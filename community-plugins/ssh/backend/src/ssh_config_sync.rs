//! Bidirectional sync between the DataWise host's saved SSH connections and
//! the user's OpenSSH `~/.ssh/config` file.
//!
//! Design mirrors motty's internal/workbench/ssh_sync.go + internal/sshconfig:
//!
//! * Only a fenced "managed" block of the config file is ever written. Host
//!   blocks outside the markers belong to the user and are never touched.
//! * A machine-local sidecar (`ssh-config-sync.json`) keeps the last synced
//!   snapshot (links + file stamp) so repeated syncs are idempotent and
//!   conflicts (file changed since the last sync) are detected.
//! * Export writes host/port/user (never credentials) into the managed block;
//!   import creates *new* host connections through the existing host RPC and
//!   never overwrites an existing connection.
//!
//! Security invariants:
//! * `IdentityFile` paths may be shown/imported, but key contents are never read.
//! * `ProxyJump` / `ProxyCommand` are surfaced as notes, never executed or followed.
//! * `Include` directives are not followed (only the primary config file is synced).

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

const STORAGE_VERSION: u32 = 1;
const FILE_NAME: &str = "ssh-config-sync.json";
const MAX_PATH_LEN: usize = 1024;
const MAX_ALIAS_LEN: usize = 128;
const MAX_IMPORT_HOSTS: usize = 200;

const MANAGED_BEGIN: &str = "# >>> datawise-ssh-sync (managed) >>>";
const MANAGED_END: &str = "# <<< datawise-ssh-sync (managed) <<<";

fn sync_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct SyncFields {
    #[serde(default)]
    label: String,
    #[serde(default)]
    host: String,
    #[serde(default)]
    user: String,
    #[serde(default)]
    port: u16,
}

impl Default for SyncFields {
    fn default() -> Self {
        Self { label: String::new(), host: String::new(), user: String::new(), port: 22 }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SyncLink {
    id: String,
    alias: String,
    #[serde(default)]
    detached: bool,
    #[serde(default)]
    base: SyncFields,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SyncFile {
    #[serde(default = "default_version")]
    version: u32,
    #[serde(default)]
    enabled: bool,
    #[serde(default)]
    path: Option<String>,
    #[serde(default)]
    links: Vec<SyncLink>,
    #[serde(default)]
    ignored: Vec<String>,
}

fn default_version() -> u32 {
    STORAGE_VERSION
}

impl Default for SyncFile {
    fn default() -> Self {
        Self { version: STORAGE_VERSION, enabled: false, path: None, links: Vec::new(), ignored: Vec::new() }
    }
}

fn store_path(data_dir: &Path) -> PathBuf {
    data_dir.join(FILE_NAME)
}

fn load_state(data_dir: &Path) -> SyncFile {
    let path = store_path(data_dir);
    let Ok(text) = std::fs::read_to_string(&path) else {
        return SyncFile::default();
    };
    match serde_json::from_str::<SyncFile>(&text) {
        Ok(mut state) if state.version <= STORAGE_VERSION => {
            state.links.truncate(MAX_IMPORT_HOSTS);
            state.ignored.truncate(MAX_IMPORT_HOSTS);
            state
        }
        _ => SyncFile::default(),
    }
}

fn save_state(data_dir: &Path, state: &SyncFile) -> Result<(), String> {
    let path = store_path(data_dir);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create sync state directory {}: {error}", parent.display()))?;
    }
    let text = serde_json::to_string_pretty(state)
        .map_err(|error| format!("Failed to encode sync state: {error}"))?;
    atomic_write(&path, &text)
}

/// Unique tmp + rename (with in-place overwrite fallback on Windows), identical
/// to preferences.rs so concurrent sidecar writes cannot race on one tmp name.
fn atomic_write(path: &Path, text: &str) -> Result<(), String> {
    let tmp = path.with_file_name(format!(
        "ssh-config-sync.{}.json.tmp",
        uuid::Uuid::new_v4()
    ));
    std::fs::write(&tmp, text)
        .map_err(|error| format!("Failed to write {}: {error}", tmp.display()))?;
    if let Err(error) = std::fs::rename(&tmp, path) {
        let fallback = std::fs::write(path, text);
        let _ = std::fs::remove_file(&tmp);
        fallback.map_err(|overwrite_error| {
            format!("Failed to write {}: rename {error}; overwrite {overwrite_error}", path.display())
        })?;
    }
    Ok(())
}

fn home_dir() -> Option<PathBuf> {
    let key = if cfg!(windows) { "USERPROFILE" } else { "HOME" };
    std::env::var_os(key).map(PathBuf::from)
}

fn config_path(state: &SyncFile) -> Result<PathBuf, String> {
    if let Some(raw) = state.path.as_deref() {
        let trimmed = raw.trim();
        if !trimmed.is_empty() {
            if trimmed.len() > MAX_PATH_LEN {
                return Err("SSH config path is too long".to_string());
            }
            return Ok(PathBuf::from(expand_tilde(trimmed)));
        }
    }
    home_dir()
        .map(|home| home.join(".ssh").join("config"))
        .ok_or_else(|| "Home directory could not be determined (~/.ssh/config)".to_string())
}

fn expand_tilde(path: &str) -> String {
    if path == "~" || path.starts_with("~/") || path.starts_with("~\\") {
        if let Some(home) = home_dir() {
            let rest = &path[2..];
            return home.join(rest).to_string_lossy().into_owned();
        }
    }
    path.to_string()
}

#[derive(Debug, Clone)]
struct ConfigHost {
    alias: String,
    host_name: String,
    user: String,
    port: u16,
    identity_file: String,
    proxy_jump: String,
    /// True when this Host block came from our managed fenced section.
    managed: bool,
}

impl ConfigHost {
    fn to_json(&self) -> Value {
        json!({
            "alias": self.alias,
            "host": self.host_name,
            "user": self.user,
            "port": self.port,
            "identityFile": self.identity_file,
            "proxyJump": self.proxy_jump,
            "managed": self.managed,
        })
    }
}

/// Splits a directive line into (lowercased keyword, value). Shared semantics
/// with connection_import.rs: `=` and whitespace separators, quoted values.
fn split_line(line: &str) -> Option<(String, String)> {
    let trimmed = line.trim();
    if trimmed.is_empty() || trimmed.starts_with('#') {
        return None;
    }
    let split_at = trimmed.find(|c: char| c.is_whitespace() || c == '=')?;
    let keyword = trimmed.get(..split_at)?.to_ascii_lowercase();
    let mut rest = trimmed.get(split_at..)?.trim_start();
    if let Some(after_eq) = rest.strip_prefix('=') {
        rest = after_eq.trim_start();
    }
    if let Some(unquoted) = rest.strip_prefix('"') {
        let close = unquoted.find('"')?;
        return Some((keyword, unquoted.get(..close)?.to_string()));
    }
    Some((keyword, rest.to_string()))
}

fn parse_port(value: &str) -> u16 {
    value.trim().parse::<u16>().ok().filter(|port| *port > 0).unwrap_or(22)
}

/// Parses the primary config file into concrete Host blocks. Wildcard patterns
/// (`*`, `?`, `!`) are reported as notes and skipped — like motty, we only
/// sync explicit aliases we can address safely.
fn parse_hosts(text: &str) -> (Vec<ConfigHost>, Vec<String>) {
    let mut hosts: Vec<ConfigHost> = Vec::new();
    let mut notes: Vec<String> = Vec::new();
    let mut in_managed = false;
    let mut current: Option<ConfigHost> = None;

    for raw in text.lines() {
        let line = raw.trim();
        if line == MANAGED_BEGIN {
            in_managed = true;
            continue;
        }
        if line == MANAGED_END {
            in_managed = false;
            continue;
        }
        let Some((keyword, value)) = split_line(line) else {
            continue;
        };
        if keyword == "host" {
            if let Some(host) = current.take() {
                hosts.push(host);
            }
            let aliases: Vec<&str> = value.split_whitespace().collect();
            let negated = aliases.iter().any(|alias| alias.starts_with('!'));
            let wildcard = aliases.iter().any(|alias| alias.contains('*') || alias.contains('?'));
            if negated || wildcard || aliases.len() != 1 {
                if notes.len() < 12 {
                    notes.push(format!("Skipped Host pattern: {value}"));
                }
                continue;
            }
            let alias = aliases[0];
            if alias.chars().count() > MAX_ALIAS_LEN {
                if notes.len() < 12 {
                    notes.push(format!("Skipped over-long Host alias: {alias}"));
                }
                continue;
            }
            current = Some(ConfigHost {
                alias: alias.to_string(),
                host_name: String::new(),
                user: String::new(),
                port: 22,
                identity_file: String::new(),
                proxy_jump: String::new(),
                managed: in_managed,
            });
            continue;
        }
        let Some(host) = current.as_mut() else {
            continue;
        };
        match keyword.as_str() {
            "hostname" if host.host_name.is_empty() => host.host_name = value,
            "user" if host.user.is_empty() => host.user = value,
            "port" => host.port = parse_port(&value),
            "identityfile" if host.identity_file.is_empty() => {
                host.identity_file = expand_tilde(&value)
            }
            "proxyjump" if host.proxy_jump.is_empty() => {
                host.proxy_jump = value;
                if notes.len() < 12 {
                    notes.push(format!("ProxyJump on {} is shown but never followed", host.alias));
                }
            }
            "proxycommand" if notes.len() < 12 => {
                notes.push(format!("ProxyCommand on {} is shown but never executed", host.alias));
            }
            "include" if notes.len() < 12 => {
                notes.push(format!("Include {value} is not followed; only the primary config is synced"));
            }
            _ => {}
        }
    }
    if let Some(host) = current.take() {
        hosts.push(host);
    }
    (hosts, notes)
}

#[derive(Debug, Clone)]
struct FileStamp {
    exists: bool,
    size: u64,
    modified: u64,
}

fn stamp_of(path: &Path) -> FileStamp {
    match std::fs::metadata(path) {
        Ok(meta) => FileStamp {
            exists: true,
            size: meta.len(),
            modified: meta
                .modified()
                .ok()
                .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|duration| duration.as_secs())
                .unwrap_or(0),
        },
        Err(_) => FileStamp { exists: false, size: 0, modified: 0 },
    }
}

fn stamp_value(stamp: &FileStamp) -> Value {
    json!({ "exists": stamp.exists, "size": stamp.size, "modified": stamp.modified })
}

fn stamp_from_value(value: Option<&Value>) -> Option<FileStamp> {
    let value = value?;
    Some(FileStamp {
        exists: value.get("exists").and_then(Value::as_bool).unwrap_or(false),
        size: value.get("size").and_then(Value::as_u64).unwrap_or(0),
        modified: value.get("modified").and_then(Value::as_u64).unwrap_or(0),
    })
}

fn stamp_matches(a: &FileStamp, b: &FileStamp) -> bool {
    a.exists == b.exists && a.size == b.size && a.modified == b.modified
}

fn require_string(params: &Value, key: &str) -> Result<String, String> {
    let raw = params
        .get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| format!("Missing string parameter: {key}"))?
        .trim();
    if raw.is_empty() {
        return Err(format!("Empty string parameter: {key}"));
    }
    Ok(raw.to_string())
}

fn safe_alias(raw: &str) -> String {
    let mut out: String = raw
        .trim()
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' {
                c
            } else {
                '-'
            }
        })
        .collect();
    if out.is_empty() {
        out.push_str("datawise-host");
    }
    out.chars().take(MAX_ALIAS_LEN).collect()
}

fn unique_alias(base: &str, taken: &HashSet<String>) -> String {
    if !taken.contains(base) {
        return base.to_string();
    }
    let mut suffix = 2;
    loop {
        let candidate = format!("{base}-{suffix}");
        if !taken.contains(&candidate) {
            return candidate;
        }
        suffix += 1;
    }
}

/// `sshConfig/read`: state + primary config path + parsed hosts + last stamp.
pub fn read(data_dir: &Path, params: &Value) -> Result<Value, String> {
    let _guard = sync_lock().lock().map_err(|error| format!("Sync lock poisoned: {error}"))?;
    let state = load_state(data_dir);
    let mut path = config_path(&state)?;
    if let Some(requested) = params.get("path").and_then(Value::as_str) {
        let requested = requested.trim();
        if !requested.is_empty() {
            if requested.len() > MAX_PATH_LEN {
                return Err("SSH config path is too long".to_string());
            }
            path = PathBuf::from(expand_tilde(requested));
        }
    }
    let stamp = stamp_of(&path);
    let text = if stamp.exists {
        std::fs::read_to_string(&path)
            .map_err(|error| format!("Failed to read {}: {error}", path.display()))?
    } else {
        String::new()
    };
    let (hosts, notes) = parse_hosts(&text);
    Ok(json!({
        "enabled": state.enabled,
        "path": path.to_string_lossy(),
        "configPath": path.to_string_lossy(),
        "exists": stamp.exists,
        "stamp": stamp_value(&stamp),
        "hosts": hosts.iter().map(ConfigHost::to_json).collect::<Vec<_>>(),
        "links": state.links,
        "ignored": state.ignored,
        "notes": notes,
        "managedBegin": MANAGED_BEGIN,
        "managedEnd": MANAGED_END,
    }))
}

/// `sshConfig/settings`: toggle sync, set an explicit config path, or reset links.
pub fn settings(data_dir: &Path, params: &Value) -> Result<Value, String> {
    let _guard = sync_lock().lock().map_err(|error| format!("Sync lock poisoned: {error}"))?;
    let mut state = load_state(data_dir);
    if let Some(enabled) = params.get("enabled").and_then(Value::as_bool) {
        state.enabled = enabled;
    }
    if let Some(path) = params.get("path") {
        match path.as_str() {
            Some(raw) => {
                let trimmed = raw.trim();
                if trimmed.len() > MAX_PATH_LEN {
                    return Err("SSH config path is too long".to_string());
                }
                state.path = if trimmed.is_empty() { None } else { Some(trimmed.to_string()) };
            }
            None => state.path = None,
        }
    }
    if params.get("resetLinks").and_then(Value::as_bool) == Some(true) {
        state.links.clear();
        state.ignored.clear();
    }
    if let Some(ignored) = params.get("ignored").and_then(Value::as_array) {
        state.ignored = ignored
            .iter()
            .filter_map(Value::as_str)
            .map(str::trim)
            .filter(|alias| !alias.is_empty())
            .take(MAX_IMPORT_HOSTS)
            .map(str::to_string)
            .collect();
    }
    save_state(data_dir, &state)?;
    Ok(json!({
        "enabled": state.enabled,
        "path": state.path,
        "links": state.links,
        "ignored": state.ignored,
    }))
}

fn alias_fields(host: &ConfigHost) -> SyncFields {
    SyncFields {
        label: host.alias.clone(),
        host: host.host_name.clone(),
        user: host.user.clone(),
        port: host.port,
    }
}

/// `sshConfig/import`: preview config hosts that can be created as new host
/// connections. Credentials are never read; the frontend maps rows through the
/// existing `hostConnectionDraftsFromExport` + `host.createConnections` path.
pub fn import_preview(data_dir: &Path, params: &Value) -> Result<Value, String> {
    let _guard = sync_lock().lock().map_err(|error| format!("Sync lock poisoned: {error}"))?;
    let state = load_state(data_dir);
    let mut path = config_path(&state)?;
    if let Some(requested) = params.get("path").and_then(Value::as_str) {
        if !requested.trim().is_empty() {
            path = PathBuf::from(expand_tilde(requested.trim()));
        }
    }
    let stamp = stamp_of(&path);
    if !stamp.exists {
        return Ok(json!({ "sessions": [], "notes": ["SSH config file does not exist"], "stamp": stamp_value(&stamp) }));
    }
    let text = std::fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read {}: {error}", path.display()))?;
    let (hosts, notes) = parse_hosts(&text);
    let ignored: HashSet<&str> = state.ignored.iter().map(String::as_str).collect();
    let linked: HashSet<&str> = state.links.iter().map(|link| link.alias.as_str()).collect();
    let sessions: Vec<Value> = hosts
        .into_iter()
        .filter(|host| !host.host_name.is_empty())
        .filter(|host| !ignored.contains(host.alias.as_str()))
        .filter(|host| !linked.contains(host.alias.as_str()))
        .take(MAX_IMPORT_HOSTS)
        .map(|host| {
            let auth_kind = if host.identity_file.is_empty() { "password" } else { "private-key" };
            json!({
                "name": host.alias,
                "host": host.host_name,
                "port": host.port,
                "username": host.user,
                "authKind": auth_kind,
                "keyPath": host.identity_file,
                "description": host.proxy_jump,
            })
        })
        .collect();
    Ok(json!({ "sessions": sessions, "notes": notes, "stamp": stamp_value(&stamp) }))
}

/// `sshConfig/ackImport`: remember imported aliases as linked so they are not
/// offered twice and can be updated by later exports.
pub fn ack_import(data_dir: &Path, params: &Value) -> Result<Value, String> {
    let _guard = sync_lock().lock().map_err(|error| format!("Sync lock poisoned: {error}"))?;
    let mut state = load_state(data_dir);
    let aliases = params
        .get("aliases")
        .and_then(Value::as_array)
        .ok_or_else(|| "Missing aliases array".to_string())?;
    let hosts = params.get("hosts").and_then(Value::as_array);
    for alias in aliases.iter().filter_map(Value::as_str) {
        let alias = alias.trim();
        if alias.is_empty() || state.links.iter().any(|link| link.alias == alias) {
            continue;
        }
        let base = hosts
            .and_then(|values| values.iter().find(|value| value.get("alias").and_then(Value::as_str) == Some(alias)))
            .map(|value| SyncFields {
                label: value.get("name").and_then(Value::as_str).unwrap_or(alias).to_string(),
                host: value.get("host").and_then(Value::as_str).unwrap_or("").to_string(),
                user: value.get("user").and_then(Value::as_str).unwrap_or("").to_string(),
                port: value.get("port").and_then(Value::as_u64).and_then(|port| u16::try_from(port).ok()).unwrap_or(22),
            })
            .unwrap_or_default();
        state.links.push(SyncLink {
            id: format!("imported:{alias}"),
            alias: alias.to_string(),
            detached: false,
            base,
        });
    }
    state.links.truncate(MAX_IMPORT_HOSTS);
    save_state(data_dir, &state)?;
    Ok(json!({ "links": state.links }))
}

/// Renders the managed block from the supplied connection metadata.
fn render_managed_block(connections: &[Value], links: &[SyncLink]) -> String {
    let mut taken: HashSet<String> = HashSet::new();
    // Reserve aliases already used by unmanaged Host blocks? read() returns the
    // full host list in params so the caller can pass `existingAliases`; here we
    // only reserve linked aliases to keep updates stable.
    let mut lines = String::new();
    lines.push_str(MANAGED_BEGIN);
    lines.push('\n');
    lines.push_str("# Managed by DataWise SSH plugin. Edits inside this block may be overwritten.\n");
    let mut used_link_index: HashSet<usize> = HashSet::new();
    for connection in connections {
        let Some(host) = connection.get("host").and_then(Value::as_str) else {
            continue;
        };
        let host = host.trim();
        if host.is_empty() {
            continue;
        }
        let name = connection
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or(host)
            .trim();
        let id = connection.get("id").and_then(Value::as_str).unwrap_or("");
        let user = connection
            .get("username")
            .and_then(Value::as_str)
            .or_else(|| connection.get("user").and_then(Value::as_str))
            .unwrap_or("")
            .trim();
        let port = connection
            .get("port")
            .and_then(Value::as_u64)
            .and_then(|port| u16::try_from(port).ok())
            .filter(|port| *port > 0)
            .unwrap_or(22);

        let alias = links
            .iter()
            .enumerate()
            .find(|(index, link)| !used_link_index.contains(index) && (link.id == id || link.base.label == name || link.alias == safe_alias(name)))
            .map(|(index, link)| {
                used_link_index.insert(index);
                link.alias.clone()
            })
            .unwrap_or_else(|| unique_alias(&safe_alias(name), &taken));
        taken.insert(alias.clone());

        lines.push_str(&format!("Host {alias}\n"));
        lines.push_str(&format!("    HostName {host}\n"));
        if !user.is_empty() {
            lines.push_str(&format!("    User {user}\n"));
        }
        if port != 22 {
            lines.push_str(&format!("    Port {port}\n"));
        }
        lines.push('\n');
    }
    lines.push_str(MANAGED_END);
    lines.push('\n');
    lines
}

/// `sshConfig/export`: write connection metadata into the managed block.
/// Refuses to write when the file changed since the last `read` (stamp guard),
/// creating a first-time backup before the initial managed write.
pub fn export(data_dir: &Path, params: &Value) -> Result<Value, String> {
    let _guard = sync_lock().lock().map_err(|error| format!("Sync lock poisoned: {error}"))?;
    let mut state = load_state(data_dir);
    let path = config_path(&state)?;
    let current_stamp = stamp_of(&path);

    if let Some(expected) = stamp_from_value(params.get("expectedStamp")) {
        if !stamp_matches(&current_stamp, &expected) {
            return Err("SSH config changed since it was loaded. Reload and retry to avoid overwriting external edits.".to_string());
        }
    }

    let connections = params
        .get("connections")
        .and_then(Value::as_array)
        .ok_or_else(|| "Missing connections array".to_string())?;
    if connections.len() > MAX_IMPORT_HOSTS {
        return Err("Too many connections to export".to_string());
    }
    let existing = if current_stamp.exists {
        std::fs::read_to_string(&path)
            .map_err(|error| format!("Failed to read {}: {error}", path.display()))?
    } else {
        String::new()
    };

    let block = render_managed_block(connections, &state.links);
    let updated = replace_managed_block(&existing, &block)?;

    // Keep links in sync with exported connections so the next export reuses
    // the same aliases (idempotent) instead of appending -2, -3...
    let mut next_links: Vec<SyncLink> = Vec::new();
    let mut used_ids: HashSet<String> = HashSet::new();
    for connection in connections {
        let id = connection.get("id").and_then(Value::as_str).unwrap_or("").to_string();
        if id.is_empty() || !used_ids.insert(id.clone()) {
            continue;
        }
        let name = connection
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let alias = safe_alias(&name);
        let base = SyncFields {
            label: name,
            host: connection.get("host").and_then(Value::as_str).unwrap_or("").to_string(),
            user: connection.get("username").and_then(Value::as_str).unwrap_or("").to_string(),
            port: connection.get("port").and_then(Value::as_u64).and_then(|port| u16::try_from(port).ok()).unwrap_or(22),
        };
        if let Some(existing_link) = state.links.iter().find(|link| link.id == id || link.alias == alias) {
            let mut link = existing_link.clone();
            link.base = base;
            next_links.push(link);
        } else {
            next_links.push(SyncLink { id, alias, detached: false, base });
        }
    }
    next_links.truncate(MAX_IMPORT_HOSTS);

    // First managed write: keep a one-time backup of the user's original file.
    let backup = path.with_extension("config.datawise-backup");
    if !backup.exists() && !existing.is_empty() && !existing.contains(MANAGED_BEGIN) {
        std::fs::write(&backup, &existing)
            .map_err(|error| format!("Failed to create SSH config backup {}: {error}", backup.display()))?;
    }

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create SSH config directory {}: {error}", parent.display()))?;
    }
    atomic_write(&path, &updated)?;
    let wrote = next_links.len();
    state.enabled = true;
    state.links = next_links;
    save_state(data_dir, &state)?;
    let new_stamp = stamp_of(&path);
    Ok(json!({
        "success": true,
        "path": path.to_string_lossy(),
        "backup": backup.to_string_lossy(),
        "wrote": wrote,
        "stamp": stamp_value(&new_stamp),
    }))
}

/// Replaces the region between the fence markers. If markers are absent the
/// managed block is appended at the end. If markers are unpaired, the file is
/// left untouched and an error is returned (never guess where user data ends).
fn replace_managed_block(existing: &str, block: &str) -> Result<String, String> {
    let begin_count = existing.matches(MANAGED_BEGIN).count();
    let end_count = existing.matches(MANAGED_END).count();
    if begin_count != end_count || begin_count > 1 {
        return Err("SSH config has malformed or repeated DataWise managed markers; refusing to overwrite".to_string());
    }
    if begin_count == 0 {
        let mut updated = existing.to_string();
        if !updated.is_empty() && !updated.ends_with('\n') {
            updated.push('\n');
        }
        if !updated.is_empty() {
            updated.push('\n');
        }
        updated.push_str(block);
        return Ok(updated);
    }
    let begin = existing.find(MANAGED_BEGIN).ok_or_else(|| "Missing managed begin marker".to_string())?;
    let end = existing
        .find(MANAGED_END)
        .ok_or_else(|| "Missing managed end marker".to_string())?
        + MANAGED_END.len();
    let mut updated = String::with_capacity(existing.len() + block.len());
    updated.push_str(&existing[..begin]);
    updated.push_str(block);
    let tail = existing[end..].trim_start_matches('\n');
    if !tail.is_empty() {
        if !updated.ends_with('\n') {
            updated.push('\n');
        }
        updated.push_str(tail);
    }
    Ok(updated)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_hosts_reads_concrete_aliases_and_skips_wildcards() {
        let text = concat!(
            "Host *\n  ServerAliveInterval 30\n",
            "Host prod-db\n  HostName 10.0.0.5\n  User ops\n  Port 2222\n  IdentityFile ~/.ssh/id_ed25519\n  ProxyJump bastion\n",
            "Host legacy\n  HostName legacy.example.com\n",
        );
        let (hosts, notes) = parse_hosts(text);
        assert_eq!(hosts.len(), 2);
        assert_eq!(hosts[0].alias, "prod-db");
        assert_eq!(hosts[0].host_name, "10.0.0.5");
        assert_eq!(hosts[0].port, 2222);
        assert_eq!(hosts[0].identity_file, expand_tilde("~/.ssh/id_ed25519"));
        assert!(notes.iter().any(|note| note.contains("ProxyJump")));
        assert!(notes.iter().any(|note| note.contains("Skipped Host pattern")));
    }

    #[test]
    fn replace_managed_block_is_idempotent() {
        let original = "Host my-vpn\n  HostName vpn.example.com\n";
        let block = format!("{MANAGED_BEGIN}\nHost ops\n  HostName 10.0.0.1\n{MANAGED_END}\n");
        let first = replace_managed_block(original, &block).expect("first write");
        let second = replace_managed_block(&first, &block).expect("second write");
        assert_eq!(first, second);
        assert!(first.contains("Host my-vpn"));
        assert!(first.contains("Host ops"));
    }

    #[test]
    fn replace_managed_block_rejects_unpaired_markers() {
        let broken = format!("{MANAGED_BEGIN}\nHost ops\n");
        assert!(replace_managed_block(&broken, "x").is_err());
    }

    #[test]
    fn stamp_guard_detects_external_edits() {
        let a = FileStamp { exists: true, size: 10, modified: 100 };
        let b = FileStamp { exists: true, size: 11, modified: 100 };
        assert!(!stamp_matches(&a, &b));
        assert!(stamp_matches(&a, &a.clone()));
    }
}
