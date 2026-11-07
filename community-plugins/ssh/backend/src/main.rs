mod agent_approvals;
mod agent_terminal;
mod alert_triage;
mod app_bridge;
mod audit_log;
mod connection_import;
mod docker;
mod jumpserver;
mod exec;
mod forward;
mod highlight_rules;
mod host_key;
mod keys;
mod local_downloads;
mod local_fs;
mod lzpack;
mod mcp;
mod mcp_safety;
mod metrics;
mod metrics_history;
mod model;
mod multi_exec;
mod preferences;
mod quick_commands;
mod startup_commands;
mod session_context;
mod session_recording;
mod copilot_llm;
mod sftp_bookmarks;
mod sftp_copy;
mod sftp_ext;
mod sftp_raw;
mod sftp_tree;
mod socks5;
mod ssh;
mod ssh_algorithms;
mod sudo_allowlist;
mod sudo_fs;
mod sudo_profiles;
mod transfer_compress;
mod transfer_history;
mod transfer_multistream;
mod transfer_schedule;
mod triggers;
mod vault;
mod file_watch;
mod job_object;
mod local_editors;
mod local_target;
mod local_terminal;
mod non_ssh_credentials;
mod otp;
mod otp_store;
mod progress_throttle;
mod rdp;
mod serial_session;
mod serial_xmodem;
mod sftp_name;
mod task_provider;
mod telnet_session;
mod terminal_coalesce;
mod transfer_throttle;
mod vnc_session;
mod x11;

use std::ffi::OsString;
use std::path::PathBuf;
use std::sync::Arc;

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use datawise_plugin_sdk::{
    PluginEmitter, PluginError, PluginHandler, PluginMetadata, PluginServer, PluginTransport,
    RequestContext,
};
use serde::de::DeserializeOwned;
use serde_json::{json, Value};
use tokio::runtime::Runtime;

use crate::model::{path_from_sftp_uri, SessionOpenRequest, StoredConnection, MAX_TRANSFER_SIZE};
use crate::ssh::{connection_id_param, filesystem_path, PromptDecision, SshRuntime};

struct Plugin {
    runtime: Runtime,
    ssh: Arc<SshRuntime>,
    local: Arc<local_terminal::LocalTerminalRuntime>,
    telnet: Arc<telnet_session::TelnetSessionRuntime>,
    serial: Arc<serial_session::SerialSessionRuntime>,
    vnc: Arc<vnc_session::VncSessionRuntime>,
    rdp: Arc<rdp::RdpSessionRuntime>,
    mcp: Arc<mcp::McpState>,
    watcher: Arc<file_watch::WatchRuntime>,
    connection_import: connection_import::ImportStream,
    non_ssh_creds: non_ssh_credentials::NonSshCredentials,
    tasks: Arc<task_provider::TaskProvider>,
}

impl Plugin {
    fn new() -> Result<Self, String> {
        let data_dir = plugin_data_dir();
        connection_import::remove_legacy_store(&data_dir)?;
        let runtime =
            Runtime::new().map_err(|error| format!("Failed to create async runtime: {error}"))?;
        let prefs = preferences::load_preferences(&data_dir);
        x11::set_enabled(prefs.get("x11_forwarding").and_then(Value::as_bool) == Some(true));
        let ssh = Arc::new(SshRuntime::new(data_dir));
        Ok(Self {
            runtime,
            local: Arc::new(local_terminal::LocalTerminalRuntime::new()),
            telnet: Arc::new(telnet_session::TelnetSessionRuntime::new()),
            serial: Arc::new(serial_session::SerialSessionRuntime::new()),
            vnc: Arc::new(vnc_session::VncSessionRuntime::new()),
            rdp: Arc::new(rdp::RdpSessionRuntime::new()),
            mcp: Arc::new(mcp::McpState::shared(ssh.clone())),
            watcher: Arc::new(file_watch::WatchRuntime::new()),
            ssh,
            connection_import: connection_import::ImportStream::default(),
            non_ssh_creds: non_ssh_credentials::NonSshCredentials::new(),
            tasks: Arc::new(task_provider::TaskProvider::new()),
        })
    }

    /// Resolves the effective SFTP filename encoding for a session.
    /// Today the preference is plugin-global (`sftpNameEncoding`); `session_id`
    /// is reserved for a future per-connection override.
    fn resolve_sftp_encoding_opt(
        &self,
        _session_id: Option<&str>,
    ) -> crate::sftp_name::NameEncoding {
        preferences::sftp_name_encoding(&self.ssh.data_dir())
    }

    fn session_probe(&self) -> file_watch::SessionProbe {
        let ssh = self.ssh.clone();
        Arc::new(move |session_id: String| {
            let ssh = ssh.clone();
            Box::pin(async move {
                ssh.list_sessions()
                    .await
                    .get("sessions")
                    .and_then(Value::as_array)
                    .map(|rows| {
                        rows.iter().any(|row| {
                            row.get("sessionId").and_then(Value::as_str)
                                == Some(session_id.as_str())
                        })
                    })
                    .unwrap_or(true)
            })
        })
    }

