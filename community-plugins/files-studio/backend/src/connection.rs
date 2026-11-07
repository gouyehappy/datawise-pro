use std::collections::HashMap;

use datawise_plugin_sdk::PluginError;
use opendal::services::{Azblob, Ftp, Gcs, Obs, S3, Webdav, Fs};
use opendal::Operator;
use serde_json::Value;

use crate::guard::GuardPolicy;
use crate::util::{optional_string, plugin_err};

#[derive(Debug, Clone)]
pub struct MountConfig {
    pub id: String,
    pub name: String,
    pub scheme: String,
    pub endpoint_label: String,
    pub default_prefix: String,
    pub scope_label: String,
    pub guard: GuardPolicy,
    pub raw: Value,
}

pub fn parse_mount(params: &Value) -> Result<MountConfig, PluginError> {
    let connection = params
        .get("connection")
        .cloned()
        .unwrap_or_else(|| params.clone());

    let id = connection
        .get("id")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| plugin_err("Missing connection id"))?
        .to_string();

    let name = connection
        .get("name")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .unwrap_or(&id)
        .to_string();

    let external = merge_maps(
        obj_map(connection.get("external_config")),
        obj_map(connection.get("advancedConfig")),
    );
    let _secrets = merge_maps(
        obj_map(connection.get("connection_secrets")),
        obj_map(connection.get("secrets")),
    );

    let scheme = first_nonempty(&[
        str_in(&external, "scheme"),
        str_in(&external, "protocol"),
        Some("fs"),
    ])
    .unwrap_or("fs")
    .to_string();

    let default_prefix = first_nonempty(&[
        str_in(&external, "default_prefix"),
        str_in(&external, "root_prefix"),
    ])
    .unwrap_or("")
    .trim()
    .trim_matches('/')
    .to_string();

    let guard = GuardPolicy::from_config(&external);
    let (endpoint_label, scope_label) =
        labels_for_scheme(&scheme, &connection, &external, &default_prefix);

    Ok(MountConfig {
        id,
        name,
        scheme,
        endpoint_label,
        default_prefix,
        scope_label,
        guard,
        raw: connection,
    })
}

