//! Remote Docker container inspect/control via structured `ssh/docker/*` RPCs.
//! Container ids/names are allowlisted before shell interpolation.
//! Interactive `docker exec -it` is not a separate RPC: the workbench injects
//! [`exec_shell_command`] into the shared SSH PTY (same path as quick commands).

use serde_json::{json, Map, Value};

use crate::ssh::SshRuntime;
use crate::sudo_fs;

const LIST_TIMEOUT_SECS: u64 = 30;
const LOGS_TIMEOUT_SECS: u64 = 45;
const ACTION_TIMEOUT_SECS: u64 = 60;
const LOGS_MAX_CHARS: usize = 256 * 1024;
const PS_JSON_FORMAT: &str = "{{json .}}";

pub fn sanitize_container_ref(value: &str) -> Result<&str, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("Container id is required".to_string());
    }
    let mut chars = trimmed.chars();
    let Some(first) = chars.next() else {
        return Err("Container id is required".to_string());
    };
    if !first.is_ascii_alphanumeric() {
        return Err("Invalid container id".to_string());
    }
    if trimmed.len() > 128 {
        return Err("Invalid container id".to_string());
    }
    if !chars.all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '_' | '.' | '-')) {
        return Err("Invalid container id".to_string());
    }
    Ok(trimmed)
}

pub fn parse_action(value: &str) -> Result<&'static str, String> {
    match value.trim() {
        "start" => Ok("start"),
        "stop" => Ok("stop"),
        "restart" => Ok("restart"),
        _ => Err("Docker action must be start, stop or restart".to_string()),
    }
}

pub fn looks_like_docker_permission(output: &str) -> bool {
    let lower = output.to_ascii_lowercase();
    lower.contains("permission denied")
        || lower.contains("access denied")
        || lower.contains("cannot connect to the docker daemon")
        || lower.contains("connect: permission")
        || lower.contains("got permission denied while trying to connect")
}

pub fn parse_ps_output(output: &str) -> Vec<Value> {
    let mut rows = Vec::new();
    for line in output.lines() {
        let trimmed = line.trim();
        if !trimmed.starts_with('{') {
            continue;
        }
        let Ok(raw) = serde_json::from_str::<Value>(trimmed) else {
            continue;
        };
        let Some(obj) = raw.as_object() else {
            continue;
        };
        let id_raw = obj
            .get("ID")
            .or_else(|| obj.get("Id"))
            .and_then(Value::as_str)
            .unwrap_or("");
        let Ok(id) = sanitize_container_ref(id_raw) else {
            continue;
        };
        let name = obj
            .get("Names")
            .or_else(|| obj.get("Name"))
            .and_then(Value::as_str)
            .unwrap_or(id)
            .trim_start_matches('/')
            .split(',')
            .next()
            .unwrap_or(id);
        let image = obj
            .get("Image")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let status = obj
            .get("Status")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let state = obj
            .get("State")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_ascii_lowercase();
        let running = state == "running" || status.to_ascii_lowercase().starts_with("up");
        let mut row = Map::new();
        row.insert("id".to_string(), json!(id));
        row.insert("name".to_string(), json!(name));
        row.insert("image".to_string(), json!(image));
        row.insert("status".to_string(), json!(status));
        row.insert("running".to_string(), json!(running));
        rows.push(Value::Object(row));
    }
    rows
}

pub fn ps_command() -> String {
    format!("docker ps -a --no-trunc --format '{PS_JSON_FORMAT}'")
}

pub fn logs_command(container: &str) -> Result<String, String> {
    let id = sanitize_container_ref(container)?;
    Ok(format!(
        "docker logs --tail 200 -- {}",
        sudo_fs::shell_quote(id)
    ))
}

pub fn action_command(action: &str, container: &str) -> Result<String, String> {
    let verb = parse_action(action)?;
    let id = sanitize_container_ref(container)?;
    Ok(format!("docker {verb} -- {}", sudo_fs::shell_quote(id)))
}

/// Interactive shell line for a running container (bash with `sh` fallback).
/// The workbench injects this into the SSH PTY rather than opening a separate
/// `ssh/docker/exec` channel — interactive TTY needs the shared session PTY.
pub fn exec_shell_command(container: &str) -> Result<String, String> {
    let id = sanitize_container_ref(container)?;
    let quoted = sudo_fs::shell_quote(id);
    Ok(format!(
        "docker exec -it -- {quoted} bash || docker exec -it -- {quoted} sh"
    ))
}

fn truncate_output(output: &str) -> String {
    if output.chars().count() <= LOGS_MAX_CHARS {
        return output.to_string();
    }
    output.chars().take(LOGS_MAX_CHARS).collect()
}

fn exec_codes(response: &Value) -> (String, i64) {
    let output = response
        .get("output")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let code = response.get("exitCode").and_then(Value::as_i64).unwrap_or(1);
    (output, code)
}