    fn handle_request(
        &self,
        method: &str,
        params: Value,
        emitter: &PluginEmitter,
    ) -> Result<Value, String> {
        match method {
            "triggers/validate" => {
                let raw = params.get("triggers");
                let format = trigger_input_format(raw);
                let secrets = params.get("secretSlots").and_then(Value::as_object);
                let parsed = triggers::parse_triggers(raw, &|key| {
                    secrets
                        .and_then(|values| values.get(key))
                        .and_then(Value::as_str)
                        .map(ToOwned::to_owned)
                })?;
                Ok(json!({
                    "valid": true,
                    "enabled": parsed.is_some(),
                    "format": format,
                    "stages": parsed.as_ref().map(|config| config.stages.len()).unwrap_or(0),
                }))
            }
            "connection/test" => {
                let connection = StoredConnection::from_lifecycle_params(&params)?;
                let operation_id = operation_id(&params);
                self.runtime.block_on(self.ssh.test_connection(
                    &connection,
                    &operation_id,
                    emitter.clone(),
                ))?;
                Ok(
                    json!({ "success": true, "message": "SSH handshake, host-key verification, and authentication succeeded" }),
                )
            }
            "connection/connect" => {
                let connection = StoredConnection::from_lifecycle_params(&params)?;
                let protocol = params
                    .get("connection")
                    .and_then(|c| c.get("external_config"))
                    .and_then(|c| c.get("protocol"))
                    .and_then(Value::as_str)
                    .unwrap_or("ssh")
                    .to_string();
                if protocol != "ssh" && protocol != "local" {
                    self.non_ssh_creds.store(
                        &connection.id,
                        &connection.username,
                        &connection.password,
                        &protocol,
                    );
                }
                self.ssh.store_connection(connection)?;
                Ok(json!({ "success": true }))
            }
            "connection/disconnect" => {
                let connection_id = params
                    .get("connection")
                    .and_then(|value| value.get("id"))
                    .and_then(Value::as_str)
                    .ok_or("Missing connection id")?;
                self.runtime
                    .block_on(self.ssh.disconnect_connection(connection_id))?;
                self.non_ssh_creds.drop_connection(connection_id);
                Ok(json!({ "success": true }))
            }
            "ssh/session/open" => {
                let operation_id = operation_id(&params);
                let request: SessionOpenRequest = parse(params)?;
                self.runtime
                    .block_on(self.ssh.open_session(request, &operation_id, emitter.clone()))
            }
            "ssh/session/attach" => {
                let connection_id = required_string(&params, "connectionId")?;
                let workbench_id = required_string(&params, "workbenchId")?;
                let after_sequence = params
                    .get("afterSequence")
                    .and_then(Value::as_u64)
                    .unwrap_or(0);
                self.runtime.block_on(self.ssh.attach_session(
                    connection_id,
                    workbench_id,
                    after_sequence,
                    emitter,
                ))
            }
            "ssh/session/close" => {
                let session_id = required_string(&params, "sessionId")?;
                self.runtime.block_on(self.ssh.close_session(session_id))?;
                Ok(json!({ "success": true }))
            }
            "ssh/forward/list" => Ok(self.ssh.forward_list(&params)),
            "ssh/forward/interfaces" => Ok(forward::local_interface_rows()),
            "ssh/forward/start" => self
                .runtime
                .block_on(self.ssh.forward_start(&params, emitter.clone())),
            "ssh/forward/stop" => {
                let id = required_string(&params, "id")?;
                self.runtime.block_on(self.ssh.forward_stop(id))
            }
            "ssh/exec" => {
                let session_id = required_string(&params, "sessionId")?;
                let command = required_string(&params, "command")?;
                let sudo = params.get("sudo").and_then(Value::as_bool).unwrap_or(false);
                let timeout_secs = params.get("timeoutSecs").and_then(Value::as_u64);
                let exec_id = params.get("execId").and_then(Value::as_str);
                if sudo {
                    // Connection-level sudoers-style allowlist (mirrors the
                    // MCP gate); structured sudo_fs ops stay exempt.
                    self.runtime
                        .block_on(self.ssh.ensure_sudo_allowed(session_id, command))?;
                }
                self.runtime.block_on(self.ssh.exec(
                    session_id,
                    exec_id,
                    command,
                    sudo,
                    timeout_secs,
                ))
            }
            "ssh/exec/cancel" => {
                let exec_id = required_string(&params, "execId")?;
                self.ssh.cancel_exec(exec_id)?;
                Ok(json!({ "success": true }))
            }
            "ssh/docker/list" => {
                let session_id = required_string(&params, "sessionId")?;
                self.runtime
                    .block_on(docker::list_containers(&self.ssh, session_id))
            }
            "jumpserver/assets/list" => {
                let session_id = required_string(&params, "sessionId")?;
                let search = params.get("search").and_then(Value::as_str);
                self.runtime
                    .block_on(jumpserver::list_assets(&self.ssh, session_id, search))
            }
            "jumpserver/assets/enter" => {
                let session_id = required_string(&params, "sessionId")?;
                let address = required_string(&params, "address")?;
                let menu_id = params.get("menuId").and_then(Value::as_str);
                self.runtime.block_on(jumpserver::enter_asset(
                    &self.ssh,
                    session_id,
                    address,
                    menu_id,
                ))
            }
            "jumpserver/assets/favorite" => {
                let session_id = required_string(&params, "sessionId")?;
                let asset_id = params
                    .get("assetId")
                    .and_then(Value::as_str)
                    .unwrap_or("");
                let address = params
                    .get("address")
                    .and_then(Value::as_str)
                    .unwrap_or("");
                let name = params.get("name").and_then(Value::as_str).unwrap_or("");
                let favorite = params
                    .get("favorite")
                    .and_then(Value::as_bool)
                    .ok_or("Missing favorite bool")?;
                self.runtime.block_on(jumpserver::set_favorite(
                    &self.ssh,
                    session_id,
                    asset_id,
                    address,
                    name,
                    favorite,
                ))
            }
            "ssh/docker/logs" => {
                let session_id = required_string(&params, "sessionId")?;
                let container = required_string(&params, "container")?;
                self.runtime.block_on(docker::container_logs(
                    &self.ssh,
                    session_id,
                    container,
                ))
            }
            "ssh/docker/action" => {
                let session_id = required_string(&params, "sessionId")?;
                let action = required_string(&params, "action")?;
                let container = required_string(&params, "container")?;
                self.runtime.block_on(docker::container_action(
                    &self.ssh,
                    session_id,
                    action,
                    container,
                ))
            }
            "ssh/otp/current" => {
                let session_id = required_string(&params, "sessionId")?;
                self.runtime.block_on(self.ssh.otp_current(session_id))
            }
            "ssh/history/remote" => {
                let session_id = required_string(&params, "sessionId")?;
                self.runtime
                    .block_on(self.ssh.remote_shell_history(session_id))
            }
            "ssh/commands/complete" => {
                let session_id = required_string(&params, "sessionId")?;
                self.runtime
                    .block_on(self.ssh.command_completions(session_id))
            }
            "ssh/files/complete" => {
                let session_id = required_string(&params, "sessionId")?;
                let prefix = required_string(&params, "prefix")?;
                self.runtime
                    .block_on(self.ssh.file_completions(session_id, prefix))
            }
            "ssh/terminal/resize" => {
                let session_id = required_string(&params, "sessionId")?;
                let cols = required_u32(&params, "cols")?;
                let rows = required_u32(&params, "rows")?;
                self.runtime
                    .block_on(self.ssh.resize_terminal(session_id, cols, rows))?;
                Ok(json!({ "success": true }))
            }
            "ssh/terminal/batchInput" => {
                let session_ids = params
                    .get("sessionIds")
                    .and_then(Value::as_array)
                    .map(|list| {
                        list.iter()
                            .filter_map(Value::as_str)
                            .filter(|value| !value.is_empty())
                            .map(str::to_string)
                            .collect::<Vec<_>>()
                    })
                    .filter(|list| !list.is_empty())
                    .ok_or("Missing sessionIds")?;
                let command = required_string(&params, "command")?;
                let append_newline = params
                    .get("appendNewline")
                    .and_then(Value::as_bool)
                    .unwrap_or(true);
                Ok(self.runtime.block_on(self.ssh.batch_terminal_input(
                    &session_ids,
                    command,
                    append_newline,
                )))
            }
            "ssh/terminal/directoryTracking" => {
                let session_id = required_string(&params, "sessionId")?;
                let enabled = params
                    .get("enabled")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                self.runtime
                    .block_on(self.ssh.set_directory_tracking(session_id, enabled))?;
                Ok(json!({ "success": true }))
            }
            "ssh/terminal/replay" => {
                let session_id = required_string(&params, "sessionId")?;
                let after_sequence = params
                    .get("afterSequence")
                    .and_then(Value::as_u64)
                    .unwrap_or(0);
                let replay = self.runtime.block_on(self.ssh.replay_terminal(
                    session_id,
                    after_sequence,
                    emitter,
                ))?;
                Ok(replay)
            }
            "workbench/close" => {
                let workbench_id = required_string(&params, "workbenchId")?;
                self.runtime
                    .block_on(self.ssh.close_workbench(workbench_id))
            }
            "ssh/host-key/resolve" | "connection/challenge/resolve" => {
                let challenge_id = required_string(&params, "challengeId")?;
                let operation_id = required_string(&params, "operationId")?;
                let accept = params
                    .get("accept")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                let remember = params
                    .get("remember")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                self.runtime.block_on(self.ssh.prompts.resolve(
                    challenge_id,
                    operation_id,
                    PromptDecision { accept, remember },
                ))?;
                Ok(json!({ "success": true }))
            }
            "sftp/home" => {
                let session_id = required_string(&params, "sessionId")?;
                let path = self.runtime.block_on(self.ssh.sftp_home(session_id))?;
                Ok(json!({ "path": path }))
            }
            "sftp/list" => {
                let session_id = required_string(&params, "sessionId")?;
                let path = required_string(&params, "path")?;
                let include_owner = params
                    .get("includeOwner")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                let encoding = self.resolve_sftp_encoding_opt(Some(session_id));
                let entries = self.runtime.block_on(self.ssh.sftp_list_path(
                    session_id,
                    path,
                    include_owner,
                    encoding,
                ))?;
                Ok(json!({ "entries": entries }))
            }
            "sftp/read" => {
                let session_id = required_string(&params, "sessionId")?;
                let path = required_string(&params, "path")?;
                let offset = optional_u64(&params, "offset", 0);
                let max_bytes = bounded_bytes(&params, "maxBytes", 256 * 1024);
                let (data, truncated) = self
                    .runtime
                    .block_on(self.ssh.sftp_read_path(session_id, path, offset, max_bytes))?;
                Ok(json!({ "dataBase64": BASE64_STANDARD.encode(data), "truncated": truncated }))
            }
            "sftp/createDirectory" => {
                let session_id = required_string(&params, "sessionId")?;
                let path = required_string(&params, "path")?;
                self.runtime
                    .block_on(self.ssh.sftp_create_directory(session_id, path))?;
                Ok(json!({ "success": true }))
            }
            "sftp/rename" => {
                let session_id = required_string(&params, "sessionId")?;
                let source = required_string(&params, "sourcePath")?;
                let target = required_string(&params, "targetPath")?;
                self.runtime
                    .block_on(self.ssh.sftp_rename(session_id, source, target))?;
                Ok(json!({ "success": true }))
            }
            "sftp/chmod" => {
                let session_id = required_string(&params, "sessionId")?;
                let path = required_string(&params, "path")?;
                let mode = params
                    .get("mode")
                    .and_then(|value| {
                        value
                            .as_str()
                            .and_then(|text| u32::from_str_radix(text, 8).ok())
                            .or_else(|| value.as_u64().and_then(|v| u32::try_from(v).ok()))
                    })
                    .filter(|value| *value <= 0o7777)
                    .ok_or("Mode must be an octal value up to 7777")?;
                self.runtime
                    .block_on(self.ssh.sftp_chmod(session_id, path, mode))?;
                Ok(json!({ "success": true }))
            }
            "sftp/diskUsage" => {
                let session_id = required_string(&params, "sessionId")?;
                let path = required_string(&params, "path")?;
                self.runtime
                    .block_on(self.ssh.sftp_disk_usage(session_id, path))
            }
            "sftp/stat" => {
                let session_id = required_string(&params, "sessionId")?;
                let path = required_string(&params, "path")?;
                self.runtime
                    .block_on(sftp_ext::stat(&self.ssh, session_id, path))
            }
            "sftp/exists" => {
                let session_id = required_string(&params, "sessionId")?;
                let path = required_string(&params, "path")?;
                let exists = self
                    .runtime
                    .block_on(sftp_ext::exists(&self.ssh, session_id, path))?;
                Ok(json!({ "exists": exists }))
            }
            "sftp/touch" => {
                let session_id = required_string(&params, "sessionId")?;
                let path = required_string(&params, "path")?;
                self.runtime
                    .block_on(sftp_ext::touch(&self.ssh, session_id, path))?;
                Ok(json!({ "success": true }))
            }
            "sftp/write" => {
                let session_id = required_string(&params, "sessionId")?;
                let remote_path = required_string(&params, "remotePath")?;
                let data_base64 = required_string(&params, "dataBase64")?;
                self.runtime.block_on(sftp_ext::write_file(
                    &self.ssh,
                    session_id,
                    remote_path,
                    data_base64,
                ))?;
                Ok(json!({ "success": true }))
            }
            "sftp/archive" => {
                let session_id = required_string(&params, "sessionId")?;
                let source_paths = params
                    .get("sourcePaths")
                    .and_then(Value::as_array)
                    .ok_or("Missing sourcePaths")?
                    .iter()
                    .map(|value| {
                        value
                            .as_str()
                            .map(str::to_string)
                            .ok_or_else(|| "sourcePaths must be strings".to_string())
                    })
                    .collect::<Result<Vec<String>, String>>()?;
                let archive_path = required_string(&params, "archivePath")?;
                self.runtime.block_on(sftp_ext::archive(
                    &self.ssh,
                    session_id,
                    &source_paths,
                    archive_path,
                ))
            }
            "sftp/extract" => {
                let session_id = required_string(&params, "sessionId")?;
                let archive_path = required_string(&params, "archivePath")?;
                let destination_path = required_string(&params, "destinationPath")?;
                let overwrite = params
                    .get("overwrite")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                self.runtime.block_on(sftp_ext::extract(
                    &self.ssh,
                    session_id,
                    archive_path,
                    destination_path,
                    overwrite,
                ))?;
                Ok(json!({ "success": true }))
            }
            "sftp/copy" => {
                let session_id = self.filesystem_session(&params)?;
                self.runtime.block_on(sftp_copy::run(
                    &self.ssh,
                    &session_id,
                    sftp_copy::CopyOp::Copy,
                    &params,
                ))
            }
            "sftp/move" => {
                let session_id = self.filesystem_session(&params)?;
                self.runtime.block_on(sftp_copy::run(
                    &self.ssh,
                    &session_id,
                    sftp_copy::CopyOp::Move,
                    &params,
                ))
            }
            "ssh/metrics" => {
                let session_id = required_string(&params, "sessionId")?;
                let cached = params
                    .get("cached")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                self.runtime.block_on(self.ssh.metrics(session_id, cached))
            }
            "ssh/metrics/history" => {
                let session_id = required_string(&params, "sessionId")?;
                let limit = params
                    .get("limit")
                    .and_then(Value::as_u64)
                    .unwrap_or(720)
                    .clamp(1, metrics_history::MAX_SAMPLES as u64)
                    as usize;
                self.runtime
                    .block_on(self.ssh.metrics_history(session_id, limit))
            }
            "ssh/processes/list" => {
                let session_id = required_string(&params, "sessionId")?;
                self.runtime.block_on(self.ssh.processes_list(session_id))
            }
            "ssh/processes/kill" => {
                let session_id = required_string(&params, "sessionId")?;
                let pid = params
                    .get("pid")
                    .and_then(Value::as_u64)
                    .ok_or("Missing pid")?;
                let signal = params
                    .get("signal")
                    .and_then(Value::as_u64)
                    .and_then(|value| u32::try_from(value).ok())
                    .unwrap_or(15);
                self.runtime
                    .block_on(self.ssh.kill_process(session_id, pid, signal))
            }
            "ssh/recording/start" => {
                let session_id = required_string(&params, "sessionId")?;
                self.runtime.block_on(self.ssh.recording_start(session_id))
            }
            "ssh/recording/stop" => {
                let session_id = required_string(&params, "sessionId")?;
                self.runtime.block_on(self.ssh.recording_stop(session_id))
            }
            // Local shell recording: same cast directory as ssh/recording/*
            // (list/get/delete/clear/reveal stay on the ssh/ family).
            "local/recording/start" => {
                let session_id = required_string(&params, "sessionId")?;
                let data_dir = self.ssh.data_dir();
                self.runtime
                    .block_on(self.local.recording_start(session_id, &data_dir))
            }
            "local/recording/stop" => {
                let session_id = required_string(&params, "sessionId")?;
                self.runtime.block_on(self.local.recording_stop(session_id))
            }
            "ssh/recording/list" => Ok(json!({
                "recordings": session_recording::list_recordings(&self.ssh.data_dir())
            })),
            "ssh/recording/get" => {
                let recording_id = required_string(&params, "recordingId")?;
                let offset = optional_u64(&params, "offset", 0) as usize;
                let limit = params
                    .get("limit")
                    .and_then(Value::as_u64)
                    .unwrap_or(session_recording::PAGE_LIMIT as u64)
                    .clamp(1, session_recording::PAGE_LIMIT as u64)
                    as usize;
                session_recording::read_events(&self.ssh.data_dir(), recording_id, offset, limit)
            }
            "ssh/recording/delete" => {
                let recording_id = required_string(&params, "recordingId")?;
                let path = session_recording::cast_path(&self.ssh.data_dir(), recording_id)?;
                std::fs::remove_file(&path)
                    .map_err(|error| format!("Failed to delete recording: {error}"))?;
                Ok(json!({ "success": true }))
            }
            // 一键清空：只删 recordings 目录里的 .cast 文件，返回删除数量。
            "ssh/recording/clear" => {
                let deleted = session_recording::clear_recordings(&self.ssh.data_dir());
                Ok(json!({ "success": true, "deleted": deleted }))
            }
            // 在文件管理器中定位录制文件：按 recordingId 解析路径（校验过
            // 遍历），不暴露任意路径打开原语。
            "ssh/recording/reveal" => {
                let recording_id = required_string(&params, "recordingId")?;
                let path = session_recording::cast_path(&self.ssh.data_dir(), recording_id)?;
                if !path.exists() {
                    return Err("Recording file no longer exists".to_string());
                }
                local_downloads::reveal_in_file_manager(&path)?;
                Ok(json!({ "success": true }))
            }
            "mcp/tools" => Ok(mcp::tool_definitions()),
            "mcp/call" => self
                .runtime
                .block_on(self.mcp.call_datawise(&params, emitter.clone())),
            "mcp/settings/get" => Ok(self.mcp.settings_get()),
            "mcp/settings/set" => self.mcp.settings_set(&params),
            "ssh/agent/resolve" => {
                let challenge_id = required_string(&params, "challengeId")?;
                let decision = required_string(&params, "decision")?;
                let command = params.get("command").and_then(Value::as_str);
                let remember = params
                    .get("remember")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                self.ssh
                    .resolve_agent_challenge(challenge_id, decision, command, remember)?;
                Ok(json!({ "success": true }))
            }
            "ssh/alert/triage" => {
                let payload = required_string(&params, "payload")?;
                Ok(alert_triage::triage_view(&alert_triage::triage(payload)))
            }
            "ssh/session/context/publish" => {
                let session_id = required_string(&params, "sessionId")?;
                self.runtime
                    .block_on(self.ssh.session_context_publish(session_id, &params))
            }
            "ssh/session/context/get" => {
                let session_id = required_string(&params, "sessionId")?;
                self.runtime
                    .block_on(self.ssh.session_context_get(session_id))
            }
            "ssh/copilot/llm/status" => Ok(copilot_llm::status_view(&self.ssh.data_dir())),
            "ssh/copilot/llm/save" => copilot_llm::save(&self.ssh.data_dir(), &params),
            "ssh/copilot/llm/test" => self
                .runtime
                .block_on(copilot_llm::test_connection(&self.ssh.data_dir(), &params)),
            "ssh/copilot/chat" => {
                let system = params
                    .get("system")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string();
                let prompt = required_string(&params, "prompt")?;
                let stream = params
                    .get("stream")
                    .and_then(Value::as_bool)
                    .unwrap_or(true);
                let request_id = params
                    .get("requestId")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string();
                let profile_id = params
                    .get("profileId")
                    .and_then(Value::as_str)
                    .map(str::to_string);
                let data_dir = self.ssh.data_dir();
                let text = if stream {
                    let emitter = emitter.clone();
                    let request_id_for_emit = request_id.clone();
                    self.runtime.block_on(copilot_llm::chat_stream(
                        &data_dir,
                        &system,
                        &prompt,
                        &request_id,
                        profile_id.as_deref(),
                        move |chunk| {
                            let mut payload = json!({
                                "requestId": request_id_for_emit,
                            });
                            if let Some(delta) = chunk.content {
                                payload["delta"] = json!(delta);
                            }
                            if let Some(thinking) = chunk.thinking {
                                payload["thinkingDelta"] = json!(thinking);
                            }
                            let _ = emitter.event("ssh/copilot/chat/delta", payload);
                        },
                    ))?
                } else {
                    self.runtime.block_on(copilot_llm::chat(
                        &data_dir,
                        &system,
                        &prompt,
                        profile_id.as_deref(),
                    ))?
                };
                Ok(json!({ "content": text, "source": "plugin", "requestId": request_id }))
            }
            "ssh/copilot/chat/cancel" => {
                let request_id = required_string(&params, "requestId")?;
                let cancelled = copilot_llm::cancel_stream(request_id);
                Ok(json!({ "ok": true, "cancelled": cancelled }))
            }
            "ssh/copilot/confirm" => {
                // Raise the shared agent/MCP approval UI (no parallel dock dialog).
                // Remembered non-destructive commands skip the prompt (same store
                // as agent Allow-always); destructive never skips (D2).
                let tool = required_string(&params, "tool")?;
                let command = params
                    .get("command")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string();
                let connection_id = params
                    .get("connectionId")
                    .and_then(Value::as_str)
                    .map(str::to_string);
                let challenge = if command.trim().is_empty() {
                    tool.to_string()
                } else {
                    command.clone()
                };
                let destructive = if command.trim().is_empty() {
                    None
                } else {
                    match mcp_safety::assess_command(&command) {
                        mcp_safety::CommandRisk::Destructive(reason) => Some(reason),
                        _ => None,
                    }
                };
                if destructive.is_none() {
                    if let Some(cid) = connection_id.as_deref().filter(|id| !id.is_empty()) {
                        if !command.trim().is_empty() {
                            let store = agent_approvals::load_store(&self.ssh.data_dir());
                            if agent_approvals::matches(&store, cid, &command) {
                                return Ok(json!({
                                    "approved": true,
                                    "command": command,
                                    "remembered": true,
                                }));
                            }
                        }
                    }
                }
                if let Some(reason) = destructive {
                    let labeled = format!("[destructive: {reason}]\n{command}");
                    let approved = self.runtime.block_on(self.ssh.request_mcp_confirm(
                        tool,
                        &labeled,
                        connection_id.as_deref(),
                        &emitter,
                    ))?;
                    return Ok(json!({ "approved": true, "command": approved }));
                }
                let approved = self.runtime.block_on(self.ssh.request_mcp_confirm(
                    tool,
                    &challenge,
                    connection_id.as_deref(),
                    &emitter,
                ))?;
                Ok(json!({ "approved": true, "command": approved }))
            }
            "ssh/audit/list" => {
                let limit = params
                    .get("limit")
                    .and_then(Value::as_u64)
                    .unwrap_or(100)
                    .clamp(1, 500) as usize;
                let before_ts = params.get("beforeTs").and_then(Value::as_u64);
                // Fetch one extra entry to report truncation without a
                // second full read.
                let mut entries = audit_log::tail(&self.ssh.data_dir(), limit + 1, before_ts)?;
                let truncated = entries.len() > limit;
                entries.truncate(limit);
                let items: Vec<Value> = entries
                    .iter()
                    .map(|entry| serde_json::to_value(entry).unwrap_or(Value::Null))
                    .collect();
                Ok(json!({ "entries": items, "truncated": truncated }))
            }
            "ssh/audit/clear" => {
                audit_log::clear(&self.ssh.data_dir())?;
                Ok(json!({ "success": true }))
            }
            "ssh/agent/mode/get" => {
                let connection_id = required_string(&params, "connectionId")?;
                self.runtime
                    .block_on(self.ssh.agent_mode_get(connection_id))
            }
            "ssh/settings/get" => {
                let session_id = required_string(&params, "sessionId")?;
                self.runtime
                    .block_on(self.ssh.settings_get(session_id, &params))
            }
            "ssh/settings/set" => {
                let session_id = required_string(&params, "sessionId")?;
                self.runtime
                    .block_on(self.ssh.settings_set(session_id, &params))
            }
            "sudo/stat" => {
                let session_id = required_string(&params, "sessionId")?;
                let path = required_string(&params, "path")?;
                self.runtime
                    .block_on(sudo_fs::stat(&self.ssh, session_id, path))
            }
            "sudo/exists" => {
                let session_id = required_string(&params, "sessionId")?;
                let path = required_string(&params, "path")?;
                let exists = self
                    .runtime
                    .block_on(sudo_fs::exists(&self.ssh, session_id, path))?;
                Ok(json!({ "exists": exists }))
            }
            "sudo/touch" => {
                let session_id = required_string(&params, "sessionId")?;
                let path = required_string(&params, "path")?;
                self.runtime
                    .block_on(sudo_fs::touch(&self.ssh, session_id, path))?;
                Ok(json!({ "success": true }))
            }
            "sudo/listDir" => {
                let session_id = required_string(&params, "sessionId")?;
                let path = required_string(&params, "path")?;
                self.runtime
                    .block_on(sudo_fs::list_dir(&self.ssh, session_id, path))
            }
            "sudo/readFile" => {
                let session_id = required_string(&params, "sessionId")?;
                let path = required_string(&params, "path")?;
                let offset = optional_u64(&params, "offset", 0);
                let length = optional_u64(&params, "length", 0);
                self.runtime.block_on(sudo_fs::read_file(
                    &self.ssh, session_id, path, offset, length,
                ))
            }
            "sudo/writeFile" => {
                let session_id = required_string(&params, "sessionId")?;
                let path = required_string(&params, "path")?;
                let data_base64 = required_string(&params, "dataBase64")?;
                self.runtime.block_on(sudo_fs::write_file(
                    &self.ssh,
                    session_id,
                    path,
                    data_base64,
                ))?;
                Ok(json!({ "success": true }))
            }
            "sudo/mkdir" => {
                let session_id = required_string(&params, "sessionId")?;
                let path = required_string(&params, "path")?;
                self.runtime
                    .block_on(sudo_fs::mkdir(&self.ssh, session_id, path))?;
                Ok(json!({ "success": true }))
            }
            "sudo/remove" => {
                let session_id = required_string(&params, "sessionId")?;
                let path = required_string(&params, "path")?;
                self.runtime
                    .block_on(sudo_fs::remove(&self.ssh, session_id, path))?;
                Ok(json!({ "success": true }))
            }
            "sudo/removeAll" => {
                let session_id = required_string(&params, "sessionId")?;
                let path = required_string(&params, "path")?;
                self.runtime
                    .block_on(sudo_fs::remove_all(&self.ssh, session_id, path))?;
                Ok(json!({ "success": true }))
            }
            "sudo/chmod" => {
                let session_id = required_string(&params, "sessionId")?;
                let path = required_string(&params, "path")?;
                let mode = required_string(&params, "mode")?;
                self.runtime
                    .block_on(sudo_fs::chmod(&self.ssh, session_id, path, mode))?;
                Ok(json!({ "success": true }))
            }
            "sudo/rename" => {
                let session_id = required_string(&params, "sessionId")?;
                let source = required_string(&params, "sourcePath")?;
                let target = required_string(&params, "targetPath")?;
                self.runtime
                    .block_on(sudo_fs::rename(&self.ssh, session_id, source, target))?;
                Ok(json!({ "success": true }))
            }
            "sudo/profiles/list" => Ok(self.ssh.profiles_list()),
            "sudo/profiles/options" => Ok(self.ssh.profiles_options()),
            "sudo/profiles/reveal" => {
                let id = required_string(&params, "id")?;
                self.ssh.profiles_reveal(id)
            }
            "sudo/profiles/save" => self.runtime.block_on(self.ssh.profiles_save(&params)),
            "sudo/profiles/delete" => {
                let id = required_string(&params, "id")?;
                self.runtime.block_on(self.ssh.profiles_delete(id))
            }
            "ssh/quickCommands/list" => Ok(self.ssh.quick_commands_list()),
            "ssh/quickCommands/save" => self.ssh.quick_commands_save(&params),
            "ssh/quickCommands/delete" => {
                let id = required_string(&params, "id")?;
                self.ssh.quick_commands_delete(id)
            }
            "ssh/quickCommands/deleteByConnection" => {
                let connection_id = required_string(&params, "connectionId")?;
                self.ssh.quick_commands_delete_by_connection(connection_id)
            }
            "ssh/highlightRules/list" => Ok(self.ssh.highlight_rules_list()),
            "ssh/highlightRules/save" => self.ssh.highlight_rules_save(&params),
            "ssh/highlightRules/delete" => {
                let id = required_string(&params, "id")?;
                self.ssh.highlight_rules_delete(id)
            }
            "ssh/batchBar/state" => {
                // 批量发送命令条的跨工作台状态同步：把调用方（source 标识的
                // webview）的草稿/下拉选择/开关原样广播给所有插件 webview，
                // 各端按 source 过滤掉自己的回声。纯转发，sidecar 不落存储。
                emitter
                    .event("ssh/batchBar/state", params)
                    .map_err(|error| error.message)?;
                Ok(json!({ "broadcast": true }))
            }
            "connection/action" => {
                let action = connection_action_id(&params)?;
                match action {
                    "quick-sudo-profiles" => {
                        let connection_id = params.get("id").and_then(Value::as_str);
                        Ok(self.ssh.profiles_action_summary(connection_id))
                    }
                    // 「从文件导入私钥」：桌面端弹系统文件选择框，读取校验后
                    // 回填表单 private_key 字段；取消安静返回；web/docker
                    // sidecar 不在本机，指引粘贴内容。
                    "import-private-key" => {
                        if !local_downloads::can_save_local(|key| std::env::var_os(key)) {
                            return Err(
                                "File import is only available on desktop — paste the key content instead"
                                    .to_string(),
                            );
                        }
                        match local_fs::pick_file()? {
                            None => Ok(json!({ "message": "", "fieldValues": null })),
                            Some(path) => {
                                let content =
                                    keys::read_private_key_file(std::path::Path::new(&path))?;
                                Ok(json!({
                                    "message": format!("Imported private key from {path}"),
                                    "fieldValues": { "private_key": content },
                                }))
                            }
                        }
                    }
                    // Connection-form “Import sessions”: pick one third-party
                    // export, parse with the same pipeline as the workbench
                    // Import wizard, and fill the first session into the form
                    // (secrets never filled). Remaining sessions need the
                    // wizard’s Create connections / sanitized export path.
                    "import-sessions" => {
                        if !local_downloads::can_save_local(|key| std::env::var_os(key)) {
                            return Err(
                                "Session import from file is only available on desktop — use the workbench Import wizard instead"
                                    .to_string(),
                            );
                        }
                        match local_fs::pick_file()? {
                            None => Ok(json!({ "message": "", "fieldValues": null })),
                            Some(path) => {
                                let (kind, bytes) =
                                    connection_import::read_session_file(std::path::Path::new(
                                        &path,
                                    ))?;
                                let sessions =
                                    connection_import::parse_uploaded(kind, &bytes, None, None)?;
                                if sessions.is_empty() {
                                    return Ok(json!({
                                        "message": "No sessions found in the selected file",
                                        "fieldValues": null,
                                    }));
                                }
                                let values =
                                    connection_import::session_field_values(&sessions[0]);
                                let message = if sessions.len() > 1 {
                                    format!(
                                        "Filled the first of {} sessions from {path}. Use the workbench Import wizard to create the rest.",
                                        sessions.len()
                                    )
                                } else {
                                    format!("Imported session from {path}")
                                };
                                Ok(json!({ "message": message, "fieldValues": values }))
                            }
                        }
                    }
                    other => Err(format!("Unknown connection action: {other}")),
                }
            }
            "keys/discover" => {
                let keys = keys::discover()?;
                Ok(json!({ "keys": keys }))
            }
            // 连接表单 private_key_path 的 options_action 数据源：宿主拉取后
            // 渲染动态下拉；无该扩展能力的宿主保持文本框（见 sudo_profile 先例）。
            "keys/discover/options" => keys::discover_options(),
            "ssh/knownHosts/list" => Ok(keys::list_known_hosts(&plugin_data_dir())?),
            "ssh/knownHosts/remove" => {
                let host = required_string(&params, "host")?;
                let port = params
                    .get("port")
                    .and_then(Value::as_u64)
                    .and_then(|value| u16::try_from(value).ok())
                    .filter(|value| *value > 0)
                    .unwrap_or(22);
                let removed = keys::remove_known_host(&plugin_data_dir(), host, port)?;
                Ok(json!({ "success": true, "removed": removed }))
            }
            "sftp/delete" => {
                let session_id = required_string(&params, "sessionId")?;
                let path = required_string(&params, "path")?;
                let recursive = params
                    .get("recursive")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                self.runtime
                    .block_on(self.ssh.sftp_delete(session_id, path, recursive))?;
                Ok(json!({ "success": true }))
            }
            "sftp/upload/start" => {
                let session_id = required_string(&params, "sessionId")?.to_string();
                let remote_path = required_string(&params, "remotePath")?.to_string();
                let size = params
                    .get("size")
                    .and_then(Value::as_u64)
                    .ok_or("Missing upload size")?;
                let resume_task_id = params
                    .get("resumeTaskId")
                    .and_then(Value::as_str)
                    .filter(|value| !value.is_empty())
                    .map(str::to_string);
                let lzpack_explicit = params
                    .get("mode")
                    .and_then(Value::as_str)
                    .map(|mode| mode.eq_ignore_ascii_case("lzpack"))
                    .unwrap_or(false);
                self.runtime.block_on(self.ssh.start_upload(
                    session_id,
                    remote_path,
                    size,
                    resume_task_id,
                    false,
                    lzpack_explicit,
                    emitter,
                ))
            }
            "sudo/upload/start" => {
                let session_id = required_string(&params, "sessionId")?.to_string();
                let remote_path = required_string(&params, "remotePath")?.to_string();
                let size = params
                    .get("size")
                    .and_then(Value::as_u64)
                    .ok_or("Missing upload size")?;
                let resume_task_id = params
                    .get("resumeTaskId")
                    .and_then(Value::as_str)
                    .filter(|value| !value.is_empty())
                    .map(str::to_string);
                self.runtime.block_on(self.ssh.start_upload(
                    session_id,
                    remote_path,
                    size,
                    resume_task_id,
                    true,
                    false,
                    emitter,
                ))
            }
            "sftp/upload/finish" | "sudo/upload/finish" => {
                let task_id = required_string(&params, "taskId")?;
                self.runtime
                    .block_on(self.ssh.finish_upload(task_id, emitter))
            }
            "sftp/download/start" => {
                let session_id = required_string(&params, "sessionId")?;
                let remote_path = required_string(&params, "remotePath")?;
                let offset = optional_u64(&params, "offset", 0);
                let save_to_local = params
                    .get("saveToLocal")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                let download_dir = params
                    .get("downloadDir")
                    .and_then(Value::as_str)
                    .map(str::to_string);
                let conflict = params.get("conflict").and_then(Value::as_str);
                let expand_lzpack = params
                    .get("expandLzpack")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                self.runtime.block_on(self.ssh.start_download(
                    session_id,
                    remote_path,
                    offset,
                    save_to_local,
                    download_dir.as_deref(),
                    conflict,
                    expand_lzpack,
                    emitter,
                ))
            }
            // 递归目录下载：远端 read_dir 走树（不碰 shell、不产生远端临时
            // 包），逐文件复用下方分块下载管线，本地按相对路径镜像；分块与
            // finish/cancel 与单文件下载共用（任务在同一个注册表里）。
            "sftp/download/tree/start" => {
                let session_id = required_string(&params, "sessionId")?;
                let remote_path = required_string(&params, "remotePath")?;
                let download_dir = params
                    .get("downloadDir")
                    .and_then(Value::as_str)
                    .map(str::to_string);
                self.runtime.block_on(self.ssh.start_tree_download(
                    session_id,
                    remote_path,
                    download_dir.as_deref(),
                    emitter,
                ))
            }
            "sftp/download/next" => {
                let task_id = required_string(&params, "taskId")?;
                let offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
                self.runtime
                    .block_on(self.ssh.download_chunk(task_id, offset as u64, emitter))
            }
            "sftp/download/finish" => self.runtime.block_on(
                self.ssh
                    .complete_download(required_string(&params, "taskId")?, emitter),
            ),
            "sftp/transfer/cancel" => {
                // Optional reason slug from the workbench ("user",
                // "ack-timeout", ...) surfaces in the ledger so a cancel can
                // be told apart from a server failure on the next bug report.
                let reason = params
                    .get("reason")
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(|value| value.chars().take(120).collect::<String>());
                self.runtime.block_on(self.ssh.cancel_transfer(
                    required_string(&params, "taskId")?,
                    reason.as_deref(),
                    emitter,
                ))?;
                Ok(json!({ "success": true }))
            }
            // 本机落盘能力探测：无宿主 fileTransfer API 时前端据此决定
            // 走 sidecar 下载目录落盘还是浏览器 <a download> 兜底。
            "otp/list" => {
                let store = otp_store::load_store(&plugin_data_dir());
                Ok(json!({
            "entries": otp_store::list_views(&store),
            "bindings": otp_store::binding_views(&store),
                }))
            }

            "otp/save" => {
                let data_dir = plugin_data_dir();
                let vault = otp_store::vault_for(&data_dir);
                let mut store = otp_store::load_store(&data_dir);
                let (entry, created) = otp_store::save_entry(&mut store, &params, &vault)?;
                otp_store::save_store(&data_dir, &store)?;
                Ok(json!({ "entry": otp_store::entry_view(&entry), "created": created }))
            }

            "otp/delete" => {
                let data_dir = plugin_data_dir();
                let mut store = otp_store::load_store(&data_dir);
                let id = params.get("id").and_then(Value::as_str).unwrap_or_default();
                let deleted = otp_store::delete_entry(&mut store, id);
                if deleted {
                    otp_store::save_store(&data_dir, &store)?;
                }
                Ok(json!({ "deleted": deleted }))
            }

            "otp/bind" => {
                let data_dir = plugin_data_dir();
                let mut store = otp_store::load_store(&data_dir);
                let connection_id = params
                    .get("connectionId")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                let entry_id = params
                    .get("entryId")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                otp_store::bind(&mut store, connection_id, entry_id)?;
                otp_store::save_store(&data_dir, &store)?;
                Ok(json!({ "bound": true }))
            }

            "otp/unbind" => {
                let data_dir = plugin_data_dir();
                let mut store = otp_store::load_store(&data_dir);
                let connection_id = params
                    .get("connectionId")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                let removed = otp_store::unbind(&mut store, connection_id);
                if removed {
                    otp_store::save_store(&data_dir, &store)?;
                }
                Ok(json!({ "removed": removed }))
            }

            "otp/generate" => {
                let data_dir = plugin_data_dir();
                let store = otp_store::load_store(&data_dir);
                let id = params
                    .get("entryId")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                let entry = store
                    .entries
                    .iter()
                    .find(|entry| entry.id == id)
                    .ok_or_else(|| "otp entry not found".to_string())?
                    .clone();
                let vault = otp_store::vault_for(&data_dir);
                let secret = otp_store::get_decrypted_secret(&vault, &entry)
                    .ok_or_else(|| "otp secret unavailable".to_string())?;
                if entry.otp_type == "hotp" {
                    let counter = entry.counter.unwrap_or(0);
                    let code = otp::hotp(entry.algorithm, &secret, counter, entry.digits);
                    let mut store = store;
                    if let Some(entry) = store.entries.iter_mut().find(|e| e.id == id) {
                        entry.counter = Some(counter + 1);
                    }
                    otp_store::save_store(&data_dir, &store)?;
                    Ok(
                        json!({ "code": format!("{code:0width$}", width = entry.digits as usize), "hotp": true }),
                    )
                } else {
                    match otp_store::take_window_code(
                        &entry.id,
                        &secret,
                        entry.algorithm,
                        entry.digits,
                        entry.period,
                        std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .map(|d| d.as_secs())
                            .unwrap_or(0),
                    ) {
                        Ok(window) => Ok(json!({
            "code": window.code,
            "remainingSeconds": window.remaining_secs,
                        })),
                        Err(used) => Ok(json!({
            "code": null,
            "reused": true,
            "remainingSeconds": used.remaining_secs,
                        })),
                    }
                }
            }

            "otp/import-qr" => {
                let image = params
                    .get("imageBase64")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                let parsed = otp_store::decode_otpauth_qr(image)?;
                Ok(json!({
            "otpType": parsed.otp_type,
            "issuer": parsed.issuer,
            "label": parsed.label,
            "secretBase32": parsed.secret_base32,
            "algorithm": parsed.algorithm.as_str(),
            "digits": parsed.digits,
            "period": parsed.period,
            "counter": parsed.counter,
                }))
            }

            "connection/protocol" => {
                let connection_id = params
                    .get("connectionId")
                    .and_then(Value::as_str)
                    .ok_or("Missing connectionId")?;
                let payload = connection_protocol_payload(
                    self.runtime.block_on(self.ssh.local_target(connection_id)),
                    self.non_ssh_creds.protocol_of(connection_id),
                    self.ssh.has_connection(connection_id),
                );
                log_rdp_debug(format!(
            "connection/protocol query id={connection_id} -> {payload}"
                ));
                Ok(payload)
            }

            "task/execute" => {
                self.runtime
                    .block_on(self.tasks.execute(&self.ssh, &params, emitter.clone()))
            }

            "task/start" => {
                let tasks = self.tasks.clone();
                let ssh = self.ssh.clone();
                self.runtime
                    .block_on(tasks.start_resident(ssh, params, emitter.clone()))
            }

            "telnet/start" => {
                let mut request: telnet_session::TelnetStartRequest = parse(params)?;
                // 表单密码 → 声明式自动登录（提示词正则用内置默认词表）；请求
                // 已带 autoLogin（工具栏弹窗路径）时不覆盖。
                if request.auto_login.is_none() {
                    if let Some((username, password)) = self
                        .non_ssh_creds
                        .get(request.connection_id.as_deref().unwrap_or_default())
                    {
                        request.auto_login = Some(telnet_form_auto_login(&username, &password));
                    }
                }
                self.runtime
                    .block_on(self.telnet.start(request, emitter.clone()))
            }

            "telnet/write" => {
                let session_id = required_string(&params, "sessionId")?;
                let data_base64 = required_string(&params, "dataBase64")?;
                let data = telnet_session::decode_write_payload(data_base64)?;
                self.telnet.write_input(session_id, data)?;
                Ok(json!({ "success": true }))
            }

            "telnet/resize" => {
                let session_id = required_string(&params, "sessionId")?;
                let cols = required_u32(&params, "cols")?;
                let rows = required_u32(&params, "rows")?;
                self.runtime
                    .block_on(self.telnet.resize(session_id, cols, rows))?;
                Ok(json!({ "success": true }))
            }

            "telnet/replay" => {
                let session_id = required_string(&params, "sessionId")?;
                let after_sequence = params
                    .get("afterSequence")
                    .and_then(Value::as_u64)
                    .unwrap_or(0);
                let replay = self.runtime.block_on(self.telnet.replay(
                    session_id,
                    after_sequence,
                    emitter,
                ))?;
                Ok(replay)
            }

            "telnet/close" => {
                let session_id = required_string(&params, "sessionId")?;
                self.runtime.block_on(self.telnet.close(session_id))?;
                Ok(json!({ "success": true }))
            }

            "serial/start" => {
                let request: serial_session::SerialStartRequest = parse(params)?;
                self.runtime
                    .block_on(self.serial.start(request, emitter.clone()))
            }

            "serial/write" => {
                let session_id = required_string(&params, "sessionId")?;
                let data_base64 = required_string(&params, "dataBase64")?;
                let data = serial_session::decode_write_payload(data_base64)?;
                let session = self.runtime.block_on(self.serial.session(session_id))?;
                self.serial
                    .write_input(&session, session_id, &data, emitter)?;
                Ok(json!({ "success": true }))
            }

            "serial/close" => {
                let session_id = required_string(&params, "sessionId")?;
                self.runtime.block_on(self.serial.close(session_id))?;
                Ok(json!({ "success": true }))
            }

            "serial/replay" => {
                let session_id = required_string(&params, "sessionId")?;
                let after_sequence = params
                    .get("afterSequence")
                    .and_then(Value::as_u64)
                    .unwrap_or(0);
                let replay = self.runtime.block_on(self.serial.replay(
                    session_id,
                    after_sequence,
                    emitter,
                ))?;
                Ok(replay)
            }

            "serial/upload/start" => {
                let session_id = required_string(&params, "sessionId")?;
                let protocol =
                    serial_xmodem::UploadProtocol::parse(required_string(&params, "protocol")?)?;
                let file_name = required_string(&params, "fileName")?;
                let total_size = params
                    .get("totalSize")
                    .and_then(Value::as_u64)
                    .ok_or("serial/upload/start: totalSize is required")?;
                self.runtime.block_on(self.serial.upload_start(
                    session_id,
                    protocol,
                    file_name.to_string(),
                    total_size,
                    emitter,
                ))
            }

            "serial/upload/data" => {
                let session_id = required_string(&params, "sessionId")?;
                let data_base64 = required_string(&params, "dataBase64")?;
                let data = serial_session::decode_write_payload(data_base64)?;
                if data.len() > serial_xmodem::UPLOAD_CHUNK_LIMIT {
                    return Err(format!(
            "serial/upload/data: chunk of {} bytes exceeds the {} byte limit",
                        data.len(),
                        serial_xmodem::UPLOAD_CHUNK_LIMIT
                    ));
                }
                let final_chunk = params
                    .get("final")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                self.runtime.block_on(self.serial.upload_data(
                    session_id,
                    data,
                    final_chunk,
                    emitter,
                ))
            }

            "serial/upload/cancel" => {
                let session_id = required_string(&params, "sessionId")?;
                self.runtime
                    .block_on(self.serial.upload_cancel(session_id, emitter))
            }

            "vnc/start" => {
                let mut request: vnc_session::VncStartRequest = parse(params)?;
                // 表单密码合并：请求已带密码（弹窗路径）时不覆盖。
                if request
                    .password
                    .as_deref()
                    .map(str::is_empty)
                    .unwrap_or(true)
                {
                    if let Some((_, password)) = self
                        .non_ssh_creds
                        .get(request.connection_id.as_deref().unwrap_or_default())
                    {
                        request.password = Some(password);
                    }
                }
                self.runtime
                    .block_on(self.vnc.start(request, emitter.clone()))
            }

            "vnc/write" => {
                let request: vnc_session::VncInputRequest = parse(params)?;
                self.runtime
                    .block_on(self.vnc.input(&request.session_id, request.event))?;
                Ok(json!({ "success": true }))
            }

            "vnc/resize" => {
                let session_id = required_string(&params, "sessionId")?;
                self.runtime.block_on(self.vnc.resize(session_id))?;
                Ok(json!({ "success": true }))
            }

            "vnc/reconnect" => {
                let session_id = required_string(&params, "sessionId")?;
                self.runtime
                    .block_on(self.vnc.reconnect(session_id, emitter.clone()))
            }

            "vnc/set-clipboard" => {
                let session_id = required_string(&params, "sessionId")?;
                let text = required_string(&params, "text")?.to_string();
                self.runtime
                    .block_on(self.vnc.set_clipboard(session_id, text))?;
                Ok(json!({ "success": true }))
            }

            "vnc/close" => {
                let session_id = required_string(&params, "sessionId")?;
                self.runtime.block_on(self.vnc.close(session_id))?;
                Ok(json!({ "success": true }))
            }

            "vnc/replay" => {
                let session_id = required_string(&params, "sessionId")?;
                self.runtime.block_on(self.vnc.replay(session_id, emitter))
            }

            "rdp/start" => {
                rdp_start_gate(&plugin_data_dir())?;
                let mut request: rdp::RdpStartRequest = parse(params)?;
                // 表单密码/用户名合并：请求已带密码（弹窗路径）时不覆盖；
                // 用户名只在请求留空时补（连接表单 username 对 telnet/rdp 可见）。
                if request
                    .password
                    .as_deref()
                    .map(str::is_empty)
                    .unwrap_or(true)
                {
                    let merge_id = request
                        .connection_id
                        .as_deref()
                        .unwrap_or_default()
                        .to_string();
                    if let Some((username, password)) = self
                        .non_ssh_creds
                        .get(request.connection_id.as_deref().unwrap_or_default())
                    {
                        log_rdp_debug(format!(
            "rdp/start merge id={merge_id}: credentials merged (username set)"
                        ));
                        request.password = Some(password);
                        if request.username.trim().is_empty() && !username.is_empty() {
                            request.username = username;
                        }
                    } else {
                        log_rdp_debug(format!(
            "rdp/start merge id={merge_id}: no staged credentials (password stays empty)"
                        ));
                    }
                }
                self.runtime
                    .block_on(self.rdp.start(request, emitter.clone(), &plugin_data_dir()))
            }

            "rdp/write" => {
                let request: rdp::RdpInputRequest = parse(params)?;
                self.runtime
                    .block_on(self.rdp.input(&request.session_id, request.input))?;
                Ok(json!({ "success": true }))
            }

            "rdp/resize" => {
                let request: rdp::RdpResizeRequest = parse(params)?;
                self.runtime.block_on(self.rdp.resize(
                    &request.session_id,
                    request.width,
                    request.height,
                    emitter.clone(),
                ))
            }

            "rdp/set-clipboard" => {
                let session_id = required_string(&params, "sessionId")?;
                let text = required_string(&params, "text")?.to_string();
                self.runtime
                    .block_on(self.rdp.set_clipboard(session_id, text))?;
                Ok(json!({ "success": true }))
            }

            "rdp/reconnect" => {
                let session_id = required_string(&params, "sessionId")?;
                self.runtime
                    .block_on(self.rdp.reconnect(session_id, emitter.clone()))
            }

            "rdp/certificate/resolve" => {
                let challenge_id = required_string(&params, "challengeId")?;
                let accept = params
                    .get("accept")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                let remember = params
                    .get("remember")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                self.rdp
                    .resolve_certificate(challenge_id, accept, remember)?;
                Ok(json!({ "success": true }))
            }

            "rdp/close" => {
                let session_id = required_string(&params, "sessionId")?;
                self.runtime.block_on(self.rdp.close(session_id))?;
                Ok(json!({ "success": true }))
            }

            "rdp/replay" => {
                let session_id = required_string(&params, "sessionId")?;
                self.runtime.block_on(self.rdp.replay(session_id, emitter))
            }

            "watch/start" => {
                let request: file_watch::WatchStartRequest = parse(params)?;
                self.runtime.block_on(self.watcher.start(
                    request,
                    Arc::new(WatchEventPublisher(emitter.clone())),
                    self.session_probe(),
                    &self.ssh.data_dir(),
                ))
            }

            "watch/stop" => {
                let watch_id = required_string(&params, "watchId")?;
                self.runtime.block_on(self.watcher.stop(watch_id))?;
                Ok(json!({ "success": true }))
            }

            "watch/stop-all" => {
                let session_id = required_string(&params, "sessionId")?;
                let stopped = self.runtime.block_on(self.watcher.stop_session(session_id));
                Ok(json!({ "success": true, "stopped": stopped }))
            }

            "watch/upload" => {
                let watch_id = required_string(&params, "watchId")?;
                let session_id = self
                    .runtime
                    .block_on(self.watcher.session_for_watch(watch_id));
                let encoding = self.resolve_sftp_encoding_opt(session_id.as_deref());
                self.runtime
                    .block_on(self.watcher.upload_back(&self.ssh, watch_id, encoding))
            }

            "task/validate" => task_provider::TaskProvider::validate_request(&params),
            "task/stop" => self.runtime.block_on(self.tasks.stop(&params)),
            "task/status" => self.tasks.status(&params),
            "local/terminal/start" => {
                let request: local_terminal::LocalTerminalStartRequest = parse(params)?;
                self.runtime
                    .block_on(self.local.start(request, emitter.clone()))
            }
            "local/terminal/resize" => {
                let session_id = required_string(&params, "sessionId")?;
                let cols = required_u32(&params, "cols")?;
                let rows = required_u32(&params, "rows")?;
                self.runtime
                    .block_on(self.local.resize(session_id, cols, rows))?;
                Ok(json!({ "success": true }))
            }
            "local/terminal/replay" => {
                let session_id = required_string(&params, "sessionId")?;
                let after_sequence = params
                    .get("afterSequence")
                    .and_then(Value::as_u64)
                    .unwrap_or(0);
                self.runtime.block_on(self.local.replay(
                    session_id,
                    after_sequence,
                    emitter,
                ))
            }
            "local/session/close" => {
                let session_id = required_string(&params, "sessionId")?;
                self.runtime.block_on(self.local.close(session_id))?;
                Ok(json!({ "success": true }))
            }
            "local/session/list" => Ok(self.runtime.block_on(self.local.list())),
            "local/shells/list" => Ok(self.local.shells()),
            "local/editors/list" => Ok(local_editors::editors_list_payload()),
            "local/open-with" => {
                let path = required_string(&params, "path")?;
                let history = transfer_history::load_history(&plugin_data_dir());
                let spec = local_editors::launch_spec_from_params(&params)?;
                local_editors::open_with_validated(&history, std::path::Path::new(path), &spec)?;
                Ok(json!({ "success": true }))
            }

            "local/capabilities" => {
                let data_dir = plugin_data_dir();
                let downloads_dir =
                    local_downloads::downloads_base_dir(|key| std::env::var_os(key), &data_dir);
                Ok(json!({
                    "canSaveLocal": local_downloads::can_save_local(|key| std::env::var_os(key)),
                    "downloadsDir": downloads_dir.to_string_lossy(),
                    "platform": local_downloads::platform_name(),
                }))
            }
            // 通用本机落盘：不经过 SFTP 传输链的本地产物（录制 GIF 导出等）。
            // 与下载共用目录语义；targetDir 缺省落下载目录，必须绝对路径。
            "local/saveFile" => {
                let name = required_string(&params, "name")?;
                let data_base64 = required_string(&params, "dataBase64")?;
                let data = BASE64_STANDARD
                    .decode(data_base64)
                    .map_err(|error| format!("dataBase64 is not valid base64: {error}"))?;
                let target_dir = params.get("targetDir").and_then(Value::as_str);
                let conflict = params.get("conflict").and_then(Value::as_str);
                local_downloads::save_local_file(
                    &plugin_data_dir(),
                    name,
                    &data,
                    target_dir,
                    conflict,
                )
            }
            // 插件级 UI 偏好（下载目录、「每次询问」等）：工作台 iframe 是
            // sandbox="allow-scripts"（opaque origin），localStorage 不可用，
            // sidecar 的 preferences.json 是唯一持久存储。固定键白名单。
            "local/preferences/get" => Ok(preferences::load_preferences(&plugin_data_dir())),
            "local/preferences/set" => {
                let result = preferences::save_preferences(&plugin_data_dir(), &params)?;
                let prefs = preferences::load_preferences(&plugin_data_dir());
                x11::set_enabled(
                    prefs.get("x11_forwarding").and_then(Value::as_bool) == Some(true),
                );
                Ok(result)
            },
            // 应用内目录选择器的本机浏览：只列目录（永不返回文件内容）；
            // drives 供 Windows「此电脑」盘符页，其他平台为空。
            "local/fs/browse" => {
                let path = params.get("path").and_then(Value::as_str);
                let include_files = params
                    .get("includeFiles")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                local_fs::browse_local_dir_ex(path, &plugin_data_dir(), include_files)
            }
            "local/fs/read" => {
                let path = required_string(&params, "path")?;
                let offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0);
                let length = params
                    .get("length")
                    .and_then(Value::as_u64)
                    .unwrap_or(65_536)
                    .min(u64::from(u32::MAX)) as u32;
                local_fs::read_local_file_chunk(&path, offset, length)
            }
            "local/fs/drives" => Ok(json!({ "drives": local_fs::list_local_drives() })),
            // 「询问我」冲突策略的预检：目标目录下同名文件是否已存在。
            "local/fs/exists" => {
                let dir = required_string(&params, "dir")?;
                let name = required_string(&params, "name")?;
                local_fs::target_exists(dir, name)
            }
            // 在文件管理器中定位已完成的下载。只允许 reveal 传输历史里
            // 记录过的 localPath，不能成为任意路径打开原语。目标文件已被
            // 移走/改名时回落到其父目录，再退到插件的下载目录（配置或
            // 默认），而不是让文件管理器落到系统的文档目录（issue #18）。
            "local/reveal" => {
                let path = required_string(&params, "path")?;
                let data_dir = plugin_data_dir();
                let history = transfer_history::load_history(&data_dir);
                let recorded = std::path::PathBuf::from(&path);
                local_downloads::reveal_validated(&history, &recorded)?;
                let target = local_downloads::reveal_target(
                    &recorded,
                    &local_downloads::reveal_download_dir(&data_dir),
                );
                local_downloads::reveal_in_file_manager(&target)?;
                Ok(json!({ "success": true }))
            }
            // 在默认应用中打开已完成的本机下载；同样只允许打开传输历史中
            // 记录过的路径，不能成为任意路径执行原语。
            "local/open" => {
                let path = required_string(&params, "path")?;
                let history = transfer_history::load_history(&plugin_data_dir());
                local_downloads::open_validated(&history, std::path::Path::new(path))?;
                Ok(json!({ "success": true }))
            }
            "sftp/transfer/resumable" => self.ssh.resumable_uploads(),
            "sftp/transfer/list" => self
                .ssh
                .transfer_list(required_string(&params, "sessionId")?),
            "sftp/transfer/status" => self
                .ssh
                .transfer_status(required_string(&params, "taskId")?),
            "sftp/transfer/history" => {
                let session_id = params
                    .get("sessionId")
                    .and_then(Value::as_str)
                    .filter(|value| !value.is_empty());
                let limit = params
                    .get("limit")
                    .and_then(Value::as_u64)
                    .unwrap_or(50)
                    .clamp(1, 200) as usize;
                self.runtime
                    .block_on(self.ssh.transfer_history_query(session_id, limit))
            }
            "sftp/transfer/history/clear" => {
                self.ssh.clear_transfer_history()?;
                Ok(json!({ "success": true }))
            }
            // Session import: stream main export (+ optional WindTerm user.config)
            // via binary chunks or JSON `import/preview/chunk` (base64); finish
            // returns a sanitized preview only — never persists connections or
            // credentials in the plugin. Prefer the JSON chunk path in the UI:
            // host `sendBinary` is fire-and-forget, so binary ACK events can
            // time out even when the sidecar accepted the frame.
            "import/preview/start" => self.connection_import.start(&params),
            "import/preview/chunk" => {
                let task_id = required_string(&params, "taskId")?;
                let part = required_string(&params, "part")?;
                let offset = params
                    .get("offset")
                    .and_then(Value::as_u64)
                    .ok_or("Missing offset")?;
                let data_base64 = required_string(&params, "dataBase64")?;
                let payload = BASE64_STANDARD
                    .decode(data_base64)
                    .map_err(|error| format!("Invalid import chunk base64: {error}"))?;
                if payload.len() > connection_import::IMPORT_CHUNK_LIMIT {
                    return Err(format!(
                        "import preview chunk of {} bytes exceeds the {} byte limit",
                        payload.len(),
                        connection_import::IMPORT_CHUNK_LIMIT
                    ));
                }
                let mut frame = Vec::with_capacity(8 + payload.len());
                frame.extend_from_slice(&offset.to_be_bytes());
                frame.extend_from_slice(&payload);
                let next_offset = self.connection_import.append(task_id, part, &frame)?;
                Ok(json!({ "nextOffset": next_offset }))
            }
            "import/preview/finish" => self
                .connection_import
                .finish(required_string(&params, "taskId")?),
            "import/preview/cancel" => Ok(json!({
                "cancelled": self.connection_import.cancel(required_string(&params, "taskId")?)
            })),
            "sftp/bookmarks/list" => sftp_bookmarks::list(&self.ssh.data_dir()),
            "sftp/bookmarks/save" => sftp_bookmarks::save(&self.ssh.data_dir(), &params),
            "sftp/bookmarks/delete" => {
                let id = required_string(&params, "id")?;
                sftp_bookmarks::delete(&self.ssh.data_dir(), id)
            }
            "filesystem/list" => self.filesystem_list(params),
            "filesystem/read" => self.filesystem_read(params),
            "filesystem/write" => self.filesystem_write(params),
            "filesystem/createDirectory" => self.filesystem_create_directory(params),
            "filesystem/delete" => self.filesystem_delete(params),
            "filesystem/rename" => self.filesystem_rename(params),
            "ssh/host-key/check" => {
                let connection_id = required_string(&params, "connectionId")?;
                self.runtime
                    .block_on(self.ssh.check_host_key(connection_id))
            }
            "ssh/sessions/list" => Ok(self.runtime.block_on(self.ssh.list_sessions())),
            "ssh/status" => Ok(json!({
                "ok": true,
                "plugin": "io.datawise.community.ssh",
                "maxTransferSize": MAX_TRANSFER_SIZE
            })),
            _ => Err(format!("Method not found: {method}")),
        }
    }

    fn filesystem_session(&self, params: &Value) -> Result<String, String> {
        if let Some(session_id) = params.get("sessionId").and_then(Value::as_str) {
            return Ok(session_id.to_string());
        }
        let connection_id = connection_id_param(params)?;
        self.runtime
            .block_on(self.ssh.session_id_for_connection(connection_id))
    }

    fn filesystem_list(&self, params: Value) -> Result<Value, String> {
        let session_id = self.filesystem_session(&params)?;
        let path = filesystem_path(&params)?;
        // Host filesystem-provider listings stay on the zero-round-trip path;
        // owner names are opt-in via `sftp/list` only.
        let encoding = self.resolve_sftp_encoding_opt(Some(session_id.as_str()));
        let entries = self.runtime.block_on(self.ssh.sftp_list_path(
            &session_id,
            &path,
            false,
            encoding,
        ))?;
        Ok(json!({ "entries": entries }))
    }

    fn filesystem_read(&self, params: Value) -> Result<Value, String> {
        let session_id = self.filesystem_session(&params)?;
        let path = filesystem_path(&params)?;
        let offset = optional_u64(&params, "offset", 0);
        let max_bytes = bounded_bytes(&params, "maxBytes", 256 * 1024);
        let (data, truncated) = self.runtime.block_on(self.ssh.sftp_read_path(
            &session_id,
            &path,
            offset,
            max_bytes,
        ))?;
        Ok(json!({
            "dataBase64": BASE64_STANDARD.encode(data),
            "contentType": content_type(&path),
            "truncated": truncated
        }))
    }

    fn filesystem_write(&self, params: Value) -> Result<Value, String> {
        let session_id = self.filesystem_session(&params)?;
        let path = filesystem_path(&params)?;
        let data = BASE64_STANDARD
            .decode(required_string(&params, "dataBase64")?)
            .map_err(|error| format!("Invalid base64 file data: {error}"))?;
        let create = params
            .get("create")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        let overwrite = params
            .get("overwrite")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        self.runtime.block_on(self.ssh.sftp_write_path(
            &session_id,
            &path,
            &data,
            create,
            overwrite,
        ))?;
        Ok(json!({ "success": true }))
    }

    fn filesystem_create_directory(&self, params: Value) -> Result<Value, String> {
        let session_id = self.filesystem_session(&params)?;
        let path = filesystem_path(&params)?;
        self.runtime
            .block_on(self.ssh.sftp_create_directory(&session_id, &path))?;
        Ok(json!({ "success": true }))
    }

    fn filesystem_delete(&self, params: Value) -> Result<Value, String> {
        let session_id = self.filesystem_session(&params)?;
        let path = filesystem_path(&params)?;
        let recursive = params
            .get("recursive")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        self.runtime
            .block_on(self.ssh.sftp_delete(&session_id, &path, recursive))?;
        Ok(json!({ "success": true }))
    }

    fn filesystem_rename(&self, params: Value) -> Result<Value, String> {
        let session_id = self.filesystem_session(&params)?;
        let source = required_string(&params, "sourceUri").and_then(path_from_sftp_uri)?;
        let target = required_string(&params, "targetUri").and_then(path_from_sftp_uri)?;
        self.runtime
            .block_on(self.ssh.sftp_rename(&session_id, &source, &target))?;
        Ok(json!({ "success": true }))
    }
}

