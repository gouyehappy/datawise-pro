/* Postman Collection v2.1 import / export. Dependency free, no network calls. */

(function () {
  const util = HC.util;

  const SCHEMA = "https://schema.getpostman.com/json/collection/v2.1.0/collection.json";
  const REDACTED = "{{REDACTED}}";
  const SENSITIVE = /token|secret|password|apikey|api_key/i;
  const RAW_LANGUAGES = {
    json: "application/json", text: "text/plain", javascript: "application/javascript",
    html: "text/html", xml: "application/xml"
  };
  const CONTENT_LANGUAGES = {
    "application/json": "json", "text/plain": "text", "application/javascript": "javascript",
    "text/javascript": "javascript", "text/html": "html", "application/xml": "xml", "text/xml": "xml"
  };

  function text(value) { return value == null ? "" : String(value); }
  function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : null; }
  function array(value) { return Array.isArray(value) ? value : []; }
  function uid(prefix) { return util.uid(prefix); }

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

  /* Postman auth attributes are arrays of { key, value } pairs. */
  function authPairs(auth, type) {
    const pairs = {};
    array(auth && auth[type]).forEach((row) => {
      const pair = object(row);
      if (pair && pair.key) pairs[text(pair.key).toLowerCase()] = text(pair.value);
    });
    return pairs;
  }

  function importAuth(auth) {
    const out = emptyAuth();
    const src = object(auth);
    if (!src) return out;
    const type = text(src.type || "none").toLowerCase();
    if (!type || type === "none" || type === "noauth") return out;
    if (type === "basic" || type === "basicauth") {
      const pairs = authPairs(src, "basic");
      out.type = "basic";
      out.username = pairs.username || text(src.username);
      out.password = pairs.password || text(src.password);
    } else if (type === "bearer" || type === "bearertoken") {
      const pairs = authPairs(src, "bearer");
      out.type = "bearer";
      out.token = pairs.token || text(src.token);
    } else if (type === "apikey" || type === "api-key" || type === "apikeyauth") {
      const pairs = authPairs(src, "apikey");
      out.type = "apikey";
      out.key = pairs.key || text(src.key);
      out.value = pairs.value || text(src.value);
      out.in = (pairs.in || text(src.in) || "header").toLowerCase() === "query" ? "query" : "header";
    } else if (type === "oauth2") {
      /* The workbench has no oauth2 editor; keep the access token as a bearer token. */
      const pairs = authPairs(src, "oauth2");
      out.type = "bearer";
      out.token = pairs.accesstoken || pairs.token || text(src.token);
    }
    return out;
  }

  function importRows(rows) {
    return array(rows).map((row) => {
      const pair = object(row);
      if (!pair || !pair.key) return null;
      return { key: text(pair.key), value: text(pair.value), enabled: pair.disabled !== true };
    }).filter(Boolean);
  }

  function importUrl(url) {
    const out = { url: "", params: [], pathParams: [] };
    if (typeof url === "string") { out.url = url; return out; }
    const src = object(url);
    if (!src) return out;
    out.url = text(src.raw);
    out.params = importRows(src.query);
    out.pathParams = importRows(src.variable).map((row) => Object.assign({ type: "string" }, row));
    return out;
  }

  /* Postman file parts carry no inline bytes; keep them as text fields and
     report how many were downgraded so the caller can warn the user. */
  function importBody(body, counters) {
    const out = emptyBody();
    const src = object(body);
    if (!src) return out;
    const mode = text(src.mode || "none").toLowerCase();
    if (mode === "raw") {
      out.mode = "raw";
      out.raw = text(src.raw);
      const options = object(src.options);
      const rawOptions = options && object(options.raw);
      const language = text(rawOptions && rawOptions.language).toLowerCase();
      out.contentType = RAW_LANGUAGES[language] || "application/json";
    } else if (mode === "urlencoded") {
      out.mode = "urlencoded";
      out.fields = importRows(src.urlencoded);
    } else if (mode === "formdata" || mode === "file") {
      out.mode = "formdata";
      if (mode === "file") {
        const file = object(src.file);
        out.fields.push({ key: "file", value: text(file && file.src), enabled: true, type: "string" });
        counters.warnings += 1;
      } else {
        array(src.formdata).forEach((row) => {
          const pair = object(row);
          if (!pair || !pair.key) return;
          if (text(pair.type).toLowerCase() === "file") {
            out.fields.push({
              key: text(pair.key), value: text(pair.src || pair.value), enabled: pair.disabled !== true, type: "string"
            });
            counters.warnings += 1;
          } else {
            out.fields.push({
              key: text(pair.key), value: text(pair.value), enabled: pair.disabled !== true, type: "string"
            });
          }
        });
      }
    }
    return out;
  }

  function scriptText(script) {
    const src = object(script);
    if (!src) return "";
    if (Array.isArray(src.exec)) return src.exec.map(text).join("\n");
    if (src.exec != null) return text(src.exec);
    return text(src.script || src.content || src.value);
  }

  function importScripts(events) {
    const out = { pre: "", post: "" };
    array(events).forEach((event) => {
      const row = object(event);
      if (!row) return;
      const script = scriptText(row.script);
      if (!script) return;
      const listen = text(row.listen).toLowerCase();
      if (listen === "prerequest") out.pre = out.pre ? `${out.pre}\n${script}` : script;
      else if (listen === "test") out.post = out.post ? `${out.post}\n${script}` : script;
    });
    return out;
  }

  function importItem(item, counters) {
    const src = object(item);
    if (!src) return null;
    if (Array.isArray(src.item)) {
      const folder = {
        kind: "folder",
        id: uid("folder"),
        name: text(src.name) || "Unnamed folder",
        collapsed: false,
        items: []
      };
      src.item.forEach((child) => {
        const node = importItem(child, counters);
        if (node) folder.items.push(node);
      });
      return folder;
    }
    const request = typeof src.request === "string"
      ? { method: "GET", url: src.request }
      : (object(src.request) || {});
    const url = importUrl(request.url);
    const node = {
      kind: "request",
      id: uid("req"),
      name: text(src.name) || text(request.name) || "Unnamed request",
      method: text(request.method || "GET").toUpperCase(),
      url: url.url,
      headers: importRows(request.header),
      params: url.params,
      pathParams: url.pathParams,
      cookies: [],
      body: importBody(request.body, counters),
      auth: importAuth(request.auth),
      scripts: importScripts(src.event),
      options: emptyOptions(),
      clientType: "http"
    };
    counters.count += 1;
    return node;
  }

  /**
   * Parses a Postman Collection v2.1 JSON string or object into the workbench
   * collection shape. Returns { collection, count, warnings } or { error }.
   * `warnings` counts file parts that were downgraded to text fields.
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
    if (!root || !Array.isArray(root.item)) {
      return { error: "Not a Postman Collection v2.1: missing item array" };
    }
    const info = object(root.info) || {};
    const counters = { count: 0, warnings: 0 };
    const collection = { id: uid("col"), name: text(info.name) || "Imported collection", collapsed: false, items: [] };
    root.item.forEach((item) => {
      const node = importItem(item, counters);
      if (node) collection.items.push(node);
    });
    return { collection, count: counters.count, warnings: counters.warnings };
  }

  function shouldRedact(redact, key) { return redact && SENSITIVE.test(text(key)); }

  /* Workbench rows use `enabled`; Postman rows use `disabled`. */
  function pluginRows(rows) {
    return array(rows).map((row) => {
      const pair = object(row);
      if (!pair || !pair.key) return null;
      return { key: text(pair.key), value: text(pair.value), enabled: pair.enabled !== false };
    }).filter(Boolean);
  }

  function exportHeaders(headers, redact) {
    return pluginRows(headers).map((row) => ({
      key: row.key,
      value: shouldRedact(redact, row.key) ? REDACTED : row.value,
      disabled: !row.enabled
    }));
  }

  function exportUrl(request, redact) {
    const raw = text(request.url);
    const query = array(request.params).map((row) => {
      const pair = object(row);
      if (!pair || !pair.key) return null;
      return {
        key: text(pair.key),
        value: shouldRedact(redact, pair.key) ? REDACTED : text(pair.value)
      };
    }).filter(Boolean);
    const variable = array(request.pathParams).map((row) => {
      const pair = object(row);
      if (!pair || !pair.key) return null;
      return { key: text(pair.key), value: text(pair.value) };
    }).filter(Boolean);
    if (!query.length && !variable.length) return raw;
    const url = { raw };
    if (query.length) url.query = query;
    if (variable.length) url.variable = variable;
    return url;
  }

  function exportBody(body) {
    const src = object(body) || {};
    const mode = text(src.mode || "none").toLowerCase();
    if (mode === "raw" && src.raw) {
      const contentType = text(src.contentType).toLowerCase();
      return {
        mode: "raw",
        raw: text(src.raw),
        options: { raw: { language: CONTENT_LANGUAGES[contentType] || "text" } }
      };
    }
    if (mode === "urlencoded") {
      const rows = pluginRows(src.fields).map((row) => ({ key: row.key, value: row.value, disabled: !row.enabled }));
      return { mode: "urlencoded", urlencoded: rows };
    }
    if (mode === "formdata") {
      const rows = array(src.fields).map((row) => {
        const pair = object(row);
        if (!pair || !pair.key) return null;
        if (pair.kind === "file") {
          return { key: text(pair.key), type: "file", src: text(pair.fileName || pair.value), disabled: pair.enabled === false };
        }
        return { key: text(pair.key), type: "text", value: text(pair.value), disabled: pair.enabled === false };
      }).filter(Boolean);
      return { mode: "formdata", formdata: rows };
    }
    return null;
  }

  function exportAuth(auth, redact) {
    const src = object(auth) || {};
    const type = text(src.type || "none").toLowerCase();
    const secret = (value) => (redact ? REDACTED : text(value));
    if (type === "basic") {
      return {
        type: "basic",
        basic: [{ key: "username", value: text(src.username) }, { key: "password", value: secret(src.password) }]
      };
    }
    if (type === "bearer" || type === "oauth2") {
      const key = type === "oauth2" ? "accessToken" : "token";
      const authType = type;
      return { type: authType, [authType]: [{ key, value: secret(src.token) }] };
    }
    if (type === "apikey") {
      return {
        type: "apikey",
        apikey: [
          { key: "key", value: text(src.key) },
          { key: "value", value: secret(src.value) },
          { key: "in", value: text(src.in) || "header" }
        ]
      };
    }
    return { type: "noauth" };
  }

  function exportScripts(scripts) {
    const src = object(scripts) || {};
    const events = [];
    if (src.pre) {
      events.push({ listen: "prerequest", script: { type: "text/javascript", exec: text(src.pre).split("\n") } });
    }
    if (src.post) {
      events.push({ listen: "test", script: { type: "text/javascript", exec: text(src.post).split("\n") } });
    }
    return events;
  }

  function exportItem(item, redact) {
    const src = object(item);
    if (!src) return null;
    if (src.kind === "folder" || (!src.kind && src.method === undefined && Array.isArray(src.items))) {
      const folder = { name: text(src.name) || "Folder", item: [] };
      array(src.items).forEach((child) => {
        const node = exportItem(child, redact);
        if (node) folder.item.push(node);
      });
      return folder;
    }
    const request = {
      method: text(src.method || "GET").toUpperCase(),
      header: exportHeaders(src.headers, redact),
      url: exportUrl(src, redact)
    };
    const body = exportBody(src.body);
    if (body) request.body = body;
    request.auth = exportAuth(src.auth, redact);
    const out = { name: text(src.name) || "Request", request };
    const events = exportScripts(src.scripts);
    if (events.length) out.event = events;
    return out;
  }

  /**
   * Converts a workbench collection into a Postman Collection v2.1 object.
   * With options.redact === true, auth secrets and header/parameter/variable
   * values whose key looks sensitive are replaced with "{{REDACTED}}".
   */
  function exportCollection(collection, options) {
    const src = object(collection) || {};
    const redact = !!(options && options.redact === true);
    const root = {
      info: { name: text(src.name) || "Exported collection", schema: SCHEMA },
      item: []
    };
    array(src.items).forEach((item) => {
      const node = exportItem(item, redact);
      if (node) root.item.push(node);
    });
    if (Array.isArray(src.variables)) {
      root.variable = array(src.variables).map((row) => {
        const pair = object(row);
        if (!pair || !pair.key) return null;
        return {
          key: text(pair.key),
          value: shouldRedact(redact, pair.key) ? REDACTED : text(pair.value)
        };
      }).filter(Boolean);
    }
    if (src.auth) root.auth = exportAuth(src.auth, redact);
    return root;
  }

  window.HC.postman = { importCollection, exportCollection };
})();
