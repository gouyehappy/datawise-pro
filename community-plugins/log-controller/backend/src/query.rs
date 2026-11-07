use std::collections::HashMap;
use std::time::Duration;

use datawise_plugin_sdk::PluginError;
use futures::future::join_all;
use glob::Pattern;
use regex::Regex;
use serde_json::{json, Value};

use crate::connection::{servers_from_params, GroupConfig, ServerSpec};
use crate::ssh_pool::{self, GrepFlags};
use crate::util::{optional_string, plugin_err, required_string};

#[derive(Debug, Clone, Default)]
struct FileCursor {
    path: String,
    size: u64,
    inode: String,
}

#[derive(Debug, Clone)]
struct LogLine {
    host_id: String,
    host_label: String,
    host: String,
    file: String,
    line_no: Option<u64>,
    ts_ms: Option<i64>,
    ts_raw: Option<String>,
    level: Option<String>,
    text: String,
}

/// contains | whole | exact | regex
#[derive(Debug, Clone)]
struct MatchOpts {
    keyword: String,
    keywords: Vec<String>,
    mode: String,
    ignore_case: bool,
    exclude: Vec<String>,
    keyword_any: bool,
}

impl MatchOpts {
    fn from_params(params: &Value) -> Result<Self, PluginError> {
        let keyword = optional_string(params, "keyword")
            .or_else(|| optional_string(params, "query"))
            .unwrap_or("")
            .to_string();
        let keywords = parse_terms(&keyword);
        let use_regex = params
            .get("regex")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        let mode = optional_string(params, "matchMode")
            .or_else(|| optional_string(params, "mode"))
            .unwrap_or(if use_regex { "regex" } else { "contains" })
            .to_ascii_lowercase();
        let mode = match mode.as_str() {
            "whole" | "word" | "exact" | "regex" | "contains" => mode,
            _ => "contains".to_string(),
        };
        let ignore_case = params
            .get("ignoreCase")
            .and_then(Value::as_bool)
            .or_else(|| {
                params
                    .get("caseSensitive")
                    .and_then(Value::as_bool)
                    .map(|v| !v)
            })
            .unwrap_or(true);
        let exclude = parse_terms(
            optional_string(params, "exclude")
                .or_else(|| optional_string(params, "ignore"))
                .unwrap_or(""),
        );
        let keyword_any = optional_string(params, "keywordJoin")
            .unwrap_or("and")
            .eq_ignore_ascii_case("or");
        if mode == "regex" {
            for term in &keywords {
                Regex::new(term).map_err(|_| plugin_err("关键字写得不对，请检查正则"))?;
            }
        }
        Ok(Self {
            keyword,
            keywords,
            mode,
            ignore_case,
            exclude,
            keyword_any,
        })
    }

    fn matches(&self, row: &str) -> bool {
        if self.is_excluded(row) {
            return false;
        }
        if self.keywords.is_empty() {
            return true;
        }
        if self.mode == "exact" || self.keyword_any {
            return self.keywords.iter().any(|term| self.term_matches(row, term));
        }
        self.keywords.iter().all(|term| self.term_matches(row, term))
    }

    fn term_matches(&self, row: &str, term: &str) -> bool {
        match self.mode.as_str() {
            "regex" => {
                let flags = if self.ignore_case { "(?i)" } else { "" };
                Regex::new(&format!("{flags}{term}"))
                    .map(|re| re.is_match(row))
                    .unwrap_or(false)
            }
            "exact" => {
                let left = row.trim();
                if self.ignore_case {
                    left.eq_ignore_ascii_case(term.trim())
                } else {
                    left == term.trim()
                }
            }
            "whole" | "word" => {
                let flags = if self.ignore_case { "(?i)" } else { "" };
                let escaped = regex::escape(term);
                Regex::new(&format!(r"{flags}\b{escaped}\b"))
                    .map(|re| re.is_match(row))
                    .unwrap_or(false)
            }
            _ => {
                if self.ignore_case {
                    row.to_ascii_lowercase()
                        .contains(&term.to_ascii_lowercase())
                } else {
                    row.contains(term)
                }
            }
        }
    }

    fn is_excluded(&self, row: &str) -> bool {
        if self.exclude.is_empty() {
            return false;
        }
        if self.ignore_case {
            let lower = row.to_ascii_lowercase();
            self.exclude
                .iter()
                .any(|term| lower.contains(&term.to_ascii_lowercase()))
        } else {
            self.exclude.iter().any(|term| row.contains(term.as_str()))
        }
    }