impl PluginHandler for Plugin {
    fn handle(
        &self,
        _context: RequestContext,
        method: &str,
        params: Value,
        emitter: &PluginEmitter,
    ) -> Result<Value, PluginError> {
        self.handle_request(method, params, emitter)
            .map_err(to_plugin_error)
    }

    fn handle_binary(
        &self,
        channel: &str,
        data: Vec<u8>,
        emitter: &PluginEmitter,
    ) -> Result<(), PluginError> {
        if let Some(session_id) = channel.strip_prefix("ssh/terminal/in/") {
            if data.len() < 8 {
                return Err(to_plugin_error(
                    "SSH terminal input is missing its sequence".to_string(),
                ));
            }
            let sequence =
                u64::from_be_bytes(data[..8].try_into().map_err(|_| {
                    to_plugin_error("Invalid SSH terminal input sequence".to_string())
                })?);
            if let Err(error) = self.ssh.write_terminal(session_id, data[8..].to_vec()) {
                // Binary handler failures are only logged by the SDK loop, so a
                // workbench typing into a dead session (host-pushed disconnect,
                // sidecar restart) would otherwise learn nothing: the tab keeps
                // looking alive while every keystroke is swallowed. Mirror the
                // failure as an event the workbench can auto-reconnect on.
                let _ = emitter.event(
                    "ssh/terminal/error",
                    json!({ "sessionId": session_id, "error": error }),
                );
                return Err(to_plugin_error(error));
            }
            emitter.event(
                "ssh/terminal/inputAck",
                json!({ "sessionId": session_id, "sequence": sequence }),
            )?;
            return Ok(());
        }
        if let Some(session_id) = channel.strip_prefix("local/terminal/in/") {
            if data.len() < 8 {
                return Err(to_plugin_error(
                    "Local terminal input is missing its sequence".to_string(),
                ));
            }
            let sequence = u64::from_be_bytes(data[..8].try_into().map_err(|_| {
                to_plugin_error("Invalid local terminal input sequence".to_string())
            })?);
            if let Err(error) = self.local.write_input(session_id, data[8..].to_vec()) {
                let _ = emitter.event(
                    "local/terminal/error",
                    json!({ "sessionId": session_id, "error": error }),
                );
                return Err(to_plugin_error(error));
            }
            emitter.event(
                "local/terminal/inputAck",
                json!({ "sessionId": session_id, "sequence": sequence }),
            )?;
            return Ok(());
        }
        if let Some(session_id) = channel.strip_prefix("telnet/terminal/in/") {
            if data.len() < 8 {
                return Err(to_plugin_error(
                    "Telnet terminal input is missing its sequence".to_string(),
                ));
            }
            let sequence = u64::from_be_bytes(data[..8].try_into().map_err(|_| {
                to_plugin_error("Invalid telnet terminal input sequence".to_string())
            })?);
            if let Err(error) = self.telnet.write_input(session_id, data[8..].to_vec()) {
                let _ = emitter.event(
                    "telnet/terminal/error",
                    json!({ "sessionId": session_id, "error": error }),
                );
                return Err(to_plugin_error(error));
            }
            emitter.event(
                "telnet/terminal/inputAck",
                json!({ "sessionId": session_id, "sequence": sequence }),
            )?;
            return Ok(());
        }
        if let Some(session_id) = channel.strip_prefix("serial/terminal/in/") {
            let (sequence, payload) = match serial_session::decode_input_frame(&data) {
                Ok(split) => split,
                Err(error) => return Err(to_plugin_error(error)),
            };
            let session = match self.runtime.block_on(self.serial.session(session_id)) {
                Ok(session) => session,
                Err(error) => {
                    let _ = emitter.event(
                        "serial/terminal/error",
                        json!({ "sessionId": session_id, "error": error }),
                    );
                    return Err(to_plugin_error(error));
                }
            };
            if session.upload_active() {
                let error =
                    "Serial input is rejected while a file upload is in progress".to_string();
                let _ = emitter.event(
                    "serial/terminal/error",
                    json!({ "sessionId": session_id, "error": error }),
                );
                return Err(to_plugin_error(error));
            }
            if let Err(error) = self
                .serial
                .write_input(&session, session_id, &payload, emitter)
            {
                let _ = emitter.event(
                    "serial/terminal/error",
                    json!({ "sessionId": session_id, "error": error }),
                );
                return Err(to_plugin_error(error));
            }
            emitter.event(
                "serial/terminal/inputAck",
                json!({ "sessionId": session_id, "sequence": sequence }),
            )?;
            return Ok(());
        }
        if let Some(task_id) = channel.strip_prefix("sftp/upload/") {
            // Binary handler failures are only logged by the SDK loop, so the
            // workbench would otherwise learn about a desynced/missing upload
            // only through a 30s ack timeout. Mirror the failure as an event
            // it can react to immediately.
            if let Err(error) = self.ssh.append_upload(task_id, &data, emitter) {
                let _ = emitter.event(
                    "sftp/upload/error",
                    json!({ "taskId": task_id, "error": error }),
                );
                return Err(to_plugin_error(error));
            }
            return Ok(());
        }
        if let Some(rest) = channel.strip_prefix("import/preview/") {
            let Some((task_id, part)) = rest.rsplit_once('/') else {
                return Err(PluginError::new(
                    -32601,
                    format!("Unknown import preview binary channel: {channel}"),
                ));
            };
            match self.connection_import.append(task_id, part, &data) {
                Ok(next_offset) => {
                    emitter.event(
                        "import/preview/ack",
                        json!({ "taskId": task_id, "part": part, "nextOffset": next_offset }),
                    )?;
                    return Ok(());
                }
                Err(error) => {
                    let _ = emitter.event(
                        "import/preview/error",
                        json!({ "taskId": task_id, "part": part, "error": error }),
                    );
                    return Err(to_plugin_error(error));
                }
            }
        }
        Err(PluginError::new(
            -32601,
            format!("Unknown binary channel: {channel}"),
        ))
    }
}

