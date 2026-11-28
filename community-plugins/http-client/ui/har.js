/* HAR 1.2 import (Chrome / Firefox / Fiddler devtools exports). Dependency free. */

(function () {
  const util = HC.util;

  function text(value) { return value == null ? "" : String(value); }
  function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : null; }
  function array(value) { return Array.isArray(value) ? value : []; }
  function uid(prefix) { return util.uid(prefix); }

  const DROP_HEADERS = /^(host|content-length|connection|accept-encoding|transfer-encoding|cookie)$/i;

  function emptyAuth() {
    return { type: "none", username: "", password: "", token: "", key: "", value: "", in: "header" };
  }

  function emptyBody() {
    return { mode: "none", raw: "", contentType: "application/json", fields: [] };
  }

  function emptyOptions() {
    return {
      timeoutMs: 30000, followRedirects: true, maxRedirects: 10, verifyTls: true,
      proxyMode: "environment", proxyUrl: "", maxBodyBytes: 33554432,
      progressEvents: true, retryCount: 0, retryBackoffMs: 300,
      retryStatuses: [429, 500, 502, 503, 504], retryOnNetwork: false
    };
  }

  function emptyScripts() { return { pre: "", post: "" }; }

  function isHarDocument(document) {
    const root = object(document);
    const log = root && object(root.log);
    return !!(log && Array.isArray(log.entries));
  }

  /* HAR rows use `name`; the workbench uses `key`/`value`/`enabled`. */
  function rows(list) {
    return array(list).map((row) => {
      const pair = object(row);
      if (!pair) return null;
      const key = text(pair.name || pair.key);
      if (!key) return null;
      return {
        key,
        value: text(pair.value),
        description: text(pair.comment),
        enabled: pair.disabled !== true
      };
    }).filter(Boolean);
  }

  function splitUrl(rawUrl, queryString) {
    let base = text(rawUrl);
    let params = rows(queryString);
    try {
      const parsed = new URL(base);
      if (!params.length && parsed.search) {
        parsed.searchParams.forEach((value, key) => params.push({ key, value, description: "", enabled: true }));
      }
      parsed.search = "";
      parsed.hash = "";
      base = parsed.toString();
    } catch (_) {
      /* Keep the raw URL; the workbench can still resolve {{variables}} in it. */
      const q = base.indexOf("?");
      if (q >= 0) base = base.slice(0, q);
    }
    return { url: base, params };
  }

  function urlencodedRows(postData) {
    const fromParams = rows(postData.params);
    if (fromParams.length) return fromParams;
    const raw = text(postData.text);
    if (!raw) return [];
    const decode = (part) => {
      try { return decodeURIComponent(part.replace(/\+/g, " ")); } catch (_) { return part; }
    };
    return raw.split("&").map((part) => {
      const at = part.indexOf("=");
      const key = decode(at < 0 ? part : part.slice(0, at));
      const value = decode(at < 0 ? "" : part.slice(at + 1));
      return { key, value, description: "", enabled: true };
    }).filter((row) => row.key);
  }

  function importBody(postData, counters) {
    const src = object(postData);
    const body = emptyBody();
    if (!src) return body;
    const mime = text(src.mimeType).split(";")[0].trim().toLowerCase();
    const isUrlencoded = /x-www-form-urlencoded/.test(mime);
    const isFormData = /multipart\/form-data/.test(mime);
    if (isUrlencoded || isFormData) {
      body.mode = isFormData ? "formdata" : "urlencoded";
      body.contentType = text(src.mimeType) || (isFormData ? "multipart/form-data" : "application/x-www-form-urlencoded");
      body.fields = (isFormData ? rows(src.params) : urlencodedRows(src)).map((row) => ({
        key: row.key,
        value: row.value,
        description: row.description || "",
        enabled: row.enabled,
        kind: "text"
      }));
      array(src.params).forEach((param) => {
        const p = object(param);
        if (p && (p.fileName || p.contentType)) {
          const field = body.fields.find((row) => row.key === text(p.name));
          if (field) {
            field.kind = "text";
            field.fileName = text(p.fileName);
            field.contentType = text(p.contentType);
            counters.warnings += 1;
          }
        }
      });
      if (!body.fields.length) body.mode = "raw";
      return body;
    }
    body.mode = "raw";
    body.contentType = text(src.mimeType) || "application/json";
    body.raw = text(src.text);
    if (!body.raw && array(src.params).length) body.raw = text(src.params[0] && src.params[0].value);
    return body;
  }

  function entryLabel(entry, usedNames) {
    const request = object(entry && entry.request) || {};
    const method = text(request.method || "GET").toUpperCase();
    let path = "";
    try { path = new URL(text(request.url)).pathname || "/"; } catch (_) { path = text(request.url); }
    const base = `${method} ${path}`;
    let name = base;
    let n = 2;
    while (usedNames.has(name)) { name = `${base} (${n})`; n += 1; }
    usedNames.add(name);
    return name;
  }

  function importEntry(entry, usedNames, counters) {
    const src = object(entry);
    const request = object(src && src.request);
    if (!request || !text(request.url)) return null;
    const rawUrl = text(request.url);
    if (!/^https?:\/\//i.test(rawUrl) && !/^\{\{/.test(rawUrl)) {
      counters.warnings += 1;
      return null;
    }
    const parts = splitUrl(rawUrl, request.queryString);
    const headers = rows(request.headers).filter((row) => !DROP_HEADERS.test(row.key) && row.key.charAt(0) !== ":");
    const cookies = rows(request.cookies);
    if (cookies.length) {
      headers.push({
        key: "Cookie",
        value: cookies.map((row) => `${row.key}=${row.value}`).join("; "),
        description: "",
        enabled: true
      });
    }
    return {
      kind: "request",
      id: uid("req"),
      name: entryLabel(src, usedNames),
      method: text(request.method || "GET").toUpperCase(),
      url: parts.url,
      headers,
      params: parts.params,
      pathParams: [],
      cookies: [],
      body: importBody(request.postData, counters),
      auth: emptyAuth(),
      scripts: emptyScripts(),
      options: emptyOptions(),
      clientType: "http"
    };
  }

  function hostOf(url) {
    try { return new URL(text(url)).host || "Other"; } catch (_) { return "Other"; }
  }

  /**
   * Parses a HAR 1.2 JSON string or object into the workbench collection shape.
   * Entries are grouped into folders by host so a long devtools recording stays
   * browsable. Returns { collection, count, warnings } or { error }.
   */
  function importCollection(source) {
    let data = source;
    if (typeof source === "string") {
      try {
        data = JSON.parse(source.replace(/^\uFEFF/, ""));
      } catch (error) {
        return { error: `Invalid JSON: ${error.message}` };
      }
    }
    const root = object(data);
    const log = root && object(root.log);
    if (!log || !Array.isArray(log.entries)) {
      return { error: "Not a HAR 1.2 document: missing log.entries" };
    }
    const counters = { count: 0, warnings: 0 };
    const usedNames = new Set();
    const groups = new Map();
    array(log.entries).forEach((entry) => {
      const node = importEntry(entry, usedNames, counters);
      if (!node) return;
      const host = hostOf(node.url);
      if (!groups.has(host)) {
        groups.set(host, { kind: "folder", id: uid("folder"), name: host, collapsed: false, items: [] });
      }
      groups.get(host).items.push(node);
      counters.count += 1;
    });
    if (!counters.count) return { error: "No importable HTTP entries found in this HAR" };
    const creator = object(log.creator) || {};
    const name = text(creator.name) ? `HAR · ${text(creator.name)}` : "HAR import";
    const collection = {
      id: uid("col"), name, collapsed: false, source: "har",
      items: Array.from(groups.values())
    };
    return { collection, count: counters.count, warnings: counters.warnings };
  }

  window.HC.har = { isHarDocument, importCollection };
})();
