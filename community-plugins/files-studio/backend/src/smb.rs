//! SMB shares. On Windows the share is attached with WNetAddConnection2 and
//! then read through OpenDAL's local filesystem (UNC paths). Other platforms
//! get a clear error until a portable client is wired.

use datawise_plugin_sdk::PluginError;
use serde_json::Value;

use crate::connection::MountConfig;
use crate::util::plugin_err;

#[cfg(windows)]
pub async fn connect(config: &MountConfig) -> Result<String, PluginError> {
    let (remote, root) = unc_paths(config)?;
    attach(&remote, config)?;
    Ok(root)
}

#[cfg(not(windows))]
pub async fn connect(_config: &MountConfig) -> Result<String, PluginError> {
    Err(plugin_err(
        "SMB 目前只在 Windows 上连接。请在 Windows 客户端使用，或改用 WebDAV / FTP / SFTP。",
    ))
}

#[cfg(windows)]
pub fn disconnect(config: &MountConfig) {
    if let Ok((remote, _)) = unc_paths(config) {
        detach(&remote);
    }
}

#[cfg(not(windows))]
pub fn disconnect(_config: &MountConfig) {}

fn unc_paths(config: &MountConfig) -> Result<(String, String), PluginError> {
    let connection = &config.raw;
    let external = connection
        .get("external_config")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let host = connection
        .get("host")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .or_else(|| {
            external
                .get("host")
                .and_then(Value::as_str)
                .filter(|s| !s.is_empty())
        })
        .ok_or_else(|| plugin_err("SMB 需要主机"))?;
    let share = external
        .get("share")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .or_else(|| {
            external
                .get("root")
                .and_then(Value::as_str)
                .filter(|s| !s.is_empty())
        })
        .ok_or_else(|| plugin_err("SMB 需要共享名（例如 data）"))?;
    let share = share.trim().trim_matches('\\').trim_matches('/');
    let remote = format!(r"\\{host}\{share}");
    Ok((remote.clone(), remote))
}

#[cfg(windows)]
fn attach(remote: &str, config: &MountConfig) -> Result<(), PluginError> {
    use std::os::windows::ffi::OsStrExt;
    use std::ffi::OsStr;

    use windows::core::PCWSTR;
    use windows::Win32::Foundation::ERROR_SESSION_CREDENTIAL_CONFLICT;
    use windows::Win32::NetworkManagement::WNet::{
        WNetAddConnection2W, CONNECT_TEMPORARY, NETRESOURCEW, RESOURCETYPE_DISK,
    };

    let connection = &config.raw;
    let secrets = connection
        .get("connection_secrets")
        .and_then(Value::as_object);
    let user = connection
        .get("user")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let password = connection
        .get("password")
        .and_then(Value::as_str)
        .or_else(|| {
            secrets
                .and_then(|m| m.get("password"))
                .and_then(Value::as_str)
        })
        .unwrap_or("")
        .to_string();

    let add = |remote: &str| -> u32 {
        let mut remote_w: Vec<u16> = OsStr::new(remote).encode_wide().chain(Some(0)).collect();
        let user_w: Vec<u16> = OsStr::new(&user).encode_wide().chain(Some(0)).collect();
        let pass_w: Vec<u16> = OsStr::new(&password).encode_wide().chain(Some(0)).collect();
        let resource = NETRESOURCEW {
            dwType: RESOURCETYPE_DISK,
            lpRemoteName: windows::core::PWSTR(remote_w.as_mut_ptr()),
            ..Default::default()
        };
        let user_ptr = if user.is_empty() {
            PCWSTR::null()
        } else {
            PCWSTR(user_w.as_ptr())
        };
        let pass_ptr = if password.is_empty() {
            PCWSTR::null()
        } else {
            PCWSTR(pass_w.as_ptr())
        };
        unsafe { WNetAddConnection2W(&resource, pass_ptr, user_ptr, CONNECT_TEMPORARY) }.0
    };

    let mut code = add(remote);
    if code == ERROR_SESSION_CREDENTIAL_CONFLICT.0 {
        detach(remote);
        code = add(remote);
    }
    if code == 0 || code == 85 {
        return Ok(());
    }
    Err(plugin_err(format!(
        "连接共享 {remote} 失败（Windows 错误 {code}）。请检查主机、共享名和账号。"
    )))
}

#[cfg(windows)]
fn detach(remote: &str) {
    use std::os::windows::ffi::OsStrExt;
    use std::ffi::OsStr;

    use windows::core::PCWSTR;
    use windows::Win32::NetworkManagement::WNet::{
        WNetCancelConnection2W, NET_CONNECT_FLAGS,
    };

    let remote_w: Vec<u16> = OsStr::new(remote).encode_wide().chain(Some(0)).collect();
    unsafe {
        let _ = WNetCancelConnection2W(PCWSTR(remote_w.as_ptr()), NET_CONNECT_FLAGS(0), true);
    }
}