fn parse<T: DeserializeOwned>(value: Value) -> Result<T, String> {
    serde_json::from_value(value).map_err(|error| format!("Invalid request parameters: {error}"))
}

fn trigger_input_format(raw: Option<&Value>) -> &'static str {
    match raw {
        None | Some(Value::Null) => "empty",
        Some(Value::Object(_)) => "json",
        Some(Value::String(text)) => {
            let trimmed = text.trim();
            if trimmed.is_empty() {
                "empty"
            } else if serde_json::from_str::<serde_json::Map<String, Value>>(trimmed).is_ok() {
                "json"
            } else if trimmed.lines().any(|line| {
                line.trim_start_matches(['#', '!', ' '])
                    .starts_with("Expect")
            }) {
                "tssh"
            } else {
                "json"
            }
        }
        Some(_) => "invalid",
    }
}

fn required_string<'a>(params: &'a Value, key: &str) -> Result<&'a str, String> {
    params
        .get(key)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| format!("Missing {key}"))
}

/// Host sends connection actions as `{ "action": { "id": "..." } }`.
/// Accept the pre-Host-API-1.1 string form as well so older callers remain
/// compatible while the plugin follows the current host contract.
fn connection_action_id(params: &Value) -> Result<&str, String> {
    let action = params
        .get("action")
        .ok_or_else(|| "Missing action".to_string())?;
    action
        .get("id")
        .and_then(Value::as_str)
        .or_else(|| action.as_str())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Missing action id".to_string())
}

