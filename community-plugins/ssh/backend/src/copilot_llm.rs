//! Plugin-owned (BYOK) LLM settings for the SSH session copilot.
//! Supports multiple named profiles; API keys are sealed with the vault.

use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock, Mutex};

use serde_json::{json, Map, Value};

use crate::vault::{self, Vault};

/// In-flight stream cancel flags keyed by requestId.
static STREAM_CANCELS: LazyLock<Mutex<HashMap<String, Arc<AtomicBool>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Mark a streaming chat request as cancelled. Returns true if a live stream was found.
pub fn cancel_stream(request_id: &str) -> bool {
    let Ok(map) = STREAM_CANCELS.lock() else {
        return false;
    };
    if let Some(flag) = map.get(request_id) {
        flag.store(true, Ordering::SeqCst);
        true
    } else {
        false
    }
}

fn register_cancel(request_id: &str) -> Arc<AtomicBool> {
    let flag = Arc::new(AtomicBool::new(false));
    if request_id.is_empty() {
        return flag;
    }
    if let Ok(mut map) = STREAM_CANCELS.lock() {
        map.insert(request_id.to_string(), Arc::clone(&flag));
    }
    flag
}

fn unregister_cancel(request_id: &str) {
    if request_id.is_empty() {
        return;
    }
    if let Ok(mut map) = STREAM_CANCELS.lock() {
        map.remove(request_id);
    }
}

const FILE_NAME: &str = "copilot-llm.json";
const LEGACY_PROFILE_ID: &str = "copilot";
const FIELD_API_KEY: &str = "apiKey";
const MAX_URL_LEN: usize = 512;
const MAX_MODEL_LEN: usize = 128;
const MAX_LABEL_LEN: usize = 64;
const MAX_PROFILES: usize = 12;
const MAX_ID_LEN: usize = 64;

#[derive(Debug, Clone, Default)]
pub struct CopilotLlmConfig {
    pub id: String,
    pub label: String,
    pub base_url: String,
    pub model: String,
    pub api_key: String,
    pub enabled: bool,
}

impl CopilotLlmConfig {
    pub fn is_configured(&self) -> bool {
        self.enabled
            && !self.base_url.trim().is_empty()
            && !self.model.trim().is_empty()
            && !self.api_key.trim().is_empty()
    }
}

#[derive(Debug, Clone, Default)]
struct Store {
    profiles: Vec<CopilotLlmConfig>,
    active_id: String,
}

fn vault_for(data_dir: &Path) -> Vault {
    let provider = vault::resolve_provider(None, data_dir);
    Vault::new(provider.as_ref())
}

pub fn store_path(data_dir: &Path) -> std::path::PathBuf {
    data_dir.join(FILE_NAME)
}

fn clamp_str(raw: &str, max: usize) -> String {
    raw.trim().chars().take(max).collect()
}