pub fn build_operator(mount: &MountConfig) -> Result<Operator, PluginError> {
    let connection = &mount.raw;
    let external = merge_maps(
        obj_map(connection.get("external_config")),
        obj_map(connection.get("advancedConfig")),
    );
    let secrets = merge_maps(
        obj_map(connection.get("connection_secrets")),
        obj_map(connection.get("secrets")),
    );

    let host = connection
        .get("host")
        .and_then(Value::as_str)
        .unwrap_or("");
    let port = connection
        .get("port")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let user = connection
        .get("user")
        .and_then(Value::as_str)
        .unwrap_or("");
    let password = connection
        .get("password")
        .and_then(Value::as_str)
        .or_else(|| str_in(&secrets, "password"))
        .unwrap_or("");

    match mount.scheme.as_str() {
        "fs" | "local" => {
            let root = first_nonempty(&[
                str_in(&external, "root"),
                str_in(&external, "root_path"),
                optional_string(connection, "database"),
                if host.is_empty() { None } else { Some(host) },
            ])
            .ok_or_else(|| plugin_err("Local mount requires root path"))?;
            let builder = Fs::default().root(root);
            Operator::new(builder).map_err(map_opendal)
        }
        "s3" => {
            let settings = s3_settings_from(connection, &external, &secrets)?;
            build_s3_operator(&settings)
        }
        "obs" => {
            let bucket = required_cfg(&external, "bucket")?;
            let mut builder = Obs::default().bucket(bucket);
            if let Some(endpoint) = str_in(&external, "endpoint").or(nonempty(host)) {
                builder = builder.endpoint(endpoint);
            }
            let ak = str_val(&secrets, "access_key_id")
                .or_else(|| str_val(&secrets, "access_key"))
                .ok_or_else(|| plugin_err("OBS requires Access key ID"))?;
            let sk = str_val(&secrets, "secret_access_key")
                .or_else(|| str_val(&secrets, "secret_key"))
                .ok_or_else(|| plugin_err("OBS requires Secret access key"))?;
            builder = builder.access_key_id(&ak).secret_access_key(&sk);
            if let Some(root) = str_in(&external, "root").filter(|s| !s.is_empty()) {
                builder = builder.root(root);
            }
            Operator::new(builder).map_err(map_opendal)
        }
        "azblob" | "azure" => {
            let container = required_cfg(&external, "container")
                .or_else(|_| required_cfg(&external, "bucket"))?;
            let mut builder = Azblob::default().container(container);
            if let Some(account) = first_nonempty(&[
                str_in(&external, "account_name"),
                str_in(&external, "account"),
                nonempty(user),
            ]) {
                builder = builder.account_name(account);
            }
            if let Some(key) = first_nonempty(&[
                str_in(&secrets, "account_key"),
                str_in(&secrets, "access_key"),
                nonempty(password),
            ]) {
                builder = builder.account_key(key);
            }
            if let Some(sas) = str_in(&secrets, "sas_token") {
                builder = builder.sas_token(sas);
            }
            if let Some(endpoint) = str_in(&external, "endpoint").or(nonempty(host)) {
                builder = builder.endpoint(endpoint);
            }
            if let Some(root) = str_in(&external, "root").filter(|s| !s.is_empty()) {
                builder = builder.root(root);
            }
            Operator::new(builder).map_err(map_opendal)
        }
        "gcs" => {
            let bucket = required_cfg(&external, "bucket")?;
            let mut builder = Gcs::default().bucket(bucket);
            if let Some(cred) = first_nonempty(&[
                str_in(&secrets, "credential"),
                str_in(&secrets, "credentials_json"),
                str_in(&external, "credential"),
            ]) {
                builder = builder.credential(cred);
            }
            if let Some(path) = str_in(&external, "credential_path") {
                builder = builder.credential_path(path);
            }
            if let Some(root) = str_in(&external, "root").filter(|s| !s.is_empty()) {
                builder = builder.root(root);
            }
            Operator::new(builder).map_err(map_opendal)
        }
        "webdav" => {
            let endpoint = first_nonempty(&[
                str_in(&external, "endpoint"),
                str_in(&external, "url"),
                nonempty(host),
            ])
            .ok_or_else(|| plugin_err("WebDAV requires endpoint/url"))?;
            let mut builder = Webdav::default().endpoint(endpoint);
            if !user.is_empty() {
                builder = builder.username(user);
            }
            if !password.is_empty() {
                builder = builder.password(password);
            }
            if let Some(root) = str_in(&external, "root").filter(|s| !s.is_empty()) {
                builder = builder.root(root);
            }
            Operator::new(builder).map_err(map_opendal)
        }
        "ftp" => {
            let endpoint = if host.contains("://") {
                host.to_string()
            } else {
                let p = if port > 0 { port } else { 21 };
                format!("ftp://{host}:{p}")
            };
            let mut builder = Ftp::default().endpoint(&endpoint);
            if !user.is_empty() {
                builder = builder.user(user);
            }
            if !password.is_empty() {
                builder = builder.password(password);
            }
            if let Some(root) = str_in(&external, "root").filter(|s| !s.is_empty()) {
                builder = builder.root(root);
            }
            Operator::new(builder).map_err(map_opendal)
        }
        "sftp" => Err(plugin_err(
            "SFTP 由独立 SSH 会话处理，请走 connection/connect。",
        )),
        "smb" | "cifs" => Err(plugin_err(
            "SMB 由 Windows 共享连接处理，请走 connection/connect。",
        )),
        other => Err(plugin_err(format!("Unsupported scheme: {other}"))),
    }
}

/// Chrome + breadcrumb root for every scheme: one URI-style location.
///
/// Path segments under that root come from the browser prefix (bucket/key,
/// remote folders, etc.). `endpoint_label` and `scope_label` are always equal.
fn labels_for_scheme(
    scheme: &str,
    connection: &Value,
    external: &HashMap<String, Value>,
    _default_prefix: &str,
) -> (String, String) {
    let label = location_label(scheme, connection, external);
    (label.clone(), label)
}