    fn grep_flags(&self) -> GrepFlags {
        GrepFlags {
            ignore_case: self.ignore_case,
            whole_word: self.mode == "whole",
            whole_line: self.mode == "exact",
            fixed: self.mode != "regex",
        }
    }

    fn can_remote_grep(&self) -> bool {
        !self.keywords.is_empty() && self.mode != "regex"
    }

    fn primary_keyword(&self) -> &str {
        self.keywords.first().map(String::as_str).unwrap_or("")
    }

    fn remote_patterns(&self) -> Vec<String> {
        if self.keyword_any {
            return self.keywords.clone();
        }
        let first = self.primary_keyword();
        if first.is_empty() {
            Vec::new()
        } else {
            vec![first.to_string()]
        }
    }
}

fn parse_terms(raw: &str) -> Vec<String> {
    let text = raw.trim();
    if text.is_empty() {
        return Vec::new();
    }
    // Support: a,b,c  or  a | b | c  or  quoted "foo bar"
    let mut out = Vec::new();
    let mut buf = String::new();
    let mut in_quote = false;
    for ch in text.chars() {
        match ch {
            '"' => in_quote = !in_quote,
            ',' | '|' if !in_quote => {
                let term = buf.trim().to_string();
                if !term.is_empty() {
                    out.push(term);
                }
                buf.clear();
            }
            _ => buf.push(ch),
        }
    }
    let term = buf.trim().to_string();
    if !term.is_empty() {
        out.push(term);
    }
    if out.is_empty() && !text.is_empty() {
        out.push(text.to_string());
    }
    out
}

pub async fn probe_servers(cfg: &GroupConfig, params: &Value) -> Result<Value, PluginError> {
    let servers = resolve_servers(cfg, params)?;
    if servers.is_empty() {
        return Err(plugin_err("请先添加至少一台服务器"));
    }
    let mut results = Vec::new();
    for server in &servers {
        if !server.enabled {
            results.push(json!({
                "id": server.id,
                "label": server.label,
                "host": server.host,
                "port": server.port,
                "ok": false,
                "skipped": true,
                "message": "已禁用",
            }));
            continue;
        }
        match ssh_pool::probe(cfg, server).await {
            Ok(message) => {
                let files = list_matching_files(cfg, server).await.unwrap_or_default();
                results.push(json!({
                    "id": server.id,
                    "label": server.label,
                    "host": server.host,
                    "port": server.port,
                    "ok": true,
                    "message": message,
                    "fileCount": files.len(),
                    "files": files.iter().take(20).map(|f| json!({
                        "name": f.0,
                        "size": f.1,
                        "path": f.2,
                    })).collect::<Vec<_>>(),
                }));
            }
            Err(e) => results.push(json!({
                "id": server.id,
                "label": server.label,
                "host": server.host,
                "port": server.port,
                "ok": false,
                "message": e.message,
            })),
        }
    }
    Ok(json!({
        "serviceName": cfg.service_name,
        "logDir": cfg.log_dir,
        "logGlob": cfg.log_glob,
        "results": results,
    }))
}

pub async fn list_files(cfg: &GroupConfig, params: &Value) -> Result<Value, PluginError> {
    let servers = resolve_servers(cfg, params)?;
    let mut hosts = Vec::new();
    let mut errors = Vec::new();
    for server in servers.into_iter().filter(|s| s.enabled) {
        match list_matching_files(cfg, &server).await {
            Ok(files) => hosts.push(json!({
                "id": server.id,
                "label": server.label,
                "host": server.host,
                "port": server.port,
                "files": files.iter().map(|f| json!({
                    "name": f.0,
                    "size": f.1,
                    "path": f.2,
                    "mtime": f.3,
                })).collect::<Vec<_>>(),
            })),
            Err(e) => errors.push(json!({
                "id": server.id,
                "label": server.label,
                "message": e.message,
            })),
        }
    }
    Ok(json!({ "hosts": hosts, "errors": errors }))
}