fn valid_id(raw: &str) -> bool {
    let id = raw.trim();
    !id.is_empty()
        && id.len() <= MAX_ID_LEN
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn open_key(vault: &Vault, profile_id: &str, sealed: &str) -> String {
    if sealed.is_empty() {
        return String::new();
    }
    let opened = vault.open(FIELD_API_KEY, profile_id, sealed);
    if !opened.is_empty() {
        return opened;
    }
    // Migrated v1 keys were sealed under the legacy profile id.
    if profile_id != LEGACY_PROFILE_ID {
        return vault.open(FIELD_API_KEY, LEGACY_PROFILE_ID, sealed);
    }
    String::new()
}

fn seal_key(vault: &Vault, profile_id: &str, api_key: &str) -> String {
    if api_key.is_empty() {
        String::new()
    } else {
        vault.seal(FIELD_API_KEY, profile_id, api_key)
    }
}

fn profile_from_v1(value: &Value, vault: &Vault) -> CopilotLlmConfig {
    let sealed = value
        .get("apiKeySealed")
        .and_then(Value::as_str)
        .unwrap_or("");
    let model = clamp_str(
        value.get("model").and_then(Value::as_str).unwrap_or(""),
        MAX_MODEL_LEN,
    );
    CopilotLlmConfig {
        id: "default".into(),
        label: if model.is_empty() {
            "Default".into()
        } else {
            model.clone()
        },
        base_url: clamp_str(
            value.get("baseUrl").and_then(Value::as_str).unwrap_or(""),
            MAX_URL_LEN,
        ),
        model,
        api_key: open_key(vault, LEGACY_PROFILE_ID, sealed),
        enabled: value
            .get("enabled")
            .and_then(Value::as_bool)
            .unwrap_or(false),
    }
}

fn profile_from_json(value: &Value, vault: &Vault) -> Option<CopilotLlmConfig> {
    let id = value.get("id").and_then(Value::as_str).unwrap_or("").trim();
    if !valid_id(id) {
        return None;
    }
    let sealed = value
        .get("apiKeySealed")
        .and_then(Value::as_str)
        .unwrap_or("");
    let model = clamp_str(
        value.get("model").and_then(Value::as_str).unwrap_or(""),
        MAX_MODEL_LEN,
    );
    let label_raw = value.get("label").and_then(Value::as_str).unwrap_or("");
    let label = if label_raw.trim().is_empty() {
        if model.is_empty() {
            id.to_string()
        } else {
            model.clone()
        }
    } else {
        clamp_str(label_raw, MAX_LABEL_LEN)
    };
    Some(CopilotLlmConfig {
        id: id.to_string(),
        label,
        base_url: clamp_str(
            value.get("baseUrl").and_then(Value::as_str).unwrap_or(""),
            MAX_URL_LEN,
        ),
        model,
        api_key: open_key(vault, id, sealed),
        enabled: value
            .get("enabled")
            .and_then(Value::as_bool)
            .unwrap_or(true),
    })
}

fn load_store(data_dir: &Path) -> Store {
    let text = std::fs::read_to_string(store_path(data_dir)).unwrap_or_default();
    let Ok(value) = serde_json::from_str::<Value>(&text) else {
        return Store::default();
    };
    let vault = vault_for(data_dir);
    let version = value.get("version").and_then(Value::as_u64).unwrap_or(1);
    if version >= 2 {
        let mut profiles = Vec::new();
        if let Some(arr) = value.get("profiles").and_then(Value::as_array) {
            for item in arr {
                if profiles.len() >= MAX_PROFILES {
                    break;
                }
                if let Some(profile) = profile_from_json(item, &vault) {
                    profiles.push(profile);
                }
            }
        }
        let mut active_id = value
            .get("activeId")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim()
            .to_string();
        if !profiles.iter().any(|p| p.id == active_id) {
            active_id = profiles
                .first()
                .map(|p| p.id.clone())
                .unwrap_or_default();
        }
        return Store {
            profiles,
            active_id,
        };
    }
    // v1 single-profile → one migrated entry
    let profile = profile_from_v1(&value, &vault);
    if profile.base_url.is_empty()
        && profile.model.is_empty()
        && profile.api_key.is_empty()
        && !profile.enabled
    {
        return Store::default();
    }
    let active_id = profile.id.clone();
    Store {
        profiles: vec![profile],
        active_id,
    }
}

fn persist_store(data_dir: &Path, store: &Store) -> Result<(), String> {
    let vault = vault_for(data_dir);
    let mut profiles = Vec::new();
    for profile in &store.profiles {
        profiles.push(json!({
            "id": profile.id,
            "label": profile.label,
            "baseUrl": profile.base_url,
            "model": profile.model,
            "enabled": profile.enabled,
            "apiKeySealed": seal_key(&vault, &profile.id, &profile.api_key),
        }));
    }
    let mut map = Map::new();
    map.insert("version".into(), json!(2));
    map.insert("activeId".into(), json!(store.active_id));
    map.insert("profiles".into(), Value::Array(profiles));
    let path = store_path(data_dir);
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let tmp = path.with_extension("json.tmp");
    let text = serde_json::to_string_pretty(&Value::Object(map))
        .map_err(|e| format!("encode copilot llm: {e}"))?;
    std::fs::write(&tmp, text).map_err(|e| format!("write copilot llm: {e}"))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("persist copilot llm: {e}"))?;
    Ok(())
}

