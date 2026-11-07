//! Live workbench session context for the SSH session copilot / MCP.
//! Frontend publishes UI-only fields (cwd, SFTP path, selection, metrics digest);
//! backend merges connection metadata. Secrets never enter this payload.

use std::collections::HashMap;
use std::sync::Mutex;

use serde_json::{json, Value};

const MAX_PATH_LEN: usize = 1024;
const MAX_SELECTED: usize = 50;
const MAX_DIGEST_LEN: usize = 512;

#[derive(Debug, Clone, Default)]
pub struct SessionContextOverlay {
    pub shell_cwd: Option<String>,
    pub sftp_path: Option<String>,
    pub selected_paths: Vec<String>,
    pub metrics_digest: Option<String>,
}

#[derive(Debug, Default)]
pub struct SessionContextStore {
    overlays: Mutex<HashMap<String, SessionContextOverlay>>,
}

impl SessionContextStore {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn publish(&self, session_id: &str, params: &Value) -> Result<SessionContextOverlay, String> {
        let session_id = session_id.trim();
        if session_id.is_empty() {
            return Err("sessionId is required".into());
        }
        let mut overlay = SessionContextOverlay::default();
        if let Some(cwd) = params.get("shellCwd").and_then(Value::as_str) {
            overlay.shell_cwd = Some(truncate(cwd.trim(), MAX_PATH_LEN));
        }
        if let Some(path) = params.get("sftpPath").and_then(Value::as_str) {
            overlay.sftp_path = Some(truncate(path.trim(), MAX_PATH_LEN));
        }
        if let Some(paths) = params.get("selectedPaths").and_then(Value::as_array) {
            overlay.selected_paths = paths
                .iter()
                .filter_map(Value::as_str)
                .map(|p| truncate(p.trim(), MAX_PATH_LEN))
                .filter(|p| !p.is_empty())
                .take(MAX_SELECTED)
                .collect();
        }
        if let Some(digest) = params.get("metricsDigest").and_then(Value::as_str) {
            overlay.metrics_digest = Some(truncate(digest.trim(), MAX_DIGEST_LEN));
        }
        let mut guard = self
            .overlays
            .lock()
            .map_err(|_| "session context store poisoned".to_string())?;
        guard.insert(session_id.to_string(), overlay.clone());
        Ok(overlay)
    }

    pub fn get(&self, session_id: &str) -> SessionContextOverlay {
        self.overlays
            .lock()
            .ok()
            .and_then(|guard| guard.get(session_id).cloned())
            .unwrap_or_default()
    }

    pub fn clear(&self, session_id: &str) {
        if let Ok(mut guard) = self.overlays.lock() {
            guard.remove(session_id);
        }
    }
}

pub fn to_json(
    connection_id: &str,
    session_id: &str,
    host: &str,
    user: &str,
    read_only: bool,
    agent_mode: &str,
    overlay: &SessionContextOverlay,
) -> Value {
    json!({
        "connectionId": connection_id,
        "sessionId": session_id,
        "host": host,
        "user": user,
        "readOnly": read_only,
        "agentMode": agent_mode,
        "shellCwd": overlay.shell_cwd,
        "sftpPath": overlay.sftp_path,
        "selectedPaths": overlay.selected_paths,
        "metricsDigest": overlay.metrics_digest,
    })
}

fn truncate(value: &str, max: usize) -> String {
    value.chars().take(max).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn publish_and_get_round_trip() {
        let store = SessionContextStore::new();
        store
            .publish(
                "sess-1",
                &json!({
                    "shellCwd": "/var/log",
                    "sftpPath": "/home/ops",
                    "selectedPaths": ["/home/ops/a.conf", "/home/ops/b.conf"],
                    "metricsDigest": "CPU 12% MEM 40%",
                }),
            )
            .expect("publish");
        let overlay = store.get("sess-1");
        assert_eq!(overlay.shell_cwd.as_deref(), Some("/var/log"));
        assert_eq!(overlay.sftp_path.as_deref(), Some("/home/ops"));
        assert_eq!(overlay.selected_paths.len(), 2);
        assert_eq!(overlay.metrics_digest.as_deref(), Some("CPU 12% MEM 40%"));
    }
}
