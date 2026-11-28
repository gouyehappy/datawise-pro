//! X-CATALOG: fetch a curated Fig extras JSON pack for the workbench overlay.
//! Network I/O stays in the sidecar so the sandboxed iframe is not blocked by CORS.

use serde_json::{json, Value};

const MAX_BYTES: usize = 400_000;
const FETCH_TIMEOUT_SECS: u64 = 20;

/// Motty-like mirror prefix for GitHub raw when the primary host is unreachable.
const GH_PROXY_PREFIX: &str = "https://ghproxy.com/";

fn is_allowed_catalog_url(url: &str) -> bool {
    let trimmed = url.trim();
    if !(trimmed.starts_with("https://") || trimmed.starts_with("http://")) {
        return false;
    }
    if trimmed.len() > 512 {
        return false;
    }
    // Block obvious SSRF targets; catalog packs are public HTTPS JSON only.
    let lower = trimmed.to_ascii_lowercase();
    if lower.contains("localhost") || lower.contains("127.0.0.1") || lower.contains("0.0.0.0") {
        return false;
    }
    if lower.contains("://[") || lower.contains("://10.") || lower.contains("://192.168.") {
        return false;
    }
    true
}

fn mirror_url(primary: &str) -> Option<String> {
    let trimmed = primary.trim();
    if trimmed.contains("githubusercontent.com") || trimmed.contains("github.com") {
        Some(format!("{GH_PROXY_PREFIX}{trimmed}"))
    } else {
        None
    }
}

async fn fetch_bytes(url: &str) -> Result<Vec<u8>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(FETCH_TIMEOUT_SECS))
        .redirect(reqwest::redirect::Policy::limited(3))
        .build()
        .map_err(|error| format!("http client: {error}"))?;
    let response = client
        .get(url)
        .header(reqwest::header::ACCEPT, "application/json,text/plain,*/*")
        .send()
        .await
        .map_err(|error| format!("fetch failed: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("read body: {error}"))?;
    if bytes.len() > MAX_BYTES {
        return Err(format!("pack larger than {MAX_BYTES} bytes"));
    }
    Ok(bytes.to_vec())
}

/// `completion/catalog/fetch` — returns `{ ok, url, body }` or `{ ok:false, error }`.
pub async fn fetch_catalog_pack(params: &Value) -> Result<Value, String> {
    let url = params
        .get("url")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "url is required".to_string())?;
    if !is_allowed_catalog_url(url) {
        return Err("url is not allowed".to_string());
    }

    let primary = fetch_bytes(url).await;
    let (used_url, bytes) = match primary {
        Ok(bytes) => (url.to_string(), bytes),
        Err(primary_err) => match mirror_url(url) {
            Some(mirror) if is_allowed_catalog_url(&mirror) => {
                match fetch_bytes(&mirror).await {
                    Ok(bytes) => (mirror, bytes),
                    Err(mirror_err) => {
                        return Ok(json!({
                            "ok": false,
                            "error": format!("{primary_err}; mirror: {mirror_err}"),
                        }));
                    }
                }
            }
            _ => {
                return Ok(json!({ "ok": false, "error": primary_err }));
            }
        },
    };

    let body = String::from_utf8(bytes).map_err(|_| "pack is not UTF-8".to_string())?;
    // Cheap structural gate before the UI parses.
    let parsed: Value =
        serde_json::from_str(&body).map_err(|error| format!("invalid JSON: {error}"))?;
    if !parsed.is_object() {
        return Err("pack root must be an object".to_string());
    }
    Ok(json!({
        "ok": true,
        "url": used_url,
        "body": body,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_local_urls() {
        assert!(!is_allowed_catalog_url("http://127.0.0.1/x"));
        assert!(!is_allowed_catalog_url("https://localhost/x"));
        assert!(is_allowed_catalog_url(
            "https://raw.githubusercontent.com/gouyehappy/datawise-pro/main/community-plugins/ssh/catalog/fig-extras.json"
        ));
    }

    #[test]
    fn builds_gh_mirror() {
        let url = "https://raw.githubusercontent.com/a/b/main/c.json";
        assert_eq!(
            mirror_url(url).as_deref(),
            Some("https://ghproxy.com/https://raw.githubusercontent.com/a/b/main/c.json")
        );
    }
}
