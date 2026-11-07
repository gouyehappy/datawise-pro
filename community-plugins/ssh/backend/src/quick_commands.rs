//! Quick commands: user-defined reusable command snippets persisted in
//! `<plugin_data_dir>/quick-commands.json`. Entries may be global (no
//! `connectionId`) or bound to a specific SSH connection. The workbench shows
//! global entries plus those for the active connection. Entries are plain
//! commands the user explicitly saved; the file still gets 0600 because
//! snippets may embed credentials.

use std::path::Path;

use serde_json::{json, Value};

const STORAGE_VERSION: u64 = 1;
const FILE_NAME: &str = "quick-commands.json";
/// Per-scope cap shared with the workbench editor (`QUICK_COMMANDS_LIMIT`).
/// Global entries and each `connectionId` bucket are limited independently.
pub const MAX_COMMANDS: usize = 200;
const MAX_NAME_LEN: usize = 60;
const MAX_COMMAND_LEN: usize = 500;
const MAX_CONNECTION_ID_LEN: usize = 80;
const MAX_GROUP_LEN: usize = 40;

#[derive(Debug, Clone, PartialEq)]
pub struct QuickCommandEntry {
    pub id: String,
    pub name: String,
    pub command: String,
    /// Empty = global (visible on every connection).
    pub connection_id: String,
    /// Optional user group label (empty = ungrouped).
    pub group: String,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct QuickCommandStore {
    pub commands: Vec<QuickCommandEntry>,
}

fn unix_now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

/// Normalizes optional connection scope: blank / missing → global (`""`).
fn normalize_connection_id(raw: Option<&str>) -> Result<String, String> {
    let trimmed = raw.map(str::trim).unwrap_or("").to_string();
    if trimmed.chars().count() > MAX_CONNECTION_ID_LEN {
        return Err(format!(
            "Quick command connectionId is limited to {MAX_CONNECTION_ID_LEN} characters"
        ));
    }
    Ok(trimmed)
}

fn count_in_scope(store: &QuickCommandStore, connection_id: &str) -> usize {
    store
        .commands
        .iter()
        .filter(|entry| entry.connection_id == connection_id)
        .count()
}

pub fn store_path(data_dir: &Path) -> std::path::PathBuf {
    data_dir.join(FILE_NAME)
}

/// Loads the store; a missing or corrupted file yields an empty store so a
/// bad file can never break the workbench (same policy as quick-sudo-profiles).
pub fn load_store(data_dir: &Path) -> QuickCommandStore {
    let text = std::fs::read_to_string(store_path(data_dir)).unwrap_or_default();
    let Some(value) = serde_json::from_str::<Value>(&text).ok() else {
        return QuickCommandStore::default();
    };
    let commands = value
        .get("commands")
        .and_then(Value::as_array)
        .map(|list| list.iter().filter_map(entry_from_json).collect())
        .unwrap_or_default();
    QuickCommandStore { commands }
}

/// Persists atomically (tmp + rename) with 0600 permissions on Unix.
pub fn save_store(data_dir: &Path, store: &QuickCommandStore) -> Result<(), String> {
    let path = store_path(data_dir);
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let value = json!({
        "version": STORAGE_VERSION,
        "commands": store.commands.iter().map(entry_json).collect::<Vec<_>>(),
    });
    let text = serde_json::to_string_pretty(&value)
        .map_err(|error| format!("Failed to encode quick commands: {error}"))?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, text)
        .map_err(|error| format!("Failed to write {}: {error}", tmp.display()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o600));
    }
    std::fs::rename(&tmp, &path)
        .map_err(|error| format!("Failed to write {}: {error}", path.display()))
}

fn entry_from_json(value: &Value) -> Option<QuickCommandEntry> {
    let object = value.as_object()?;
    let string = |key: &str| {
        object
            .get(key)
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string()
    };
    let id = string("id");
    let command = string("command");
    if id.trim().is_empty() || command.trim().is_empty() {
        return None;
    }
    let connection_id = object
        .get("connectionId")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("")
        .to_string();
    let group = object
        .get("group")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.chars().take(MAX_GROUP_LEN).collect())
        .unwrap_or_default();
    Some(QuickCommandEntry {
        id,
        name: string("name"),
        command,
        connection_id,
        group,
        created_at: object.get("createdAt").and_then(Value::as_u64).unwrap_or(0),
        updated_at: object.get("updatedAt").and_then(Value::as_u64).unwrap_or(0),
    })
}