async fn docker_exec(
    runtime: &SshRuntime,
    session_id: &str,
    command: &str,
    timeout: u64,
    allow_sudo: bool,
) -> Result<(String, i64), String> {
    let first = runtime
        .exec(session_id, None, command, false, Some(timeout))
        .await?;
    let (output, code) = exec_codes(&first);
    if code == 0 || !allow_sudo || !looks_like_docker_permission(&output) {
        return Ok((output, code));
    }
    match runtime
        .exec(session_id, None, command, true, Some(timeout))
        .await
    {
        Ok(second) => Ok(exec_codes(&second)),
        Err(error)
            if error.contains("read-only") || error.contains("Quick Sudo is disabled") =>
        {
            Ok((output, code))
        }
        Err(error) => Err(error),
    }
}

fn fail_if_nonzero(output: &str, code: i64, fallback: &str) -> Result<(), String> {
    if code == 0 {
        return Ok(());
    }
    let message = output.trim();
    if message.is_empty() {
        return Err(fallback.to_string());
    }
    Err(truncate_output(message))
}

pub async fn list_containers(runtime: &SshRuntime, session_id: &str) -> Result<Value, String> {
    let (output, code) = docker_exec(
        runtime,
        session_id,
        &ps_command(),
        LIST_TIMEOUT_SECS,
        true,
    )
    .await?;
    fail_if_nonzero(&output, code, "docker ps failed")?;
    Ok(json!({ "containers": parse_ps_output(&output) }))
}

pub async fn container_logs(
    runtime: &SshRuntime,
    session_id: &str,
    container: &str,
) -> Result<Value, String> {
    let command = logs_command(container)?;
    let (output, code) = docker_exec(
        runtime,
        session_id,
        &command,
        LOGS_TIMEOUT_SECS,
        true,
    )
    .await?;
    fail_if_nonzero(&output, code, "docker logs failed")?;
    Ok(json!({ "output": truncate_output(&output) }))
}

pub async fn container_action(
    runtime: &SshRuntime,
    session_id: &str,
    action: &str,
    container: &str,
) -> Result<Value, String> {
    runtime.ensure_writable(session_id).await?;
    let command = action_command(action, container)?;
    let (output, code) = docker_exec(
        runtime,
        session_id,
        &command,
        ACTION_TIMEOUT_SECS,
        true,
    )
    .await?;
    fail_if_nonzero(&output, code, &format!("docker {action} failed"))?;
    Ok(json!({ "success": true, "output": truncate_output(&output) }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_rejects_injection() {
        assert!(sanitize_container_ref("web_1").is_ok());
        assert!(sanitize_container_ref("abc.def-1").is_ok());
        assert!(sanitize_container_ref(";rm -rf /").is_err());
        assert!(sanitize_container_ref("web;id").is_err());
        assert!(sanitize_container_ref("a b").is_err());
        assert!(sanitize_container_ref("").is_err());
        assert!(sanitize_container_ref("-evil").is_err());
    }

    #[test]
    fn parse_json_lines() {
        let output = concat!(
            "{\"ID\":\"a1b2c3d4e5f6\",\"Names\":\"web\",\"Image\":\"nginx\",\"State\":\"running\",\"Status\":\"Up 2 days\"}\n",
            "not json\n",
            "{\"ID\":\"bad;id\",\"Names\":\"x\"}\n",
            "{\"ID\":\"deadbeef0123\",\"Names\":\"/db,db-alias\",\"Image\":\"postgres\",\"State\":\"exited\",\"Status\":\"Exited (0)\"}\n",
        );
        let rows = parse_ps_output(output);
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0]["name"], json!("web"));
        assert_eq!(rows[0]["running"], json!(true));
        assert_eq!(rows[1]["name"], json!("db"));
        assert_eq!(rows[1]["running"], json!(false));
    }

    #[test]
    fn commands_quote_id() {
        assert_eq!(
            logs_command("web_1").unwrap(),
            "docker logs --tail 200 -- 'web_1'"
        );
        assert_eq!(
            action_command("restart", "web_1").unwrap(),
            "docker restart -- 'web_1'"
        );
        assert_eq!(
            exec_shell_command("web_1").unwrap(),
            "docker exec -it -- 'web_1' bash || docker exec -it -- 'web_1' sh"
        );
        assert!(action_command("rm", "web_1").is_err());
        assert!(logs_command("web;id").is_err());
        assert!(exec_shell_command("web;id").is_err());
    }

    #[test]
    fn permission_probe() {
        assert!(looks_like_docker_permission(
            "Got permission denied while trying to connect to the Docker daemon socket"
        ));
        assert!(!looks_like_docker_permission("docker: command not found"));
    }
}