/// Host API 1.1 passes `operationId` to correlate connection lifecycle calls;
/// on Host API 1.0 it is absent, so a locally generated id is used instead.
/// The id only needs to stay stable between a challenge prompt and its resolve.
fn operation_id(params: &Value) -> String {
    params
        .get("operationId")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string())
}

fn required_u32(params: &Value, key: &str) -> Result<u32, String> {
    params
        .get(key)
        .and_then(Value::as_u64)
        .and_then(|value| u32::try_from(value).ok())
        .filter(|value| *value > 0)
        .ok_or_else(|| format!("Invalid {key}"))
}

fn bounded_bytes(params: &Value, key: &str, default: usize) -> usize {
    params
        .get(key)
        .and_then(Value::as_u64)
        .map(|value| value as usize)
        .unwrap_or(default)
        .clamp(1, 1024 * 1024)
}

/// Reads an optional non-negative integer parameter, falling back to the
/// default when the key is absent or not a `u64` (negative/invalid).
fn optional_u64(params: &Value, key: &str, default: u64) -> u64 {
    params.get(key).and_then(Value::as_u64).unwrap_or(default)
}

fn content_type(path: &str) -> &'static str {
    match path
        .rsplit('.')
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "txt" | "md" | "log" | "json" | "yaml" | "yml" | "toml" | "rs" | "ts" | "js" => {
            "text/plain"
        }
        "csv" => "text/csv",
        "html" | "htm" => "text/html",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        _ => "application/octet-stream",
    }
}

