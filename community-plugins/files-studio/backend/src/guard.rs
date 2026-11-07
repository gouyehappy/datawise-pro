use std::collections::VecDeque;
use std::sync::Mutex;

use chrono::{SecondsFormat, Utc};
use datawise_plugin_sdk::PluginError;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

use crate::util::plugin_err;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GuardPolicy {
    pub readonly: bool,
    pub deny_delete: bool,
    pub require_confirm_delete: bool,
    pub allowed_prefix: String,
    pub max_upload_bytes: u64,
}

impl Default for GuardPolicy {
    fn default() -> Self {
        Self {
            readonly: false,
            deny_delete: false,
            require_confirm_delete: true,
            allowed_prefix: String::new(),
            max_upload_bytes: 0,
        }
    }
}

impl GuardPolicy {
    pub fn from_config(external: &std::collections::HashMap<String, Value>) -> Self {
        let mut p = Self::default();
        p.readonly = bool_val(external, "readonly", false) || bool_val(external, "guard_readonly", false);
        p.deny_delete =
            bool_val(external, "deny_delete", false) || bool_val(external, "guard_deny_delete", false);
        p.require_confirm_delete = bool_val(external, "require_confirm_delete", true)
            || bool_val(external, "guard_require_confirm_delete", true);
        if let Some(prefix) = external
            .get("allowed_prefix")
            .or_else(|| external.get("guard_allowed_prefix"))
            .and_then(Value::as_str)
        {
            p.allowed_prefix = prefix.trim().trim_matches('/').to_string();
        }
        if let Some(n) = external
            .get("max_upload_bytes")
            .or_else(|| external.get("guard_max_upload_bytes"))
            .and_then(Value::as_u64)
        {
            p.max_upload_bytes = n;
        }
        p
    }

    pub fn to_json(&self) -> Value {
        json!({
            "readonly": self.readonly,
            "denyDelete": self.deny_delete,
            "requireConfirmDelete": self.require_confirm_delete,
            "allowedPrefix": self.allowed_prefix,
            "maxUploadBytes": self.max_upload_bytes,
        })
    }

    pub fn assert_writable(&self) -> Result<(), PluginError> {
        if self.readonly {
            Err(plugin_err("Mount is read-only (Guard)"))
        } else {
            Ok(())
        }
    }

    pub fn assert_path_allowed(&self, path: &str) -> Result<(), PluginError> {
        if self.allowed_prefix.is_empty() {
            return Ok(());
        }
        let path = path.trim_start_matches('/');
        let prefix = self.allowed_prefix.trim_matches('/');
        if path == prefix || path.starts_with(&format!("{prefix}/")) {
            Ok(())
        } else {
            Err(plugin_err(format!(
                "Path '{path}' is outside allowed prefix '{prefix}' (Guard)"
            )))
        }
    }

    pub fn assert_upload_size(&self, size: u64) -> Result<(), PluginError> {
        if self.max_upload_bytes > 0 && size > self.max_upload_bytes {
            Err(plugin_err(format!(
                "Upload size {size} exceeds max_upload_bytes {} (Guard)",
                self.max_upload_bytes
            )))
        } else {
            Ok(())
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct PendingOp {
    pub id: String,
    pub mount_id: String,
    pub kind: String,
    pub path: String,
    pub detail: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct AuditEntry {
    pub id: String,
    pub at: String,
    pub mount_id: String,
    pub action: String,
    pub path: String,
    pub detail: String,
    pub ok: bool,
}

pub struct GuardState {
    pending: Mutex<VecDeque<PendingOp>>,
    audit: Mutex<VecDeque<AuditEntry>>,
}

impl GuardState {
    pub fn new() -> Self {
        Self {
            pending: Mutex::new(VecDeque::new()),
            audit: Mutex::new(VecDeque::new()),
        }
    }

    pub fn enqueue_confirm(
        &self,
        mount_id: &str,
        kind: &str,
        path: &str,
        detail: &str,
    ) -> PendingOp {
        let op = PendingOp {
            id: Uuid::new_v4().to_string(),
            mount_id: mount_id.to_string(),
            kind: kind.to_string(),
            path: path.to_string(),
            detail: detail.to_string(),
            created_at: Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true),
        };
        if let Ok(mut q) = self.pending.lock() {
            q.push_back(op.clone());
            while q.len() > 200 {
                q.pop_front();
            }
        }
        op
    }

    pub fn take_pending(&self, id: &str) -> Result<PendingOp, PluginError> {
        let mut q = self
            .pending
            .lock()
            .map_err(|_| plugin_err("Guard lock poisoned"))?;
        if let Some(pos) = q.iter().position(|o| o.id == id) {
            Ok(q.remove(pos).unwrap())
        } else {
            Err(plugin_err(format!("Pending operation not found: {id}")))
        }
    }

    pub fn list_pending(&self, mount_id: Option<&str>) -> Vec<PendingOp> {
        self.pending
            .lock()
            .map(|q| {
                q.iter()
                    .filter(|o| mount_id.map(|m| o.mount_id == m).unwrap_or(true))
                    .cloned()
                    .collect()
            })
            .unwrap_or_default()
    }

    pub fn audit(
        &self,
        mount_id: &str,
        action: &str,
        path: &str,
        detail: &str,
        ok: bool,
    ) {
        let entry = AuditEntry {
            id: Uuid::new_v4().to_string(),
            at: Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true),
            mount_id: mount_id.to_string(),
            action: action.to_string(),
            path: path.to_string(),
            detail: detail.to_string(),
            ok,
        };
        if let Ok(mut q) = self.audit.lock() {
            q.push_back(entry);
            while q.len() > 500 {
                q.pop_front();
            }
        }
    }

    pub fn list_audit(&self, mount_id: Option<&str>, limit: usize) -> Vec<AuditEntry> {
        self.audit
            .lock()
            .map(|q| {
                q.iter()
                    .rev()
                    .filter(|e| mount_id.map(|m| e.mount_id == m).unwrap_or(true))
                    .take(limit.max(1))
                    .cloned()
                    .collect()
            })
            .unwrap_or_default()
    }
}

fn bool_val(map: &std::collections::HashMap<String, Value>, key: &str, default: bool) -> bool {
    match map.get(key) {
        Some(Value::Bool(b)) => *b,
        Some(Value::String(s)) => matches!(s.to_ascii_lowercase().as_str(), "true" | "1" | "yes"),
        _ => default,
    }
}