fn location_label(
    scheme: &str,
    connection: &Value,
    external: &HashMap<String, Value>,
) -> String {
    let host = connection
        .get("host")
        .and_then(Value::as_str)
        .unwrap_or("");
    let port = connection.get("port").and_then(Value::as_u64).unwrap_or(0);
    match scheme {
        "fs" | "local" => {
            let root = str_in(external, "root")
                .or_else(|| str_in(external, "root_path"))
                .or(nonempty(host))
                .unwrap_or("(unset)");
            format!("local://{root}")
        }
        "s3" | "obs" | "gcs" => {
            let endpoint = str_in(external, "endpoint").or(nonempty(host)).unwrap_or("");
            let host = display_host(endpoint);
            let bucket = str_in(external, "bucket").filter(|b| !b.is_empty());
            match (host.is_empty(), bucket) {
                (false, Some(bucket)) => format!("{scheme}://{host}/{bucket}"),
                (false, None) => format!("{scheme}://{host}"),
                (true, Some(bucket)) => format!("{scheme}://{bucket}"),
                (true, None) => format!("{scheme}://"),
            }
        }
        "azblob" | "azure" => {
            let account = first_nonempty(&[
                str_in(external, "account_name"),
                str_in(external, "account"),
                connection.get("user").and_then(Value::as_str),
            ]);
            let container = str_in(external, "container")
                .or_else(|| str_in(external, "bucket"))
                .filter(|s| !s.is_empty());
            match (account, container) {
                (Some(account), Some(container)) => format!("azblob://{account}/{container}"),
                (_, Some(container)) => format!("azblob://{container}"),
                (Some(account), None) => format!("azblob://{account}"),
                _ => "azblob://".into(),
            }
        }
        "webdav" => {
            let ep = str_in(external, "endpoint")
                .or_else(|| str_in(external, "url"))
                .or(nonempty(host))
                .unwrap_or("webdav");
            format_webdav_label(ep)
        }
        "ftp" | "sftp" => host_port_label(scheme, host, port),
        "smb" | "cifs" => {
            let share = str_in(external, "share")
                .or_else(|| str_in(external, "root"))
                .unwrap_or("share");
            if port > 0 && port != 445 {
                format!("smb://{host}:{port}/{share}")
            } else {
                format!("smb://{host}/{share}")
            }
        }
        other => format!("{other}://"),
    }
}

fn host_port_label(scheme: &str, host: &str, port: u64) -> String {
    if host.is_empty() {
        return format!("{scheme}://");
    }
    if port > 0 {
        format!("{scheme}://{host}:{port}")
    } else {
        format!("{scheme}://{host}")
    }
}

fn format_webdav_label(endpoint: &str) -> String {
    let ep = endpoint.trim().trim_end_matches('/');
    if ep.starts_with("http://") || ep.starts_with("https://") || ep.starts_with("webdav://") {
        ep.to_string()
    } else if ep.is_empty() {
        "webdav://".into()
    } else {
        format!("webdav://{ep}")
    }
}

#[derive(Debug, Clone)]
pub struct S3Settings {
    pub endpoint: String,
    pub region: String,
    pub bucket: String,
    pub access_key: String,
    pub secret_key: String,
    pub session_token: Option<String>,
    pub virtual_host: bool,
}

pub fn s3_settings(mount: &MountConfig) -> Result<S3Settings, PluginError> {
    let connection = &mount.raw;
    let external = merge_maps(
        obj_map(connection.get("external_config")),
        obj_map(connection.get("advancedConfig")),
    );
    let secrets = merge_maps(
        obj_map(connection.get("connection_secrets")),
        obj_map(connection.get("secrets")),
    );
    s3_settings_from(connection, &external, &secrets)
}

fn s3_settings_from(
    connection: &Value,
    external: &HashMap<String, Value>,
    secrets: &HashMap<String, Value>,
) -> Result<S3Settings, PluginError> {
    let host = connection
        .get("host")
        .and_then(Value::as_str)
        .unwrap_or("");
    let bucket = str_in(external, "bucket")
        .unwrap_or("")
        .trim()
        .trim_matches('/')
        .to_string();
    let endpoint = first_nonempty(&[str_in(external, "endpoint"), nonempty(host)])
        .map(|ep| normalize_s3_endpoint(ep, &bucket))
        .ok_or_else(|| plugin_err("S3/MinIO requires endpoint"))?;
    let region = str_in(external, "region").unwrap_or("us-east-1").to_string();
    // Do not fall back to connection.user/password. The host restores blank
    // form fields from older saved rows, which are not MinIO keys.
    let access_key = str_val(secrets, "access_key_id")
        .or_else(|| str_val(secrets, "access_key"))
        .or_else(|| str_val(external, "access_key_id"))
        .ok_or_else(|| plugin_err("S3/MinIO requires Access key ID (secrets.access_key_id)"))?;
    let secret_key = str_val(secrets, "secret_access_key")
        .or_else(|| str_val(secrets, "secret_key"))
        .or_else(|| str_val(secrets, "secret_access"))
        .ok_or_else(|| plugin_err("S3/MinIO requires Secret access key (secrets.secret_access_key)"))?;
    let force_virtual = bool_cfg(external, "enable_virtual_host_style", false);
    let path_style = bool_cfg(external, "enable_path_style", true)
        || bool_cfg(external, "path_style", false)
        || endpoint.starts_with("http://");
    Ok(S3Settings {
        endpoint,
        region,
        bucket,
        access_key,
        secret_key,
        session_token: str_val(secrets, "session_token"),
        virtual_host: force_virtual && !path_style,
    })
}

