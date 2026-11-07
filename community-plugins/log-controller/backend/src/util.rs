use datawise_plugin_sdk::PluginError;
use serde_json::Value;

pub fn plugin_err(msg: impl Into<String>) -> PluginError {
    PluginError::new(-32000, msg.into())
}

pub fn required_string<'a>(params: &'a Value, key: &str) -> Result<&'a str, PluginError> {
    params
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| plugin_err(format!("Missing {key}")))
}

pub fn optional_string<'a>(params: &'a Value, key: &str) -> Option<&'a str> {
    params
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
}

pub fn obj_map(value: Option<&Value>) -> serde_json::Map<String, Value> {
    value
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default()
}

pub fn merge_maps(
    a: serde_json::Map<String, Value>,
    b: serde_json::Map<String, Value>,
) -> serde_json::Map<String, Value> {
    let mut out = a;
    for (k, v) in b {
        out.insert(k, v);
    }
    out
}

pub fn str_in<'a>(map: &'a serde_json::Map<String, Value>, key: &str) -> Option<&'a str> {
    map.get(key).and_then(Value::as_str).map(str::trim).filter(|s| !s.is_empty())
}

pub fn u64_in(map: &serde_json::Map<String, Value>, key: &str) -> Option<u64> {
    map.get(key).and_then(|v| {
        v.as_u64()
            .or_else(|| v.as_i64().map(|n| n.max(0) as u64))
            .or_else(|| v.as_str()?.parse().ok())
    })
}