fn profile_public(profile: &CopilotLlmConfig, active: bool) -> Value {
    json!({
        "id": profile.id,
        "label": profile.label,
        "baseUrl": profile.base_url,
        "model": profile.model,
        "enabled": profile.enabled,
        "hasApiKey": !profile.api_key.trim().is_empty(),
        "configured": profile.is_configured(),
        "active": active,
    })
}

/// Public status without revealing API keys.
pub fn status_view(data_dir: &Path) -> Value {
    let store = load_store(data_dir);
    // Persist in-memory v1→v2 migration so subsequent loads and the settings
    // UI always see a stable profiles[] array on disk.
    if !store.profiles.is_empty() {
        let path = store_path(data_dir);
        let needs_rewrite = std::fs::read_to_string(&path)
            .ok()
            .and_then(|text| serde_json::from_str::<Value>(&text).ok())
            .map(|value| value.get("version").and_then(Value::as_u64).unwrap_or(1) < 2)
            .unwrap_or(true);
        if needs_rewrite {
            let _ = persist_store(data_dir, &store);
        }
    }
    let active = store
        .profiles
        .iter()
        .find(|p| p.id == store.active_id)
        .cloned()
        .or_else(|| store.profiles.first().cloned());
    let profiles: Vec<Value> = store
        .profiles
        .iter()
        .map(|p| profile_public(p, p.id == store.active_id))
        .collect();
    let any_configured = store.profiles.iter().any(CopilotLlmConfig::is_configured);
    let active_configured = active
        .as_ref()
        .map(CopilotLlmConfig::is_configured)
        .unwrap_or(false);
    json!({
        "configured": active_configured || any_configured,
        "activeConfigured": active_configured,
        "activeId": store.active_id,
        "profiles": profiles,
        // Back-compat fields for older frontends (active profile).
        "enabled": active.as_ref().map(|p| p.enabled).unwrap_or(false),
        "baseUrl": active.as_ref().map(|p| p.base_url.clone()).unwrap_or_default(),
        "model": active.as_ref().map(|p| p.model.clone()).unwrap_or_default(),
        "hasApiKey": active
            .as_ref()
            .map(|p| !p.api_key.trim().is_empty())
            .unwrap_or(false),
    })
}

fn find_profile_mut<'a>(store: &'a mut Store, id: &str) -> Option<&'a mut CopilotLlmConfig> {
    store.profiles.iter_mut().find(|p| p.id == id)
}

fn resolve_config(data_dir: &Path, profile_id: Option<&str>) -> Result<CopilotLlmConfig, String> {
    let store = load_store(data_dir);
    let wanted = profile_id
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(store.active_id.as_str());
    let profile = store
        .profiles
        .iter()
        .find(|p| p.id == wanted)
        .or_else(|| store.profiles.iter().find(|p| p.is_configured()))
        .cloned()
        .ok_or_else(|| "plugin LLM is not configured".to_string())?;
    if !profile.is_configured() {
        return Err("plugin LLM is not configured".into());
    }
    Ok(profile)
}