fn entry_json(entry: &QuickCommandEntry) -> Value {
    let mut value = json!({
        "id": entry.id,
        "name": entry.name,
        "command": entry.command,
        "createdAt": entry.created_at,
        "updatedAt": entry.updated_at,
    });
    if !entry.connection_id.is_empty() {
        value["connectionId"] = json!(entry.connection_id);
    }
    if !entry.group.is_empty() {
        value["group"] = json!(entry.group);
    }
    value
}

pub fn entry_view(entry: &QuickCommandEntry) -> Value {
    entry_json(entry)
}

/// Insertion order (createdAt asc) so the workbench dropdown is stable.
pub fn list_views(store: &QuickCommandStore) -> Vec<Value> {
    store.commands.iter().map(entry_view).collect()
}

/// Creates or updates one entry from the shared camelCase parameter shape
/// (protocol `ssh/quickCommands/save`). A blank `name` falls back to the
/// command itself (front-end parity). Optional `connectionId` binds the
/// entry to one SSH connection; blank/missing means global. Returns the
/// saved entry plus whether it was newly created.
pub fn save_entry(
    store: &mut QuickCommandStore,
    params: &Value,
) -> Result<(QuickCommandEntry, bool), String> {
    let command = params
        .get("command")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or("Missing command")?;
    if command.chars().count() > MAX_COMMAND_LEN {
        return Err(format!(
            "Quick command is limited to {MAX_COMMAND_LEN} characters"
        ));
    }
    let name_input = params
        .get("name")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or_default();
    if name_input.chars().count() > MAX_NAME_LEN {
        return Err(format!(
            "Quick command name is limited to {MAX_NAME_LEN} characters"
        ));
    }
    let connection_id = normalize_connection_id(
        params
            .get("connectionId")
            .and_then(Value::as_str),
    )?;
    let group = params
        .get("group")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or_default();
    if group.chars().count() > MAX_GROUP_LEN {
        return Err(format!(
            "Quick command group is limited to {MAX_GROUP_LEN} characters"
        ));
    }
    let group = group.to_string();
    let existing_id = params
        .get("id")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty());
    let existing =
        existing_id.and_then(|id| store.commands.iter().position(|entry| entry.id == id));

    let scope_count = match existing {
        Some(index) => store
            .commands
            .iter()
            .enumerate()
            .filter(|(i, entry)| *i != index && entry.connection_id == connection_id)
            .count(),
        None => count_in_scope(store, &connection_id),
    };
    // For updates, `scope_count` excludes the entry itself so staying in a
    // full scope still allows edits; moving into a full scope is rejected.
    if scope_count >= MAX_COMMANDS {
        return Err(format!(
            "At most {MAX_COMMANDS} quick commands are supported for this scope"
        ));
    }

    let now = unix_now_secs();
    let name = if name_input.is_empty() {
        command.chars().take(MAX_NAME_LEN).collect()
    } else {
        name_input.to_string()
    };
    let entry = match existing {
        Some(index) => {
            let entry = &mut store.commands[index];
            entry.name = name;
            entry.command = command.to_string();
            entry.connection_id = connection_id;
            entry.group = group;
            entry.updated_at = now;
            entry.clone()
        }
        None => {
            let entry = QuickCommandEntry {
                id: uuid::Uuid::new_v4().to_string(),
                name,
                command: command.to_string(),
                connection_id,
                group,
                created_at: now,
                updated_at: now,
            };
            store.commands.push(entry.clone());
            entry
        }
    };
    Ok((entry, existing.is_none()))
}

/// Removes an entry by id; returns false when the id is unknown (mirrors
/// `ssh/knownHosts/remove` semantics).
pub fn delete_entry(store: &mut QuickCommandStore, id: &str) -> bool {
    let before = store.commands.len();
    store.commands.retain(|entry| entry.id != id);
    store.commands.len() != before
}

