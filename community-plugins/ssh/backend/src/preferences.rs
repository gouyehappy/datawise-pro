//! Plugin-level UI preferences persisted in `<plugin_data_dir>/preferences.json`.
//! The workbench iframe is sandboxed (`sandbox="allow-scripts"`, opaque origin),
//! so `window.localStorage` throws and this sidecar file is the only durable
//! store for workbench preferences such as the download directory. The schema
//! is a fixed allowlist — arbitrary keys from the renderer are dropped.

use std::path::Path;

use serde_json::{json, Map, Value};

const STORAGE_VERSION: u64 = 1;
const FILE_NAME: &str = "preferences.json";
/// Bounded so a broken renderer cannot grow the file without limit.
const MAX_DOWNLOAD_DIR_LEN: usize = 512;

pub fn store_path(data_dir: &Path) -> std::path::PathBuf {
    data_dir.join(FILE_NAME)
}

fn sanitize_download_dir(value: &Value) -> Option<String> {
    let dir = value.as_str()?.trim();
    Some(dir.chars().take(MAX_DOWNLOAD_DIR_LEN).collect())
}

fn sanitize_compression_strategy(value: &Value) -> Option<&'static str> {
    match value.as_str()? {
        "smart" => Some("smart"),
        "always" => Some("always"),
        "off" => Some("off"),
        _ => None,
    }
}

/// SFTP filename encoding preference: auto | utf8 | latin1.
fn sanitize_sftp_name_encoding(value: &Value) -> Option<&'static str> {
    crate::sftp_name::NameEncoding::parse(value.as_str()?).map(crate::sftp_name::NameEncoding::as_str)
}

/// Effective SFTP name encoding from preferences (defaults to Auto).
pub fn sftp_name_encoding(data_dir: &Path) -> crate::sftp_name::NameEncoding {
    load_preferences(data_dir)
        .get("sftpNameEncoding")
        .and_then(Value::as_str)
        .and_then(crate::sftp_name::NameEncoding::parse)
        .unwrap_or(crate::sftp_name::NameEncoding::Auto)
}

/// 冲突策略白名单：自动重命名（默认）/ 询问我 / 覆盖已有文件。
fn sanitize_conflict_policy(value: &Value) -> Option<&'static str> {
    match value.as_str()? {
        "rename" => Some("rename"),
        "ask" => Some("ask"),
        "overwrite" => Some("overwrite"),
        _ => None,
    }
}

/// Concurrent multistream download threshold (MiB). `0` disables multistream
/// (single-step prefetch only); invalid values fall back to the default.
pub fn sanitize_transfer_multistream_min_mib(value: &Value) -> u64 {
    let default = crate::transfer_multistream::DEFAULT_THRESHOLD_MIB;
    let Some(raw) = value.as_u64() else {
        return default;
    };
    if raw > crate::transfer_multistream::THRESHOLD_MIB_MAX {
        return default;
    }
    raw
}

pub fn transfer_multistream_min_mib(data_dir: &Path) -> u64 {
    load_preferences(data_dir)
        .get("transfer_multistream_min_mib")
        .map(sanitize_transfer_multistream_min_mib)
        .unwrap_or(crate::transfer_multistream::DEFAULT_THRESHOLD_MIB)
}

/// Reads the raw preferences map; a missing or corrupted file yields an empty
/// map so a bad file can never break the workbench (same policy as
/// quick-commands).
fn load_map(data_dir: &Path) -> Map<String, Value> {
    let text = std::fs::read_to_string(store_path(data_dir)).unwrap_or_default();
    serde_json::from_str::<Value>(&text)
        .ok()
        .and_then(|value| value.get("prefs")?.as_object().cloned())
        .unwrap_or_default()
}