pub fn build_fs_at(root: &str) -> Result<Operator, PluginError> {
    let builder = Fs::default().root(root);
    Operator::new(builder).map_err(map_opendal)
}

pub fn build_s3_operator(settings: &S3Settings) -> Result<Operator, PluginError> {
    let bucket = if settings.bucket.is_empty() {
        "datawise-account-root"
    } else {
        settings.bucket.as_str()
    };
    let mut builder = S3::default()
        .bucket(bucket)
        .disable_config_load()
        .disable_ec2_metadata()
        .region(&settings.region)
        .endpoint(&settings.endpoint)
        .access_key_id(&settings.access_key)
        .secret_access_key(&settings.secret_key);
    if let Some(token) = &settings.session_token {
        builder = builder.session_token(token);
    }
    if settings.virtual_host {
        builder = builder.enable_virtual_host_style();
    }
    Operator::new(builder).map_err(map_opendal)
}

fn map_opendal(err: opendal::Error) -> PluginError {
    plugin_err(err.to_string())
}

fn obj_map(value: Option<&Value>) -> HashMap<String, Value> {
    value
        .and_then(Value::as_object)
        .map(|o| o.iter().map(|(k, v)| (k.clone(), v.clone())).collect())
        .unwrap_or_default()
}

fn merge_maps(mut a: HashMap<String, Value>, b: HashMap<String, Value>) -> HashMap<String, Value> {
    for (k, v) in b {
        a.entry(k).or_insert(v);
    }
    a
}

fn str_in<'a>(map: &'a HashMap<String, Value>, key: &str) -> Option<&'a str> {
    map.get(key).and_then(Value::as_str).filter(|s| !s.is_empty())
}

/// Coerce secret/config values that arrived as non-strings (host form quirks).
fn str_val(map: &HashMap<String, Value>, key: &str) -> Option<String> {
    match map.get(key)? {
        Value::String(s) if !s.is_empty() => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        Value::Bool(b) => Some(b.to_string()),
        _ => None,
    }
}

fn required_cfg<'a>(map: &'a HashMap<String, Value>, key: &str) -> Result<&'a str, PluginError> {
    str_in(map, key).ok_or_else(|| plugin_err(format!("Missing config field: {key}")))
}

fn bool_cfg(map: &HashMap<String, Value>, key: &str, default: bool) -> bool {
    match map.get(key) {
        Some(Value::Bool(b)) => *b,
        Some(Value::String(s)) => matches!(s.to_ascii_lowercase().as_str(), "true" | "1" | "yes"),
        _ => default,
    }
}

fn first_nonempty<'a>(vals: &[Option<&'a str>]) -> Option<&'a str> {
    vals.iter().copied().flatten().find(|s| !s.is_empty())
}

/// `https://10.0.0.1:9000/bucket` → `10.0.0.1:9000` for labels.
fn display_host(endpoint: &str) -> String {
    let ep = endpoint.trim().trim_end_matches('/');
    let rest = ep
        .strip_prefix("https://")
        .or_else(|| ep.strip_prefix("http://"))
        .unwrap_or(ep);
    rest.split('/').next().unwrap_or(rest).to_string()
}

/// Drop a trailing `/bucket` so path-style addressing is not doubled.
fn normalize_s3_endpoint(endpoint: &str, bucket: &str) -> String {
    let mut ep = endpoint.trim().trim_end_matches('/').to_string();
    let suffix = format!("/{bucket}");
    if ep.ends_with(&suffix) {
        ep.truncate(ep.len() - suffix.len());
    }
    ep
}

fn nonempty(s: &str) -> Option<&str> {
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}