/// Removes every entry bound to `connection_id`. Global entries (empty
/// connection id) are never removed. Returns how many entries were deleted —
/// used when a host connection is gone and its private snippets should not
/// linger as invisible orphans.
pub fn delete_by_connection(store: &mut QuickCommandStore, connection_id: &str) -> usize {
    let scope = connection_id.trim();
    if scope.is_empty() {
        return 0;
    }
    let before = store.commands.len();
    store
        .commands
        .retain(|entry| entry.connection_id != scope);
    before.saturating_sub(store.commands.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn save(store: &mut QuickCommandStore, name: &str, command: &str) -> QuickCommandEntry {
        save_entry(store, &json!({ "name": name, "command": command }))
            .unwrap()
            .0
    }

    fn save_bound(
        store: &mut QuickCommandStore,
        name: &str,
        command: &str,
        connection_id: &str,
    ) -> QuickCommandEntry {
        save_entry(
            store,
            &json!({ "name": name, "command": command, "connectionId": connection_id }),
        )
        .unwrap()
        .0
    }

    #[test]
    fn save_creates_updates_and_defaults_name() {
        let mut store = QuickCommandStore::default();
        let (created_entry, created) =
            save_entry(&mut store, &json!({ "command": "df -h" })).unwrap();
        assert!(created);
        assert_eq!(created_entry.name, "df -h");
        assert!(created_entry.connection_id.is_empty());
        let id = created_entry.id;
        let (updated, created) = save_entry(
            &mut store,
            &json!({ "id": id, "name": "disk", "command": "df -h /" }),
        )
        .unwrap();
        assert!(!created);
        assert_eq!(updated.name, "disk");
        assert_eq!(store.commands.len(), 1);
        assert_eq!(store.commands[0].command, "df -h /");
    }

    #[test]
    fn save_persists_optional_group() {
        let mut store = QuickCommandStore::default();
        let (created, _) = save_entry(
            &mut store,
            &json!({ "name": "pods", "command": "kubectl get pods", "group": "  k8s  " }),
        )
        .unwrap();
        assert_eq!(created.group, "k8s");
        let view = entry_view(&created);
        assert_eq!(view.get("group").and_then(Value::as_str), Some("k8s"));
        let (cleared, _) = save_entry(
            &mut store,
            &json!({ "id": created.id, "name": "pods", "command": "kubectl get pods", "group": "" }),
        )
        .unwrap();
        assert!(cleared.group.is_empty());
        assert!(entry_view(&cleared).get("group").is_none());
    }

    #[test]
    fn save_binds_connection_and_allows_scope_change() {
        let mut store = QuickCommandStore::default();
        let created = save_bound(&mut store, "pods", "kubectl get pods", "conn-a");
        assert_eq!(created.connection_id, "conn-a");
        assert_eq!(store.commands[0].connection_id, "conn-a");

        let (updated, _) = save_entry(
            &mut store,
            &json!({
                "id": created.id,
                "name": "pods",
                "command": "kubectl get pods",
                "connectionId": "",
            }),
        )
        .unwrap();
        assert!(updated.connection_id.is_empty());
        assert!(store.commands[0].connection_id.is_empty());
    }

    #[test]
    fn missing_connection_id_field_loads_as_global() {
        let dir = std::env::temp_dir().join(format!("ssh-quick-cmds-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            store_path(&dir),
            r#"{"version":1,"commands":[{"id":"1","name":"df","command":"df -h","createdAt":1,"updatedAt":1}]}"#,
        )
        .unwrap();
        let loaded = load_store(&dir);
        assert_eq!(loaded.commands.len(), 1);
        assert!(loaded.commands[0].connection_id.is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn save_rejects_missing_or_oversized_input() {
        let mut store = QuickCommandStore::default();
        assert!(save_entry(&mut store, &json!({ "command": "   " })).is_err());
        assert!(save_entry(&mut store, &json!({})).is_err());
        assert!(save_entry(&mut store, &json!({ "command": "a".repeat(501) })).is_err());
        save(&mut store, "ops", "echo hi");
        assert!(save_entry(
            &mut store,
            &json!({ "command": "echo hi", "name": "n".repeat(61) })
        )
        .is_err());
        assert!(save_entry(
            &mut store,
            &json!({ "command": "echo hi", "connectionId": "c".repeat(81) })
        )
        .is_err());
    }

    #[test]
    fn cap_is_per_scope() {
        let mut store = QuickCommandStore::default();
        for index in 0..MAX_COMMANDS {
            save(&mut store, &format!("g{index}"), "echo global");
        }
        assert!(save_entry(&mut store, &json!({ "command": "overflow" })).is_err());
        // A different connection scope still has room.
        assert!(save_entry(
            &mut store,
            &json!({ "command": "echo bound", "connectionId": "conn-a" })
        )
        .is_ok());
        for index in 0..(MAX_COMMANDS - 1) {
            save_bound(&mut store, &format!("a{index}"), "echo a", "conn-a");
        }
        assert!(save_entry(
            &mut store,
            &json!({ "command": "overflow-a", "connectionId": "conn-a" })
        )
        .is_err());
        // Updating within the same full scope stays ok.
        let id = store
            .commands
            .iter()
            .find(|entry| entry.connection_id == "conn-a")
            .unwrap()
            .id
            .clone();
        assert!(save_entry(
            &mut store,
            &json!({ "id": id, "command": "echo ok", "connectionId": "conn-a" })
        )
        .is_ok());
    }

    #[test]
    fn moving_into_full_scope_is_rejected() {
        let mut store = QuickCommandStore::default();
        for index in 0..MAX_COMMANDS {
            save_bound(&mut store, &format!("a{index}"), "echo a", "conn-a");
        }
        let global = save(&mut store, "global", "echo g");
        assert!(save_entry(
            &mut store,
            &json!({
                "id": global.id,
                "name": "global",
                "command": "echo g",
                "connectionId": "conn-a",
            })
        )
        .is_err());
    }

    #[test]
    fn delete_reports_presence() {
        let mut store = QuickCommandStore::default();
        let entry = save(&mut store, "ops", "echo hi");
        assert!(delete_entry(&mut store, &entry.id));
        assert!(!delete_entry(&mut store, &entry.id));
        assert!(store.commands.is_empty());
    }

    #[test]
    fn corrupted_file_falls_back_to_empty_store() {
        let dir = std::env::temp_dir().join(format!("ssh-quick-cmds-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(store_path(&dir), "{not json").unwrap();
        assert!(load_store(&dir).commands.is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn store_roundtrip_preserves_connection_id() {
        let dir = std::env::temp_dir().join(format!("ssh-quick-cmds-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let mut store = QuickCommandStore::default();
        save(&mut store, "disk", "df -h");
        save_bound(&mut store, "uptime", "uptime", "conn-b");
        save_store(&dir, &store).unwrap();
        let loaded = load_store(&dir);
        assert_eq!(loaded, store);
        assert_eq!(loaded.commands.len(), 2);
        assert!(loaded.commands[0].connection_id.is_empty());
        assert_eq!(loaded.commands[1].connection_id, "conn-b");
        let text = std::fs::read_to_string(store_path(&dir)).unwrap();
        assert!(!text.contains("\"connectionId\": \"\""));
        assert!(text.contains("\"connectionId\": \"conn-b\""));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn delete_by_connection_removes_only_that_scope() {
        let mut store = QuickCommandStore::default();
        save(&mut store, "global", "echo g");
        save_bound(&mut store, "a1", "echo a1", "conn-a");
        save_bound(&mut store, "a2", "echo a2", "conn-a");
        save_bound(&mut store, "b1", "echo b1", "conn-b");
        assert_eq!(delete_by_connection(&mut store, "conn-a"), 2);
        assert_eq!(store.commands.len(), 2);
        assert!(store.commands.iter().all(|entry| entry.connection_id != "conn-a"));
        assert_eq!(delete_by_connection(&mut store, ""), 0);
        assert_eq!(delete_by_connection(&mut store, "missing"), 0);
        assert_eq!(store.commands.len(), 2);
    }

    #[test]
    fn views_carry_full_fields_in_insertion_order() {
        let mut store = QuickCommandStore::default();
        save(&mut store, "disk", "df -h");
        save_bound(&mut store, "uptime", "uptime", "conn-x");
        let views = list_views(&store);
        assert_eq!(views.len(), 2);
        assert_eq!(views[0]["name"], "disk");
        assert!(views[0].get("connectionId").is_none());
        assert_eq!(views[1]["command"], "uptime");
        assert_eq!(views[1]["connectionId"], "conn-x");
        assert!(views[0]["id"].as_str().is_some_and(|id| !id.is_empty()));
    }
}