fn to_plugin_error(error: String) -> PluginError {
    PluginError::new(-32000, error)
}

/// Plugin files live only in the directory the host injects. That path is
/// already inside the workspace; this process does not join a folder named
/// `config` and does not fall back to APPDATA / XDG. Temp is only for a
/// sidecar started without the host (tests), and is not a second store.
fn resolve_plugin_data_dir(lookup: impl Fn(&str) -> Option<OsString>) -> PathBuf {
    let env = |key: &str| {
        lookup(key).and_then(|value| {
            let trimmed = value.to_string_lossy().trim().to_string();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        })
    };
    if let Some(dir) = env("DATAWISE_PLUGIN_DATA_DIR") {
        return PathBuf::from(dir);
    }
    std::env::temp_dir()
        .join("datawise-plugin-data")
        .join("io.datawise.community.ssh")
}


fn connection_protocol_payload(
    local_target: Option<local_target::LocalTarget>,
    non_ssh_protocol: Option<String>,
    has_ssh: bool,
) -> serde_json::Value {
    if let Some(protocol) = non_ssh_protocol {
        return json!({ "protocol": protocol });
    }
    if local_target.is_some() {
        return json!({ "protocol": "local" });
    }
    if has_ssh {
        return json!({ "protocol": "ssh" });
    }
    json!({ "protocol": "unknown" })
}