/// Upsert / delete / activate profiles. Legacy single-field saves upsert the active profile.
pub fn save(data_dir: &Path, params: &Value) -> Result<Value, String> {
    let action = params
        .get("action")
        .and_then(Value::as_str)
        .unwrap_or("upsert")
        .trim()
        .to_ascii_lowercase();
    let mut store = load_store(data_dir);

    match action.as_str() {
        "delete" => {
            let id = params
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim();
            if !valid_id(id) {
                return Err("profile id is required".into());
            }
            let before = store.profiles.len();
            store.profiles.retain(|p| p.id != id);
            if store.profiles.len() == before {
                return Err("profile not found".into());
            }
            if store.active_id == id {
                store.active_id = store
                    .profiles
                    .first()
                    .map(|p| p.id.clone())
                    .unwrap_or_default();
            }
        }
        "activate" => {
            let id = params
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim();
            if !store.profiles.iter().any(|p| p.id == id) {
                return Err("profile not found".into());
            }
            store.active_id = id.to_string();
        }
        _ => {
            // upsert (default) — also accepts legacy top-level fields
            let body = params.get("profile").unwrap_or(params);
            let existing_id = body
                .get("id")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string);
            let id = if let Some(id) = existing_id.clone() {
                if !valid_id(&id) {
                    return Err("invalid profile id".into());
                }
                id
            } else if store.profiles.is_empty()
                && (params.get("baseUrl").is_some() || params.get("model").is_some())
                && params.get("profile").is_none()
            {
                // Legacy single-slot save with no id → migrate into "default"
                "default".into()
            } else {
                if store.profiles.len() >= MAX_PROFILES {
                    return Err(format!("at most {MAX_PROFILES} plugin models"));
                }
                uuid::Uuid::new_v4().to_string()
            };

            let is_new = !store.profiles.iter().any(|p| p.id == id);
            if is_new && store.profiles.len() >= MAX_PROFILES {
                return Err(format!("at most {MAX_PROFILES} plugin models"));
            }
            if is_new {
                store.profiles.push(CopilotLlmConfig {
                    id: id.clone(),
                    ..CopilotLlmConfig::default()
                });
            }
            let profile = find_profile_mut(&mut store, &id)
                .ok_or_else(|| "failed to create profile".to_string())?;

            if let Some(label) = body.get("label").and_then(Value::as_str) {
                let clamped = clamp_str(label, MAX_LABEL_LEN);
                if !clamped.is_empty() {
                    profile.label = clamped;
                }
            }
            if let Some(url) = body.get("baseUrl").and_then(Value::as_str) {
                profile.base_url = clamp_str(url, MAX_URL_LEN);
            }
            if let Some(model) = body.get("model").and_then(Value::as_str) {
                profile.model = clamp_str(model, MAX_MODEL_LEN);
            }
            if let Some(enabled) = body.get("enabled").and_then(Value::as_bool) {
                profile.enabled = enabled;
            } else if is_new {
                profile.enabled = true;
            }
            if let Some(key) = body.get("apiKey").and_then(Value::as_str) {
                profile.api_key = key.trim().to_string();
            }
            if profile.label.trim().is_empty() {
                profile.label = if profile.model.is_empty() {
                    profile.id.clone()
                } else {
                    profile.model.clone()
                };
            }
            if store.active_id.is_empty()
                || !store.profiles.iter().any(|p| p.id == store.active_id)
            {
                store.active_id = id.clone();
            }
            if body
                .get("activate")
                .and_then(Value::as_bool)
                .unwrap_or(false)
            {
                store.active_id = id;
            }
        }
    }

    persist_store(data_dir, &store)?;
    Ok(status_view(data_dir))
}

/// Load for callers that still expect a single active config.
#[allow(dead_code)]
pub fn load(data_dir: &Path) -> CopilotLlmConfig {
    let store = load_store(data_dir);
    store
        .profiles
        .iter()
        .find(|p| p.id == store.active_id)
        .cloned()
        .or_else(|| store.profiles.first().cloned())
        .unwrap_or_default()
}

fn chat_url(base_url: &str) -> String {
    let base = base_url.trim_end_matches('/');
    if base.ends_with("/chat/completions") {
        base.to_string()
    } else if base.ends_with("/v1") {
        format!("{base}/chat/completions")
    } else {
        format!("{base}/v1/chat/completions")
    }
}