pub async fn search(cfg: &GroupConfig, params: &Value) -> Result<Value, PluginError> {
    let servers = resolve_servers(cfg, params)?;
    let enabled: Vec<_> = servers.into_iter().filter(|s| s.enabled).collect();
    if enabled.is_empty() {
        return Err(plugin_err("没有启用的服务器"));
    }

    let match_opts = MatchOpts::from_params(params)?;
    let level_filter = optional_string(params, "level")
        .map(|s| s.to_ascii_uppercase())
        .filter(|s| s != "ALL" && !s.is_empty());
    let max_lines = params
        .get("maxLines")
        .and_then(Value::as_u64)
        .or_else(|| params.get("limit").and_then(Value::as_u64))
        .unwrap_or(cfg.default_tail_lines)
        .clamp(50, 20_000) as usize;
    let max_bytes = params
        .get("maxBytesPerHost")
        .and_then(Value::as_u64)
        .unwrap_or(cfg.max_bytes_per_host)
        .clamp(64 * 1024, 32 * 1024 * 1024);
    let file_filters = file_name_filters(params);
    let time_from = optional_string(params, "timeFrom")
        .or_else(|| optional_string(params, "time_from"))
        .map(str::to_string);
    let time_to = optional_string(params, "timeTo")
        .or_else(|| optional_string(params, "time_to"))
        .map(str::to_string);
    let prefer_remote_grep = params
        .get("remoteGrep")
        .and_then(Value::as_bool)
        .unwrap_or(match_opts.can_remote_grep())
        && time_from.is_none()
        && time_to.is_none();
    let cursors = parse_cursors(params);
    let older_page = params
        .get("olderPage")
        .and_then(Value::as_u64)
        .unwrap_or(0)
        .min(40);
    let incremental = older_page == 0 && !cursors.is_empty()
        && time_from.is_none()
        && time_to.is_none()
        && match_opts.keywords.is_empty()
        && !prefer_remote_grep;

    let futures = enabled.iter().map(|server| {
        let cfg = cfg.clone();
        let server = server.clone();
        let match_opts = match_opts.clone();
        let level_filter = level_filter.clone();
        let file_filters = file_filters.clone();
        let time_from = time_from.clone();
        let time_to = time_to.clone();
        let cursor = cursors.get(&server.id).cloned();
        async move {
            let host_id = server.id.clone();
            let host_label = server.label.clone();
            let work = collect_host(
                &cfg,
                &server,
                &match_opts,
                level_filter.as_deref(),
                &file_filters,
                max_bytes,
                max_lines,
                prefer_remote_grep,
                time_from.as_deref(),
                time_to.as_deref(),
                if incremental { cursor } else { None },
                older_page,
            );
            match tokio::time::timeout(Duration::from_secs(20), work).await {
                Ok(Ok(v)) => Ok(v),
                Ok(Err(e)) => Err(json!({
                    "id": host_id,
                    "label": host_label,
                    "message": e.message,
                })),
                Err(_) => Err(json!({
                    "id": host_id,
                    "label": host_label,
                    "message": "读取超时",
                })),
            }
        }
    });

    let parts = join_all(futures).await;
    let mut lines = Vec::new();
    let mut errors = Vec::new();
    let mut host_stats = Vec::new();

    for part in parts {
        match part {
            Ok((host_meta, mut host_lines)) => {
                host_stats.push(host_meta);
                lines.append(&mut host_lines);
            }
            Err(err) => errors.push(err),
        }
    }

    lines.sort_by(|a, b| match (a.ts_ms, b.ts_ms) {
        (Some(x), Some(y)) => x.cmp(&y).then_with(|| a.host_label.cmp(&b.host_label)),
        (Some(_), None) => std::cmp::Ordering::Less,
        (None, Some(_)) => std::cmp::Ordering::Greater,
        (None, None) => a
            .host_label
            .cmp(&b.host_label)
            .then_with(|| a.line_no.cmp(&b.line_no)),
    });

    if lines.len() > max_lines {
        let skip = lines.len() - max_lines;
        lines = lines.split_off(skip);
    }

    Ok(json!({
        "serviceName": cfg.service_name,
        "logDir": cfg.log_dir,
        "keyword": match_opts.keyword,
        "keywords": match_opts.keywords,
        "matchMode": match_opts.mode,
        "ignoreCase": match_opts.ignore_case,
        "exclude": match_opts.exclude,
        "total": lines.len(),
        "hosts": host_stats,
        "errors": errors,
        "lines": lines.iter().map(line_json).collect::<Vec<_>>(),
    }))
}