/// Public view: only allowlisted keys, normalized.
pub fn load_preferences(data_dir: &Path) -> Value {
    let map = load_map(data_dir);
    let mut prefs = Map::new();
    if let Some(dir) = map.get("downloadDir").and_then(sanitize_download_dir) {
        prefs.insert("downloadDir".to_string(), Value::String(dir));
    }
    if let Some(use_default) = map.get("downloadUseDefaultDir").and_then(Value::as_bool) {
        prefs.insert(
            "downloadUseDefaultDir".to_string(),
            Value::Bool(use_default),
        );
    }
    if let Some(policy) = map
        .get("downloadConflictPolicy")
        .and_then(sanitize_conflict_policy)
    {
        prefs.insert(
            "downloadConflictPolicy".to_string(),
            Value::String(policy.to_string()),
        );
    }
    if let Some(strategy) = map
        .get("compressionStrategy")
        .and_then(sanitize_compression_strategy)
    {
        prefs.insert(
            "compressionStrategy".to_string(),
            Value::String(strategy.to_string()),
        );
    }
    if let Some(encoding) = map
        .get("sftpNameEncoding")
        .and_then(sanitize_sftp_name_encoding)
    {
        prefs.insert(
            "sftpNameEncoding".to_string(),
            Value::String(encoding.to_string()),
        );
    }
    if let Some(mib) = map.get("compressionThresholdMib").and_then(Value::as_u64) {
        prefs.insert(
            "compressionThresholdMib".to_string(),
            Value::Number(mib.into()),
        );
    }
    if map.contains_key("transfer_multistream_min_mib") {
        prefs.insert(
            "transfer_multistream_min_mib".to_string(),
            Value::from(sanitize_transfer_multistream_min_mib(
                &map["transfer_multistream_min_mib"],
            )),
        );
    }
    if let Some(startup) = map
        .get("startup_commands")
        .and_then(crate::startup_commands::sanitize_store)
    {
        prefs.insert("startup_commands".to_string(), startup);
    }
    if let Some(x11) = map.get("x11_forwarding").and_then(Value::as_bool) {
        prefs.insert("x11_forwarding".to_string(), Value::Bool(x11));
    }
    if let Some(enabled) = map.get("copilotEnabled").and_then(Value::as_bool) {
        prefs.insert("copilotEnabled".to_string(), Value::Bool(enabled));
    }
    if let Some(open) = map.get("copilotDockOpen").and_then(Value::as_bool) {
        prefs.insert("copilotDockOpen".to_string(), Value::Bool(open));
    }
    if let Some(width) = map.get("copilotDockWidth").and_then(coerce_u64) {
        prefs.insert(
            "copilotDockWidth".to_string(),
            Value::from(sanitize_copilot_dock_width(width)),
        );
    }
    if let Some(mode) = map
        .get("copilotChatMode")
        .and_then(Value::as_str)
        .and_then(sanitize_copilot_chat_mode)
    {
        prefs.insert("copilotChatMode".to_string(), Value::String(mode.to_string()));
    }
    if let Some(prefer) = map
        .get("copilotModelPreference")
        .and_then(Value::as_str)
        .and_then(sanitize_copilot_model_preference)
    {
        prefs.insert("copilotModelPreference".to_string(), Value::String(prefer));
    }
    if let Some(lang) = map
        .get("copilotReplyLanguage")
        .and_then(Value::as_str)
        .and_then(sanitize_copilot_reply_language)
    {
        prefs.insert("copilotReplyLanguage".to_string(), Value::String(lang.to_string()));
    }
    Value::Object(prefs)
}

fn sanitize_copilot_chat_mode(raw: &str) -> Option<&'static str> {
    match raw.trim() {
        "ask" => Some("ask"),
        "agent" => Some("agent"),
        _ => None,
    }
}

fn sanitize_copilot_reply_language(raw: &str) -> Option<&'static str> {
    match raw.trim() {
        "auto" => Some("auto"),
        "zh-CN" => Some("zh-CN"),
        "en" => Some("en"),
        _ => None,
    }
}

fn sanitize_copilot_model_preference(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    match trimmed {
        "auto" | "plugin" | "host" => Some(trimmed.to_string()),
        s if s.starts_with("plugin:") => {
            let id = &s["plugin:".len()..];
            if !id.is_empty()
                && id.len() <= 64
                && id
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
            {
                Some(s.to_string())
            } else {
                None
            }
        }
        _ => None,
    }
}

fn sanitize_copilot_dock_width(raw: u64) -> u64 {
    // Keep in sync with @datawise/community-copilot-kit COPILOT_DOCK_WIDTH (300–800).
    raw.clamp(300, 800)
}

/// Accept JSON numbers as u64/i64/f64 and numeric strings (JS may send 360.0).
fn coerce_u64(value: &Value) -> Option<u64> {
    if let Some(n) = value.as_u64() {
        return Some(n);
    }
    if let Some(n) = value.as_i64() {
        return u64::try_from(n).ok();
    }
    if let Some(n) = value.as_f64() {
        if n.is_finite() && n >= 0.0 {
            return Some(n.round() as u64);
        }
    }
    if let Some(s) = value.as_str() {
        let trimmed = s.trim();
        if let Ok(n) = trimmed.parse::<u64>() {
            return Some(n);
        }
        if let Ok(n) = trimmed.parse::<f64>() {
            if n.is_finite() && n >= 0.0 {
                return Some(n.round() as u64);
            }
        }
    }
    None
}