/// Probe an OpenAI-compatible endpoint with draft (or stored) credentials.
/// Does not persist anything. Returns `{ ok, latencyMs, model, reply }` or an error string.
pub async fn test_connection(data_dir: &Path, params: &Value) -> Result<Value, String> {
    let base_url = clamp_str(
        params.get("baseUrl").and_then(Value::as_str).unwrap_or(""),
        MAX_URL_LEN,
    );
    let model = clamp_str(
        params.get("model").and_then(Value::as_str).unwrap_or(""),
        MAX_MODEL_LEN,
    );
    if base_url.is_empty() || model.is_empty() {
        return Err("baseUrl and model are required".into());
    }
    let mut api_key = params
        .get("apiKey")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string();
    if api_key.is_empty() {
        let profile_id = params
            .get("id")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|s| !s.is_empty());
        if let Some(id) = profile_id {
            let store = load_store(data_dir);
            if let Some(profile) = store.profiles.iter().find(|p| p.id == id) {
                api_key = profile.api_key.clone();
            }
        }
    }
    if api_key.is_empty() {
        return Err("API key is required to test".into());
    }

    let body = json!({
        "model": model,
        "messages": [
            {"role": "user", "content": "Reply with exactly: ok"}
        ],
        "temperature": 0,
        "max_tokens": 8,
    });
    let started = std::time::Instant::now();
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("http client: {e}"))?;
    let response = client
        .post(chat_url(&base_url))
        .bearer_auth(&api_key)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?;
    let latency_ms = started.elapsed().as_millis() as u64;
    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!(
            "HTTP {status}: {}",
            text.chars().take(240).collect::<String>()
        ));
    }
    let payload: Value = response
        .json()
        .await
        .map_err(|e| format!("response JSON: {e}"))?;
    let choice = payload.pointer("/choices/0");
    if choice.is_none() {
        return Err("response missing choices".into());
    }
    let reply = extract_message_text(choice.unwrap())
        .chars()
        .take(80)
        .collect::<String>();
    // HTTP 200 + choices is enough to prove the endpoint; some gateways
    // (reasoning models, empty max_tokens) return blank content.
    Ok(json!({
        "ok": true,
        "latencyMs": latency_ms,
        "model": model,
        "reply": if reply.trim().is_empty() { "ok" } else { reply.trim() },
    }))
}

fn extract_message_text(choice: &Value) -> String {
    let message = choice.get("message").unwrap_or(choice);
    if let Some(s) = message.get("content").and_then(Value::as_str) {
        if !s.trim().is_empty() {
            return s.to_string();
        }
    }
    if let Some(parts) = message.get("content").and_then(Value::as_array) {
        let joined: String = parts
            .iter()
            .filter_map(|p| {
                p.as_str()
                    .or_else(|| p.get("text").and_then(Value::as_str))
            })
            .collect::<Vec<_>>()
            .join("");
        if !joined.trim().is_empty() {
            return joined;
        }
    }
    for key in ["reasoning_content", "reasoning", "text", "output_text"] {
        if let Some(s) = message.get(key).and_then(Value::as_str) {
            if !s.trim().is_empty() {
                return s.to_string();
            }
        }
    }
    if let Some(s) = choice
        .pointer("/delta/content")
        .and_then(Value::as_str)
    {
        if !s.trim().is_empty() {
            return s.to_string();
        }
    }
    String::new()
}

fn chat_messages(system_prompt: &str, user_prompt: &str) -> Vec<Value> {
    let mut messages = Vec::new();
    if !system_prompt.trim().is_empty() {
        messages.push(json!({"role": "system", "content": system_prompt}));
    }
    messages.push(json!({"role": "user", "content": user_prompt}));
    messages
}