fn parse_cursors(params: &Value) -> HashMap<String, FileCursor> {
    let mut out = HashMap::new();
    let Some(obj) = params.get("cursors").and_then(Value::as_object) else {
        return out;
    };
    for (id, value) in obj {
        let path = value
            .get("path")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim()
            .to_string();
        let size = value
            .get("size")
            .and_then(Value::as_u64)
            .unwrap_or(0);
        let inode = value
            .get("inode")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim()
            .to_string();
        if path.is_empty() {
            continue;
        }
        out.insert(
            id.clone(),
            FileCursor {
                path,
                size,
                inode,
            },
        );
    }
    out
}

fn file_name_filters(params: &Value) -> Vec<String> {
    let mut out = Vec::new();
    if let Some(arr) = params.get("files").and_then(Value::as_array) {
        for value in arr {
            if let Some(name) = value.as_str().map(str::trim).filter(|s| !s.is_empty()) {
                out.push(name.to_string());
            }
        }
    }
    if out.is_empty() {
        if let Some(name) = optional_string(params, "file") {
            out.push(name.to_string());
        }
    }
    out
}

fn resolve_servers(cfg: &GroupConfig, params: &Value) -> Result<Vec<ServerSpec>, PluginError> {
    let mut servers = servers_from_params(params, cfg.default_port)?;
    if servers.is_empty() {
        servers = cfg.seed_servers.clone();
    }
    if let Some(ids) = params.get("serverIds").and_then(Value::as_array) {
        let set: Vec<String> = ids
            .iter()
            .filter_map(|v| v.as_str().map(|s| s.to_string()))
            .collect();
        if !set.is_empty() {
            servers.retain(|s| set.iter().any(|id| id == &s.id || id == &s.host));
        }
    }
    Ok(servers)
}

async fn list_matching_files(
    cfg: &GroupConfig,
    server: &ServerSpec,
) -> Result<Vec<(String, u64, String, i64)>, PluginError> {
    let pattern = Pattern::new(&cfg.log_glob)
        .map_err(|_| plugin_err("文件名规则不正确"))?;
    let dir = cfg.log_dir_for(server);
    let entries = ssh_pool::list_dir(cfg, server, dir).await?;
    let mut out = Vec::new();
    for entry in entries {
        if entry.is_dir {
            continue;
        }
        if pattern.matches(&entry.name) {
            let path = join_remote(dir, &entry.name);
            out.push((entry.name, entry.size, path, entry.mtime));
        }
    }
    out.sort_by(|a, b| b.1.cmp(&a.1));
    Ok(out)
}