fn telnet_form_auto_login(username: &str, password: &str) -> telnet_session::AutoLoginSpec {
    telnet_session::AutoLoginSpec {
        rules: None,
        secrets: Vec::new(),
        declarative: Some(telnet_session::DeclarativeAutoLogin {
            username: Some(username.to_string()),
            password: Some(password.to_string()),
            username_prompt_regex: None,
            password_prompt_regex: None,
            success_regex: None,
            failure_regex: None,
            max_retries: None,
        }),
    }
}

fn rdp_start_gate(_data_dir: &std::path::Path) -> Result<(), String> {
    Ok(())
}

fn log_rdp_debug(message: String) {
    let _ = message;
}

struct WatchEventPublisher(PluginEmitter);

impl file_watch::EventPublisher for WatchEventPublisher {
    fn publish(&self, payload: Value) {
        if let Err(error) = self.0.event("watch/file-modified", payload) {
            eprintln!(
                "[ssh-plugin] watch file-modified event failed: {}",
                error.message
            );
        }
    }
}

pub(crate) fn plugin_data_dir() -> PathBuf {
    // Closure (not the generic `var_os` fn item) so the HRTB bound unifies.
    let requested = resolve_plugin_data_dir(|key| std::env::var_os(key));
    // Docker deployments may provide a read-only or not-yet-mounted plugin data
    // directory. Keep startup viable by falling back to the OS temp directory;
    // the warning makes the loss of persistence explicit to the host logs.
    match prepare_plugin_data_dir(&requested) {
        Ok(data_dir) => data_dir,
        Err(request_error) => {
            let fallback = std::env::temp_dir()
                .join("datawise-plugin-data")
                .join("io.datawise.community.ssh");
            match prepare_plugin_data_dir(&fallback) {
                Ok(data_dir) => {
                    eprintln!(
                        "[ssh-sftp-plugin] data directory {} is unavailable: {request_error}; using temporary directory {}",
                        requested.display(),
                        data_dir.display()
                    );
                    data_dir
                }
                Err(fallback_error) => {
                    eprintln!(
                        "[ssh-sftp-plugin] failed to prepare data directories {} ({request_error}) and {} ({fallback_error})",
                        requested.display(),
                        fallback.display()
                    );
                    requested
                }
            }
        }
    }
}