/// OpenAI-compatible chat completions call. Returns assistant text.
pub async fn chat(
    data_dir: &Path,
    system_prompt: &str,
    user_prompt: &str,
    profile_id: Option<&str>,
) -> Result<String, String> {
    let cfg = resolve_config(data_dir, profile_id)?;
    let body = json!({
        "model": cfg.model,
        "messages": chat_messages(system_prompt, user_prompt),
        "temperature": 0.2,
    });
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| format!("http client: {e}"))?;
    let response = client
        .post(chat_url(&cfg.base_url))
        .bearer_auth(&cfg.api_key)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("LLM request failed: {e}"))?;
    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!(
            "LLM HTTP {status}: {}",
            text.chars().take(400).collect::<String>()
        ));
    }
    let payload: Value = response
        .json()
        .await
        .map_err(|e| format!("LLM response JSON: {e}"))?;
    payload
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .map(str::to_string)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "LLM response missing content".into())
}

/// One SSE delta: assistant content and/or model reasoning (thinking).
#[derive(Debug, Clone, Copy, Default)]
pub struct StreamDelta<'a> {
    pub content: Option<&'a str>,
    pub thinking: Option<&'a str>,
}

fn delta_field<'a>(payload: &'a Value, pointers: &[&str]) -> Option<&'a str> {
    for pointer in pointers {
        if let Some(text) = payload.pointer(pointer).and_then(Value::as_str) {
            if !text.is_empty() {
                return Some(text);
            }
        }
    }
    None
}