/// Merges the allowlisted keys present in `params` into the store and persists
/// atomically (tmp + rename). Returns the stored preferences.
pub fn save_preferences(data_dir: &Path, params: &Value) -> Result<Value, String> {
    let mut map = load_map(data_dir);
    if let Some(value) = params.get("downloadDir") {
        let dir = sanitize_download_dir(value)
            .ok_or_else(|| "downloadDir must be a string".to_string())?;
        map.insert("downloadDir".to_string(), Value::String(dir));
    }
    if let Some(value) = params.get("downloadUseDefaultDir") {
        let use_default = value
            .as_bool()
            .ok_or_else(|| "downloadUseDefaultDir must be a boolean".to_string())?;
        map.insert(
            "downloadUseDefaultDir".to_string(),
            Value::Bool(use_default),
        );
    }
    if let Some(value) = params.get("downloadConflictPolicy") {
        let policy = sanitize_conflict_policy(value)
            .ok_or_else(|| "downloadConflictPolicy must be rename, ask or overwrite".to_string())?;
        map.insert(
            "downloadConflictPolicy".to_string(),
            Value::String(policy.to_string()),
        );
    }
    if let Some(value) = params.get("compressionStrategy") {
        let strategy = sanitize_compression_strategy(value)
            .ok_or_else(|| "compressionStrategy must be smart, always or off".to_string())?;
        map.insert(
            "compressionStrategy".to_string(),
            Value::String(strategy.to_string()),
        );
    }
    if let Some(value) = params.get("sftpNameEncoding") {
        let encoding = sanitize_sftp_name_encoding(value).ok_or_else(|| {
            "sftpNameEncoding must be auto, utf8, or latin1".to_string()
        })?;
        map.insert(
            "sftpNameEncoding".to_string(),
            Value::String(encoding.to_string()),
        );
    }
    if let Some(value) = params.get("compressionThresholdMib") {
        let mib = value
            .as_u64()
            .ok_or_else(|| "compressionThresholdMib must be a number".to_string())?;
        map.insert(
            "compressionThresholdMib".to_string(),
            Value::Number(mib.into()),
        );
    }
    if let Some(value) = params.get("transfer_multistream_min_mib") {
        map.insert(
            "transfer_multistream_min_mib".to_string(),
            Value::from(sanitize_transfer_multistream_min_mib(value)),
        );
    }
    if let Some(value) = params.get("startup_commands") {
        let startup = crate::startup_commands::sanitize_store(value)
            .ok_or_else(|| "startup_commands must be an object keyed by connection id".to_string())?;
        map.insert("startup_commands".to_string(), startup);
    }
    if let Some(value) = params.get("x11_forwarding") {
        let x11 = value
            .as_bool()
            .ok_or_else(|| "x11_forwarding must be a boolean".to_string())?;
        map.insert("x11_forwarding".to_string(), Value::Bool(x11));
    }
    if let Some(value) = params.get("copilotEnabled") {
        let enabled = value
            .as_bool()
            .ok_or_else(|| "copilotEnabled must be a boolean".to_string())?;
        map.insert("copilotEnabled".to_string(), Value::Bool(enabled));
    }
    if let Some(value) = params.get("copilotDockOpen") {
        let open = value
            .as_bool()
            .ok_or_else(|| "copilotDockOpen must be a boolean".to_string())?;
        map.insert("copilotDockOpen".to_string(), Value::Bool(open));
    }
    if let Some(value) = params.get("copilotDockWidth") {
        let width = coerce_u64(value)
            .ok_or_else(|| "copilotDockWidth must be a number".to_string())?;
        map.insert(
            "copilotDockWidth".to_string(),
            Value::from(sanitize_copilot_dock_width(width)),
        );
    }
    if let Some(value) = params.get("copilotChatMode") {
        let mode = value
            .as_str()
            .and_then(sanitize_copilot_chat_mode)
            .ok_or_else(|| "copilotChatMode must be \"ask\" or \"agent\"".to_string())?;
        map.insert("copilotChatMode".to_string(), Value::String(mode.to_string()));
    }
    if let Some(value) = params.get("copilotModelPreference") {
        let prefer = value
            .as_str()
            .and_then(sanitize_copilot_model_preference)
            .ok_or_else(|| {
                "copilotModelPreference must be \"auto\", \"plugin\", \"host\", or \"plugin:<id\""
                    .to_string()
            })?;
        map.insert("copilotModelPreference".to_string(), Value::String(prefer));
    }
    if let Some(value) = params.get("copilotReplyLanguage") {
        let lang = value
            .as_str()
            .and_then(sanitize_copilot_reply_language)
            .ok_or_else(|| {
                "copilotReplyLanguage must be \"auto\", \"zh-CN\", or \"en\"".to_string()
            })?;
        map.insert("copilotReplyLanguage".to_string(), Value::String(lang.to_string()));
    }
    let path = store_path(data_dir);
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let text = serde_json::to_string_pretty(&json!({
        "version": STORAGE_VERSION,
        "prefs": Value::Object(map),
    }))
    .map_err(|error| format!("Failed to encode preferences: {error}"))?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, text)
        .map_err(|error| format!("Failed to write {}: {error}", tmp.display()))?;
    std::fs::rename(&tmp, &path)
        .map_err(|error| format!("Failed to write {}: {error}", path.display()))?;
    Ok(load_preferences(data_dir))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_merges_and_normalizes() {
        let data_dir = tempfile::tempdir().expect("tempdir");
        let stored = save_preferences(
            data_dir.path(),
            &json!({ "downloadDir": "  /tmp/dl  ", "downloadUseDefaultDir": true, "evil": "dropped" }),
        )
        .expect("save");
        assert_eq!(stored["downloadDir"].as_str().unwrap(), "/tmp/dl");
        assert_eq!(stored["downloadUseDefaultDir"].as_bool(), Some(true));
        assert!(stored.get("evil").is_none());
        // 部分更新只改出现的键。
        let again = save_preferences(data_dir.path(), &json!({ "downloadUseDefaultDir": false }))
            .expect("save again");
        assert_eq!(again["downloadDir"].as_str().unwrap(), "/tmp/dl");
        assert_eq!(again["downloadUseDefaultDir"].as_bool(), Some(false));
    }

    #[test]
    fn missing_or_corrupted_file_yields_empty() {
        let data_dir = tempfile::tempdir().expect("tempdir");
        assert_eq!(load_preferences(data_dir.path()), json!({}));
        std::fs::write(store_path(data_dir.path()), "{not json").expect("write junk");
        assert_eq!(load_preferences(data_dir.path()), json!({}));
    }

    #[test]
    fn rejects_wrong_types() {
        let data_dir = tempfile::tempdir().expect("tempdir");
        assert!(save_preferences(data_dir.path(), &json!({ "downloadDir": 7 })).is_err());
        assert!(
            save_preferences(data_dir.path(), &json!({ "downloadUseDefaultDir": "yes" })).is_err()
        );
    }

    #[test]
    fn sftp_name_encoding_roundtrip_and_default() {
        let data_dir = tempfile::tempdir().expect("tempdir");
        assert_eq!(
            sftp_name_encoding(data_dir.path()),
            crate::sftp_name::NameEncoding::Auto
        );
        let stored = save_preferences(
            data_dir.path(),
            &json!({ "sftpNameEncoding": "latin-1" }),
        )
        .expect("save");
        assert_eq!(stored["sftpNameEncoding"].as_str(), Some("latin1"));
        assert_eq!(
            sftp_name_encoding(data_dir.path()),
            crate::sftp_name::NameEncoding::Latin1
        );
        assert!(save_preferences(data_dir.path(), &json!({ "sftpNameEncoding": "gbk" })).is_err());
    }

    #[test]
    fn copilot_dock_width_coerces_float_and_string() {
        let data_dir = tempfile::tempdir().expect("tempdir");
        let stored = save_preferences(
            data_dir.path(),
            &json!({ "copilotDockWidth": 420.7 }),
        )
        .expect("save float");
        assert_eq!(stored["copilotDockWidth"].as_u64(), Some(421));
        let again = save_preferences(data_dir.path(), &json!({ "copilotDockWidth": "300" }))
            .expect("save string");
        assert_eq!(again["copilotDockWidth"].as_u64(), Some(300));
        let clamped = save_preferences(data_dir.path(), &json!({ "copilotDockWidth": 9999 }))
            .expect("save clamp");
        assert_eq!(clamped["copilotDockWidth"].as_u64(), Some(800));
    }

    #[test]
    fn copilot_chat_mode_ask_or_agent() {
        let data_dir = tempfile::tempdir().expect("tempdir");
        let stored = save_preferences(data_dir.path(), &json!({ "copilotChatMode": "ask" }))
            .expect("save ask");
        assert_eq!(stored["copilotChatMode"].as_str(), Some("ask"));
        let again = save_preferences(data_dir.path(), &json!({ "copilotChatMode": "agent" }))
            .expect("save agent");
        assert_eq!(again["copilotChatMode"].as_str(), Some("agent"));
        assert!(save_preferences(data_dir.path(), &json!({ "copilotChatMode": "plan" })).is_err());
    }

    #[test]
    fn copilot_model_preference_auto_plugin_host() {
        let data_dir = tempfile::tempdir().expect("tempdir");
        let stored =
            save_preferences(data_dir.path(), &json!({ "copilotModelPreference": "host" }))
                .expect("save host");
        assert_eq!(stored["copilotModelPreference"].as_str(), Some("host"));
        let by_id = save_preferences(
            data_dir.path(),
            &json!({ "copilotModelPreference": "plugin:abc-1" }),
        )
        .expect("save plugin id");
        assert_eq!(
            by_id["copilotModelPreference"].as_str(),
            Some("plugin:abc-1")
        );
        assert!(
            save_preferences(data_dir.path(), &json!({ "copilotModelPreference": "remote" }))
                .is_err()
        );
    }
}