fn prepare_plugin_data_dir(data_dir: &std::path::Path) -> Result<PathBuf, String> {
    std::fs::create_dir_all(data_dir)
        .map_err(|error| format!("{}: {error}", data_dir.display()))?;
    let probe = data_dir.join(format!(".dw-plugin-write-test-{}", uuid::Uuid::new_v4()));
    std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&probe)
        .map_err(|error| format!("{} is not writable: {error}", data_dir.display()))?;
    std::fs::remove_file(&probe)
        .map_err(|error| format!("failed to remove write probe {}: {error}", probe.display()))?;
    // The env vars are the plugin's only path inputs; resolve symlinks and `..`
    // once at the boundary so every store path below it is canonical.
    std::fs::canonicalize(data_dir).map_err(|error| format!("{}: {error}", data_dir.display()))
}

fn main() -> std::io::Result<()> {
    // MCP stdio mode: expose SSH/SFTP tools to MCP clients over JSON-RPC
    // instead of running the plugin server.
    if std::env::args().any(|arg| arg == "--mcp") {
        return mcp::run_mcp_stdio(plugin_data_dir());
    }
    let plugin = Plugin::new().map_err(std::io::Error::other)?;
    let metadata = PluginMetadata::new("io.datawise.community.ssh", env!("CARGO_PKG_VERSION"))
        .with_capability("connections")
        .with_capability("events")
        .with_capability("binary")
        .with_capability("filesystem");
    PluginServer::new(metadata, plugin)
        .transport(PluginTransport::Framed)
        .worker_threads(4)
        .serve()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trigger_validation_reports_format_without_secret_content() {
        assert_eq!(trigger_input_format(None), "empty");
        assert_eq!(trigger_input_format(Some(&json!(""))), "empty");
        assert_eq!(trigger_input_format(Some(&json!({ "stages": [] }))), "json");
        assert_eq!(
            trigger_input_format(Some(&json!("#!! ExpectCount 1\n#!! ExpectPattern1 code"))),
            "tssh"
        );
        assert_eq!(trigger_input_format(Some(&json!(42))), "invalid");

        let parsed = triggers::parse_triggers(
            Some(&json!(
                r#"{"stages":[{"pattern":"code","sendSecretKey":"trigger_answer_1"}]}"#
            )),
            &|key| (key == "trigger_answer_1").then(|| "do-not-return-this".to_string()),
        )
        .unwrap()
        .unwrap();
        assert_eq!(parsed.stages.len(), 1);
        let debug = format!("{parsed:?}");
        assert!(!debug.contains("do-not-return-this"));
    }

    #[test]
    fn preview_byte_limits_are_bounded() {
        assert_eq!(bounded_bytes(&json!({}), "maxBytes", 12), 12);
        assert_eq!(bounded_bytes(&json!({ "maxBytes": 0 }), "maxBytes", 12), 1);
        assert_eq!(
            bounded_bytes(&json!({ "maxBytes": 99_999_999 }), "maxBytes", 12),
            1024 * 1024
        );
    }

    #[test]
    fn connection_action_id_accepts_host_object_and_legacy_string_forms() {
        assert_eq!(
            connection_action_id(&json!({
                "action": { "id": "quick-sudo-profiles" }
            })),
            Ok("quick-sudo-profiles")
        );
        assert_eq!(
            connection_action_id(&json!({ "action": "quick-sudo-profiles" })),
            Ok("quick-sudo-profiles")
        );
        assert_eq!(
            connection_action_id(&json!({ "action": {} })),
            Err("Missing action id".to_string())
        );
    }

    #[test]
    fn optional_u64_falls_back_on_missing_or_invalid() {
        assert_eq!(optional_u64(&json!({}), "offset", 0), 0);
        assert_eq!(optional_u64(&json!({ "offset": 4096 }), "offset", 0), 4096);
        // Negative numbers and non-numeric values fall back to the default.
        assert_eq!(optional_u64(&json!({ "offset": -3 }), "offset", 0), 0);
        assert_eq!(optional_u64(&json!({ "offset": "later" }), "offset", 7), 7);
        assert_eq!(optional_u64(&json!({ "offset": null }), "offset", 7), 7);
    }

    fn lookup_from<'a>(pairs: &'a [(&'a str, &'a str)]) -> impl Fn(&str) -> Option<OsString> + 'a {
        move |key: &str| {
            pairs
                .iter()
                .find(|(name, _)| *name == key)
                .map(|(_, value)| OsString::from(*value))
        }
    }

    #[test]
    fn plugin_data_dir_env_var_takes_priority() {
        let dir = resolve_plugin_data_dir(lookup_from(&[
            ("DATAWISE_PLUGIN_DATA_DIR", "/tmp/explicit-plugin-data"),
            ("DATAWISE_DATA_DIR", "/tmp/unused-dw-data"),
            ("HOME", "/Users/unused"),
        ]));
        assert_eq!(dir, PathBuf::from("/tmp/explicit-plugin-data"));
    }

    #[test]
    fn blank_plugin_data_dir_does_not_use_other_homes() {
        let dir = resolve_plugin_data_dir(lookup_from(&[
            ("DATAWISE_PLUGIN_DATA_DIR", "   "),
            ("DATAWISE_DATA_DIR", "/tmp/dw-root"),
            ("HOME", "/Users/unused"),
            ("APPDATA", r"C:\Users\tester\AppData\Roaming"),
        ]));
        assert_eq!(
            dir,
            std::env::temp_dir()
                .join("datawise-plugin-data")
                .join("io.datawise.community.ssh")
        );
    }

    #[test]
    fn all_sources_missing_falls_back_to_temp_dir() {
        let dir = resolve_plugin_data_dir(lookup_from(&[]));
        assert_eq!(
            dir,
            std::env::temp_dir()
                .join("datawise-plugin-data")
                .join("io.datawise.community.ssh")
        );
    }

    #[test]
    fn password_is_not_in_workbench_status() {
        let value = json!({ "ok": true, "plugin": "io.datawise.community.ssh" });
        assert!(!value.to_string().contains("password"));
    }
}
