use datawise_plugin_sdk::PluginError;
use serde_json::Value;

pub fn plugin_err(message: impl Into<String>) -> PluginError {
    PluginError::new(-32000, message)
}

pub fn required_string<'a>(params: &'a Value, key: &str) -> Result<&'a str, PluginError> {
    params
        .get(key)
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| plugin_err(format!("Missing required field: {key}")))
}

pub fn optional_string<'a>(params: &'a Value, key: &str) -> Option<&'a str> {
    params
        .get(key)
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
}

pub fn normalize_prefix(path: &str) -> String {
    let t = path.trim().trim_matches('/');
    if t.is_empty() {
        String::new()
    } else {
        format!("{t}/")
    }
}

pub fn normalize_object_path(path: &str) -> String {
    path.trim().trim_start_matches('/').to_string()
}
