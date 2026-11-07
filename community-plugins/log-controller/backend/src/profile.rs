//! Workbench profile (directory, logins, servers, scenes) under the host
//! plugin data directory. The folder name of the workspace is not assumed.

use std::fs;
use std::path::{Path, PathBuf};

use datawise_plugin_sdk::PluginError;
use serde_json::{json, Value};

use crate::util::plugin_err;

const FILE_NAME: &str = "profile.json";

pub fn read(connection_id: &str) -> Value {
    let Ok(path) = profile_path(connection_id) else {
        return Value::Null;
    };
    let Ok(text) = fs::read_to_string(path) else {
        return Value::Null;
    };
    serde_json::from_str(&text).unwrap_or(Value::Null)
}

pub fn write(connection_id: &str, document: &Value) -> Result<(), PluginError> {
    let path = profile_path(connection_id)?;
    let parent = path
        .parent()
        .ok_or_else(|| plugin_err("插件数据目录无效"))?;
    fs::create_dir_all(parent).map_err(|error| plugin_err(format!("创建插件数据目录失败: {error}")))?;
    let body = serde_json::to_vec_pretty(&stored_document(connection_id, document))
        .map_err(|error| plugin_err(format!("配置无法序列化: {error}")))?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, &body).map_err(|error| plugin_err(format!("写入配置失败: {error}")))?;
    fs::rename(&tmp, &path).map_err(|error| plugin_err(format!("保存配置失败: {error}")))?;
    Ok(())
}

fn stored_document(connection_id: &str, document: &Value) -> Value {
    let mut out = serde_json::Map::new();
    out.insert("connectionId".into(), json!(connection_id));
    for key in [
        "serviceName",
        "logDir",
        "logGlob",
        "user",
        "password",
        "privateKey",
        "defaultPort",
        "primaryHost",
        "jumps",
        "servers",
        "scenes",
    ] {
        if let Some(value) = document.get(key) {
            out.insert(key.to_string(), value.clone());
        }
    }
    Value::Object(out)
}

fn profile_path(connection_id: &str) -> Result<PathBuf, PluginError> {
    let root = std::env::var("DATAWISE_PLUGIN_DATA_DIR")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| plugin_err("宿主未提供插件数据目录"))?;
    let id = sanitize_id(connection_id);
    if id.is_empty() {
        return Err(plugin_err("请从连接菜单打开"));
    }
    Ok(Path::new(&root)
        .join("profiles")
        .join(id)
        .join(FILE_NAME))
}

fn sanitize_id(connection_id: &str) -> String {
    connection_id
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.' {
                ch
            } else {
                '_'
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn round_trip_keeps_servers_and_scenes() {
        let dir = std::env::temp_dir().join(format!(
            "log-profile-{}",
            uuid_like()
        ));
        std::env::set_var("DATAWISE_PLUGIN_DATA_DIR", &dir);
        let doc = json!({
            "logDir": "/var/log/app",
            "user": "ops",
            "password": "secret",
            "servers": [{ "id": "s1", "host": "10.0.0.8", "port": 22 }],
            "scenes": [{ "id": "sc1", "name": "支付" }]
        });
        write("conn/1", &doc).unwrap();
        let loaded = read("conn/1");
        assert_eq!(loaded["logDir"], "/var/log/app");
        assert_eq!(loaded["password"], "secret");
        assert_eq!(loaded["servers"][0]["host"], "10.0.0.8");
        assert_eq!(loaded["scenes"][0]["name"], "支付");
        assert!(dir.join("profiles").join("conn_1").join("profile.json").is_file());
        let _ = fs::remove_dir_all(dir);
    }

    fn uuid_like() -> String {
        format!("{}", std::process::id())
    }
}