async fn collect_host(
    cfg: &GroupConfig,
    server: &ServerSpec,
    match_opts: &MatchOpts,
    level_filter: Option<&str>,
    file_filter: &[String],
    max_bytes: u64,
    max_lines: usize,
    prefer_remote_grep: bool,
    time_from: Option<&str>,
    time_to: Option<&str>,
    cursor: Option<FileCursor>,
    older_page: u64,
) -> Result<(Value, Vec<LogLine>), PluginError> {
    let mut files = list_matching_files(cfg, server).await?;
    if !file_filter.is_empty() {
        files.retain(|f| {
            file_filter
                .iter()
                .any(|ff| f.0 == ff.as_str() || f.2.ends_with(ff.as_str()))
        });
    }
    if files.is_empty() {
        return Ok((
            json!({
                "id": server.id,
                "label": server.label,
                "host": server.host,
                "ok": true,
                "fileCount": 0,
                "lineCount": 0,
                "message": "目录下没有匹配的日志文件",
            }),
            Vec::new(),
        ));
    }

    // No selection: the largest file (usually the active log).
    // A multi-select reads each chosen file, capped so one host cannot fan out.
    let targets: Vec<(String, u64, String, i64)> = if file_filter.is_empty() {
        files.iter().take(1).cloned().collect()
    } else {
        files.iter().take(8).cloned().collect()
    };
    let primary = targets[0].clone();
    let mut lines = Vec::new();
    let mut rotated = false;
    let mut next_cursor = FileCursor {
        path: primary.2.clone(),
        size: primary.1,
        inode: String::new(),
    };

    // Follow incremental: same path + growing size → only read new bytes.
    if let Some(prev) = cursor.as_ref() {
        let same_path = prev.path == primary.2 || primary.2.ends_with(&prev.path) || prev.path.ends_with(&primary.0);
        let (size, inode) = ssh_pool::file_stat(cfg, server, &primary.2).await.unwrap_or((primary.1, String::new()));
        next_cursor.size = size;
        next_cursor.inode = inode.clone();
        let inode_ok = prev.inode.is_empty() || inode.is_empty() || prev.inode == inode;
        if same_path && inode_ok && size >= prev.size {
            if size == prev.size {
                let meta = json!({
                    "id": server.id,
                    "label": server.label,
                    "host": server.host,
                    "ok": true,
                    "file": primary.0,
                    "filePath": primary.2,
                    "fileSize": size,
                    "fileInode": inode,
                    "fileCount": files.len(),
                    "lineCount": 0,
                    "incremental": true,
                    "cursor": {
                        "path": next_cursor.path,
                        "size": next_cursor.size,
                        "inode": next_cursor.inode,
                    },
                });
                return Ok((meta, Vec::new()));
            }
            let body = ssh_pool::read_from_offset(cfg, server, &primary.2, prev.size).await?;
            for (idx, row) in body.lines().enumerate() {
                if row.is_empty() {
                    continue;
                }
                if !match_opts.matches(row) {
                    continue;
                }
                if let Some(line) =
                    build_line(server, &primary.0, Some(idx as u64 + 1), row, level_filter)
                {
                    lines.push(line);
                }
            }
            if lines.len() > max_lines {
                let skip = lines.len() - max_lines;
                lines = lines.split_off(skip);
            }
            let meta = json!({
                "id": server.id,
                "label": server.label,
                "host": server.host,
                "ok": true,
                "file": primary.0,
                "filePath": primary.2,
                "fileSize": size,
                "fileInode": inode,
                "fileCount": files.len(),
                "lineCount": lines.len(),
                "incremental": true,
                "cursor": {
                    "path": next_cursor.path,
                    "size": next_cursor.size,
                    "inode": next_cursor.inode,
                },
            });
            return Ok((meta, lines));
        }
        rotated = true;
    }

    for target in &targets {
        let mut got = 0usize;
        if prefer_remote_grep && match_opts.can_remote_grep() {
            let raw = ssh_pool::remote_grep(
                cfg,
                server,
                &target.2,
                &match_opts.remote_patterns(),
                max_lines.saturating_mul(if match_opts.exclude.is_empty() { 1 } else { 3 }),
                match_opts.grep_flags(),
            )
            .await?;
            for row in raw.lines() {
                if let Some((no, text)) = row.split_once(':') {
                    let line_no = no.parse::<u64>().ok();
                    if !match_opts.matches(text) {
                        continue;
                    }
                    if let Some(line) = build_line(server, &target.0, line_no, text, level_filter) {
                        lines.push(line);
                        got += 1;
                    }
                }
            }
        }
        if got > 0 {
            continue;
        }
        let body = if time_from.is_some() || time_to.is_some() {
            ssh_pool::read_time_range(
                cfg,
                server,
                &target.2,
                time_from.unwrap_or("1970-01-01 00:00:00"),
                time_to.unwrap_or("2099-12-31 23:59:59"),
                max_lines,
            )
            .await?
        } else if match_opts.keywords.is_empty() {
            if older_page > 0 && time_from.is_none() && time_to.is_none() {
                ssh_pool::read_older_page(cfg, server, &target.2, older_page as usize, max_lines).await?
            } else {
                ssh_pool::read_tail_lines(cfg, server, &target.2, max_lines).await?
            }
        } else {
            let bytes = ssh_pool::read_tail_bytes(cfg, server, &target.2, max_bytes).await?;
            let text = String::from_utf8_lossy(&bytes);
            if bytes.len() as u64 >= max_bytes {
                text.split_once('\n')
                    .map(|(_, rest)| rest.to_string())
                    .unwrap_or_else(|| text.into_owned())
            } else {
                text.into_owned()
            }
        };
        for (idx, row) in body.lines().enumerate() {
            if !match_opts.matches(row) {
                continue;
            }
            if let Some(line) =
                build_line(server, &target.0, Some(idx as u64 + 1), row, level_filter)
            {
                lines.push(line);
            }
        }
    }

    if lines.len() > max_lines {
        let skip = lines.len() - max_lines;
        lines = lines.split_off(skip);
    }

    if let Ok((size, inode)) = ssh_pool::file_stat(cfg, server, &primary.2).await {
        next_cursor.size = size;
        next_cursor.inode = inode;
    }

    let meta = json!({
        "id": server.id,
        "label": server.label,
        "host": server.host,
        "ok": true,
        "file": primary.0,
        "filePath": primary.2,
        "fileSize": next_cursor.size,
        "fileInode": next_cursor.inode,
        "fileCount": files.len(),
        "lineCount": lines.len(),
        "rotated": rotated,
        "cursor": {
            "path": next_cursor.path,
            "size": next_cursor.size,
            "inode": next_cursor.inode,
        },
    });
    Ok((meta, lines))
}