/// Streaming OpenAI-compatible chat. Invokes `on_delta` for content and/or reasoning chunks.
pub async fn chat_stream<F>(
    data_dir: &Path,
    system_prompt: &str,
    user_prompt: &str,
    request_id: &str,
    profile_id: Option<&str>,
    mut on_delta: F,
) -> Result<String, String>
where
    F: FnMut(StreamDelta<'_>),
{
    let cfg = resolve_config(data_dir, profile_id)?;
    let cancel = register_cancel(request_id);
    let body = json!({
        "model": cfg.model,
        "messages": chat_messages(system_prompt, user_prompt),
        "temperature": 0.2,
        "stream": true,
    });
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(180))
        .build()
        .map_err(|e| {
            unregister_cancel(request_id);
            format!("http client: {e}")
        })?;
    let response = match client
        .post(chat_url(&cfg.base_url))
        .bearer_auth(&cfg.api_key)
        .header("Content-Type", "application/json")
        .header("Accept", "text/event-stream")
        .json(&body)
        .send()
        .await
    {
        Ok(response) => response,
        Err(e) => {
            unregister_cancel(request_id);
            return Err(format!("LLM stream request failed: {e}"));
        }
    };
    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        if status.as_u16() == 400 || status.as_u16() == 404 || status.as_u16() == 422 {
            let fallback = chat(data_dir, system_prompt, user_prompt, profile_id).await;
            unregister_cancel(request_id);
            let fallback = fallback?;
            if !fallback.is_empty() {
                on_delta(StreamDelta {
                    content: Some(fallback.as_str()),
                    thinking: None,
                });
            }
            return Ok(fallback);
        }
        unregister_cancel(request_id);
        return Err(format!(
            "LLM stream HTTP {status}: {}",
            text.chars().take(400).collect::<String>()
        ));
    }

    use futures_util::StreamExt;
    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut full = String::new();
    let mut thinking_full = String::new();
    let result = async {
        while let Some(chunk) = stream.next().await {
            if cancel.load(Ordering::SeqCst) {
                // Distinguish Stop from a truly empty successful reply.
                return Err("cancelled".into());
            }
            let bytes = chunk.map_err(|e| format!("LLM stream read: {e}"))?;
            buffer.push_str(&String::from_utf8_lossy(&bytes));
            while let Some(idx) = buffer.find('\n') {
                if cancel.load(Ordering::SeqCst) {
                    return Err("cancelled".into());
                }
                let mut line = buffer[..idx].to_string();
                buffer.drain(..=idx);
                if line.ends_with('\r') {
                    line.pop();
                }
                let line = line.trim();
                if line.is_empty() || line.starts_with(':') {
                    continue;
                }
                let Some(data) = line.strip_prefix("data:") else {
                    continue;
                };
                let data = data.trim();
                if data == "[DONE]" {
                    if full.is_empty() && thinking_full.is_empty() {
                        return Err("LLM stream ended without content".into());
                    }
                    return Ok(full);
                }
                let Ok(payload) = serde_json::from_str::<Value>(data) else {
                    continue;
                };
                let content = delta_field(
                    &payload,
                    &["/choices/0/delta/content"],
                );
                let thinking = delta_field(
                    &payload,
                    &[
                        "/choices/0/delta/reasoning_content",
                        "/choices/0/delta/reasoningContent",
                        "/choices/0/delta/reasoning",
                        "/choices/0/delta/thinking",
                    ],
                );
                if content.is_none() && thinking.is_none() {
                    continue;
                }
                if let Some(chunk) = content {
                    full.push_str(chunk);
                }
                if let Some(chunk) = thinking {
                    thinking_full.push_str(chunk);
                }
                on_delta(StreamDelta { content, thinking });
            }
        }
        if cancel.load(Ordering::SeqCst) {
            return Err("cancelled".into());
        }
        // Reasoning-only models may stream only reasoning_content; treat that as success
        // (UI already painted thinking via deltas). Empty both → real failure.
        if full.is_empty() && thinking_full.is_empty() {
            return Err("LLM stream ended without content".into());
        }
        Ok(full)
    }
    .await;
    unregister_cancel(request_id);
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn upsert_multiple_profiles_and_activate() {
        let dir = tempfile::tempdir().expect("temp");
        let first = save(
            dir.path(),
            &json!({
                "label": "One",
                "baseUrl": "https://api.openai.com/v1",
                "model": "gpt-a",
                "apiKey": "sk-a",
                "enabled": true,
            }),
        )
        .expect("save first");
        let id_a = first["activeId"].as_str().unwrap().to_string();
        assert_eq!(first["profiles"].as_array().unwrap().len(), 1);

        let second = save(
            dir.path(),
            &json!({
                "label": "Two",
                "baseUrl": "https://api.deepseek.com/v1",
                "model": "deepseek-chat",
                "apiKey": "sk-b",
                "enabled": true,
                "activate": true,
            }),
        )
        .expect("save second");
        assert_eq!(second["profiles"].as_array().unwrap().len(), 2);
        let id_b = second["activeId"].as_str().unwrap().to_string();
        assert_ne!(id_a, id_b);

        let activated = save(dir.path(), &json!({ "action": "activate", "id": id_a })).unwrap();
        assert_eq!(activated["activeId"].as_str(), Some(id_a.as_str()));

        let deleted = save(dir.path(), &json!({ "action": "delete", "id": id_a })).unwrap();
        assert_eq!(deleted["profiles"].as_array().unwrap().len(), 1);
        assert_eq!(deleted["activeId"].as_str(), Some(id_b.as_str()));
    }

    #[test]
    fn migrates_v1_single_slot() {
        let dir = tempfile::tempdir().expect("temp");
        let vault = vault_for(dir.path());
        let sealed = vault.seal(FIELD_API_KEY, LEGACY_PROFILE_ID, "sk-legacy");
        let path = store_path(dir.path());
        std::fs::write(
            &path,
            serde_json::to_string_pretty(&json!({
                "version": 1,
                "enabled": true,
                "baseUrl": "https://example.com/v1",
                "model": "legacy-model",
                "apiKeySealed": sealed,
            }))
            .unwrap(),
        )
        .unwrap();
        let status = status_view(dir.path());
        assert_eq!(status["profiles"].as_array().unwrap().len(), 1);
        assert_eq!(status["model"].as_str(), Some("legacy-model"));
        assert_eq!(status["hasApiKey"], true);
        assert_eq!(status["configured"], true);
    }
}