fn build_line(
    server: &ServerSpec,
    file: &str,
    line_no: Option<u64>,
    text: &str,
    level_filter: Option<&str>,
) -> Option<LogLine> {
    let level = detect_level(text);
    if let Some(want) = level_filter {
        match &level {
            Some(have) if have.eq_ignore_ascii_case(want) => {}
            _ => return None,
        }
    }
    let (ts_ms, ts_raw) = detect_timestamp(text);
    Some(LogLine {
        host_id: server.id.clone(),
        host_label: server.label.clone(),
        host: server.host.clone(),
        file: file.to_string(),
        line_no,
        ts_ms,
        ts_raw,
        level,
        text: text.to_string(),
    })
}

fn line_json(line: &LogLine) -> Value {
    json!({
        "hostId": line.host_id,
        "hostLabel": line.host_label,
        "host": line.host,
        "file": line.file,
        "lineNo": line.line_no,
        "tsMs": line.ts_ms,
        "ts": line.ts_raw,
        "level": line.level,
        "text": line.text,
    })
}

fn detect_level(text: &str) -> Option<String> {
    let upper = text.to_ascii_uppercase();
    for token in ["FATAL", "ERROR", "WARN", "WARNING", "INFO", "DEBUG", "TRACE"] {
        if upper.contains(token) {
            let normalized = match token {
                "WARNING" => "WARN",
                other => other,
            };
            return Some(normalized.to_string());
        }
    }
    None
}

fn detect_timestamp(text: &str) -> (Option<i64>, Option<String>) {
    // ISO-8601-ish: 2024-01-02T15:04:05 or with space / millis / zone
    let re = Regex::new(
        r"(?P<ts>\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:?\d{2})?)",
    )
    .ok();
    let Some(re) = re else {
        return (None, None);
    };
    let Some(caps) = re.captures(text) else {
        return (None, None);
    };
    let raw = caps.name("ts").map(|m| m.as_str().to_string());
    let Some(ref raw_s) = raw else {
        return (None, None);
    };
    let normalized = raw_s.replace(' ', "T");
    let parsed = chrono::DateTime::parse_from_rfc3339(&format_rfc3339_candidate(&normalized))
        .ok()
        .map(|dt| dt.timestamp_millis())
        .or_else(|| {
            chrono::NaiveDateTime::parse_from_str(
                &normalized.trim_end_matches('Z').split('+').next().unwrap_or(&normalized)[..19.min(normalized.len())],
                "%Y-%m-%dT%H:%M:%S",
            )
            .ok()
            .map(|ndt| ndt.and_utc().timestamp_millis())
        });
    (parsed, raw)
}

fn format_rfc3339_candidate(s: &str) -> String {
    if s.ends_with('Z') || s.contains('+') || s.matches('-').count() >= 3 {
        // already has zone or looks like 2024-01-02T03:04:05-08:00
        if s.ends_with('Z') || s.contains('+') || s.rfind('-').map(|i| i > 10).unwrap_or(false) {
            return s.to_string();
        }
    }
    format!("{s}Z")
}

fn join_remote(dir: &str, name: &str) -> String {
    let dir = dir.trim_end_matches('/');
    if dir.is_empty() || dir == "/" {
        format!("/{name}")
    } else {
        format!("{dir}/{name}")
    }
}

pub fn group_id_from_params(params: &Value) -> Result<String, PluginError> {
    if let Ok(id) = required_string(params, "connectionId") {
        return Ok(id.to_string());
    }
    if let Ok(id) = required_string(params, "groupId") {
        return Ok(id.to_string());
    }
    params
        .get("connection")
        .and_then(|c| c.get("id"))
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .ok_or_else(|| plugin_err("请从连接菜单打开"))
}
