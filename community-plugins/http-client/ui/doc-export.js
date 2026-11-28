/* Standalone API documentation export (Markdown / self-contained HTML).
   Dependency free, no DOM, no build step. All copy is built in (zh-CN / en),
   so this module never depends on HC.i18n keys. Loaded as a browser IIFE and
   also usable inside a Node vm with a minimal window stub. */

(function () {
  const REDACTED = "{{REDACTED}}";
  const SENSITIVE = /(token|secret|password|passwd|api[_-]?key|authorization|credential|cookie)/i;
  const HTML_ESCAPES = {
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
  };

  /* Built-in copy. `options.lang` selects a table; the host locale is only a
     hint for the default and is never required. */
  const LANG = {
    "zh-CN": {
      generatedAt: "生成时间", totalRequests: "请求总数", toc: "目录", none: "无",
      emptyFolder: "空文件夹（暂无请求）",
      colName: "参数名", colType: "类型/位置", colRequired: "必填",
      colExample: "示例值", colDescription: "说明", yes: "是", no: "否",
      sectionPath: "Path 参数", sectionQuery: "Query 参数", sectionHeaders: "Headers",
      sectionCookies: "Cookie", sectionBody: "Body", sectionAuth: "认证",
      sectionScripts: "脚本", sectionExamples: "响应示例",
      inheritedFrom: "继承自", collection: "集合", folder: "文件夹",
      untitledFolder: "未命名文件夹", untitledRequest: "未命名请求",
      untitledCollection: "我的集合",
      authType: "认证方式", authUsername: "用户名", authPassword: "密码",
      authToken: "Token", authKey: "字段名", authValue: "字段值",
      authIn: "添加到", authNone: "无", authField: "字段", authValueCol: "值",
      bodyContentType: "Content-Type", noBody: "该请求不携带请求体",
      preScript: "预执行脚本", postScript: "后执行脚本", example: "示例"
    },
    "en": {
      generatedAt: "Generated", totalRequests: "Total requests", toc: "Contents",
      none: "None", emptyFolder: "Empty folder (no requests)",
      colName: "Name", colType: "Type / Location", colRequired: "Required",
      colExample: "Example", colDescription: "Description", yes: "Yes", no: "No",
      sectionPath: "Path parameters", sectionQuery: "Query parameters",
      sectionHeaders: "Headers", sectionCookies: "Cookies", sectionBody: "Body",
      sectionAuth: "Authentication", sectionScripts: "Scripts",
      sectionExamples: "Response examples",
      inheritedFrom: "Inherited from", collection: "Collection", folder: "Folder",
      untitledFolder: "Untitled folder", untitledRequest: "Untitled request",
      untitledCollection: "My collection",
      authType: "Type", authUsername: "Username", authPassword: "Password",
      authToken: "Token", authKey: "Key", authValue: "Value", authIn: "Add to",
      authNone: "None", authField: "Field", authValueCol: "Value",
      bodyContentType: "Content-Type", noBody: "This request has no body",
      preScript: "Pre-request script", postScript: "Post-response script",
      example: "Example"
    }
  };

  /* Inlined styles: no external fonts, scripts or stylesheets, so the HTML can
     be opened offline. All strings use single quotes inside CSS to keep the
     surrounding JS strings free of escapes. */
  const CSS = [
    ":root{--bg:#f1f5f9;--panel:#fff;--text:#1e293b;--muted:#64748b;--border:#e2e8f0;--accent:#2563eb}",
    "*{box-sizing:border-box}",
    "body{margin:0;background:var(--bg);color:var(--text);font-size:14px;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans CJK SC',sans-serif}",
    ".layout{display:flex;align-items:flex-start;max-width:1200px;margin:0 auto}",
    ".sidebar{position:sticky;top:0;width:280px;min-width:280px;height:100vh;overflow-y:auto;background:var(--panel);border-right:1px solid var(--border);padding:20px 0}",
    ".side-title{font-weight:700;padding:0 20px 12px;margin-bottom:8px;border-bottom:1px solid var(--border)}",
    ".toc{list-style:none;margin:0;padding:0}",
    ".toc li{padding:4px 16px}",
    ".toc a{display:flex;align-items:center;gap:6px;color:var(--text);text-decoration:none}",
    ".toc a:hover{color:var(--accent)}",
    ".toc-folder a{font-weight:600}",
    ".content{flex:1;min-width:0;padding:28px 32px 80px;background:var(--panel)}",
    ".doc-header h1{margin:0 0 6px;font-size:26px}",
    ".meta{margin:0 0 24px;color:var(--muted);font-size:13px}",
    ".api,.folder{border-top:1px solid var(--border);padding-top:18px;margin-top:24px}",
    ".api h3{display:flex;align-items:center;gap:8px;margin:0 0 8px;font-size:19px}",
    ".folder h2{margin:0;font-size:22px}",
    ".endpoint{margin:0 0 8px;padding:8px 12px;background:#f8fafc;border:1px solid var(--border);border-radius:6px;overflow-x:auto}",
    ".endpoint code{white-space:pre-wrap;word-break:break-all}",
    ".crumb,.hint,.example-title{margin:6px 0;color:var(--muted);font-size:13px}",
    ".example-title{margin-top:14px;color:var(--text);font-weight:600}",
    ".badge{display:inline-block;padding:2px 9px;border-radius:4px;font-size:12px;font-weight:700;color:#fff;letter-spacing:.5px;white-space:nowrap}",
    ".badge-get{background:#2563eb}.badge-post{background:#16a34a}.badge-put{background:#ea580c}.badge-del{background:#dc2626}.badge-other{background:#64748b}",
    "h4{margin:22px 0 8px;padding-left:9px;border-left:3px solid var(--accent);font-size:15px}",
    "table{display:block;width:100%;margin:6px 0 4px;border-collapse:collapse;overflow-x:auto;font-size:13px}",
    "th,td{padding:7px 10px;border:1px solid var(--border);text-align:left;vertical-align:top;word-break:break-word}",
    "th{background:#f1f5f9;font-weight:600;white-space:nowrap}",
    "tbody tr:nth-child(even){background:#f8fafc}",
    "td code,pre code{font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace}",
    "pre{margin:6px 0;padding:12px 14px;background:#0f172a;color:#e2e8f0;border-radius:6px;font-size:12.5px;line-height:1.5;white-space:pre-wrap;word-break:break-word;overflow-x:auto}",
    "pre code{white-space:pre-wrap}",
    ".empty{margin:4px 0;color:var(--muted);font-style:italic}",
    "@media(max-width:820px){.layout{display:block}.sidebar{position:static;width:auto;height:auto;max-height:260px;border-right:0;border-bottom:1px solid var(--border)}.content{padding:20px 16px 60px}}"
  ].join("\n");

  function text(value) { return value == null ? "" : String(value); }
  function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : null; }
  function array(value) { return Array.isArray(value) ? value : []; }
  function pad2(n) { return n < 10 ? "0" + n : String(n); }

  function formatDate(date) {
    const d = date || new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) +
      " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds());
  }

  function normalizeLang(value) {
    const lower = text(value).toLowerCase();
    if (!lower || lower.indexOf("zh") === 0) return "zh-CN";
    return "en";
  }

  /* Prefer the host locale when available, but never require it. Both a
     `locale` getter (this plugin's i18n.js) and a `locale()` function are
     accepted. */
  function defaultLang() {
    try {
      const i18n = window.HC && window.HC.i18n;
      if (i18n) {
        const raw = typeof i18n.locale === "function" ? i18n.locale() : i18n.locale;
        if (raw) return normalizeLang(raw);
      }
    } catch (_) { /* no host locale: fall back to Chinese */ }
    return "zh-CN";
  }

  function escapeHtml(value) {
    return text(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
  }

  function isSensitiveKey(key) { return SENSITIVE.test(text(key)); }

  /* A row keeps its source so inherited rows can be labelled in the document. */
  function normalizeRow(row) {
    const pair = object(row) || {};
    return {
      key: text(pair.key), value: text(pair.value), description: text(pair.description),
      enabled: pair.enabled !== false, kind: text(pair.kind),
      source: text(pair.source), inherited: !!pair.inherited
    };
  }

  function normalizeRows(rows, source) {
    return array(rows).map((row) => {
      const item = normalizeRow(row);
      if (!item.key) return null;
      item.source = source || "";
      item.inherited = !!source;
      return item;
    }).filter(Boolean);
  }

  function authEntries(auth, source) {
    const a = object(auth);
    const type = text(a && a.type || "none").toLowerCase();
    if (!a || !type || type === "none" || type === "noauth") return [];
    return [{ auth: a, source }];
  }

  function isFolder(node) {
    const item = object(node);
    return !!item && (item.kind === "folder" || (!item.kind && Array.isArray(item.items)));
  }

  function isRequest(node) {
    const item = object(node);
    return !!item && (item.kind === "request" ||
      (!item.kind && !Array.isArray(item.items) && (item.url !== undefined || item.method !== undefined)));
  }

  /* Walk the tree once and emit an ordered list of sections. Folders keep
     their heading level, empty folders are preserved, and every request gets
     a stable sequential anchor (api-1, api-2, ...). Inherited collection /
     folder headers and auth are carried along for display. */
  function buildSections(collection, L) {
    const root = object(collection) || {};
    const sections = [];
    let apiIndex = 0;
    let folderIndex = 0;
    const rootInherited = {
      headers: normalizeRows(root.headers, L.collection),
      auths: authEntries(root.auth, L.collection)
    };
    function recurse(items, folderPath, level, inherited) {
      array(items).forEach((node) => {
        const item = object(node);
        if (!item) return;
        if (isFolder(item)) {
          folderIndex += 1;
          const name = text(item.name) || L.untitledFolder;
          const label = L.folder + ": " + name;
          const next = {
            headers: inherited.headers.concat(normalizeRows(item.headers, label)),
            auths: inherited.auths.concat(authEntries(item.auth, label))
          };
          sections.push({
            type: "folder", level, name, anchor: "folder-" + folderIndex,
            folderPath: folderPath.concat([name])
          });
          const children = array(item.items);
          if (!children.length) {
            sections.push({ type: "empty", level: level + 1, folderPath: folderPath.concat([name]) });
          } else {
            recurse(children, folderPath.concat([name]), level + 1, next);
          }
        } else if (isRequest(item)) {
          apiIndex += 1;
          sections.push({
            type: "request", level, index: apiIndex, anchor: "api-" + apiIndex,
            folderPath: folderPath.slice(), request: item,
            inherited: { headers: inherited.headers.slice(), auths: inherited.auths.slice() }
          });
        }
      });
    }
    recurse(root.items, [], 2, rootInherited);
    return sections;
  }

  /* Gather the plaintext credentials that redaction will hide, so the same
     secret is also scrubbed if it appears in a raw body, URL or example. */
  function buildSecrets(entries, redact) {
    if (!redact) return [];
    const list = [];
    function add(value) {
      const v = text(value);
      if (v.length < 6 || list.indexOf(v) >= 0) return;
      list.push(v);
    }
    entries.forEach((entry) => {
      const req = entry.request;
      const auth = object(req.auth);
      if (auth) { add(auth.password); add(auth.token); add(auth.value); }
      const body = object(req.body);
      [req.headers, req.params, req.pathParams, req.cookies, body && body.fields].forEach((rows) => {
        array(rows).forEach((row) => {
          const pair = object(row);
          if (pair && isSensitiveKey(pair.key)) add(pair.value);
        });
      });
      entry.inherited.auths.forEach((item) => {
        const a = object(item.auth);
        if (a) { add(a.password); add(a.token); add(a.value); }
      });
      entry.inherited.headers.forEach((row) => {
        if (isSensitiveKey(row.key)) add(row.value);
      });
    });
    return list;
  }

  function clean(ctx, value) {
    let s = text(value);
    const secrets = ctx.secrets;
    for (let i = 0; i < secrets.length; i += 1) {
      if (s.indexOf(secrets[i]) >= 0) s = s.split(secrets[i]).join(REDACTED);
    }
    return s;
  }

  function escHtml(ctx, value) { return escapeHtml(clean(ctx, value)); }
  function mdInline(ctx, value) {
    return clean(ctx, value).replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r\n|\r|\n/g, " ");
  }
  function mdCell(ctx, value) {
    return clean(ctx, value)
      .replace(/\\/g, "\\\\")
      .replace(/\|/g, "\\|")
      .replace(/`/g, "\\`")
      .replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/\r\n|\r|\n/g, "<br>");
  }
  function mdLinkText(ctx, value) {
    return clean(ctx, value)
      .replace(/\\/g, "\\\\")
      .replace(/\[/g, "\\[").replace(/\]/g, "\\]")
      .replace(/\r\n|\r|\n/g, " ");
  }

  function codeSpan(ctx, value) {
    const s = mdInline(ctx, value);
    const delim = s.indexOf("`") >= 0 ? "``" : "`";
    const pad = (s.charAt(0) === "`" || s.charAt(s.length - 1) === "`") ? " " : "";
    return delim + pad + s + pad + delim;
  }

  function codeLang(contentType) {
    const ct = text(contentType).toLowerCase();
    if (ct.indexOf("json") >= 0) return "json";
    if (ct.indexOf("xml") >= 0) return "xml";
    if (ct.indexOf("html") >= 0) return "html";
    if (ct.indexOf("javascript") >= 0) return "javascript";
    if (ct.indexOf("text/plain") >= 0) return "text";
    return "";
  }

  /* Choose a fence longer than any backtick run in the payload. */
  function fenced(ctx, content, lang) {
    const s = clean(ctx, content);
    let n = 3;
    const runs = s.match(/`{3,}/g);
    if (runs) runs.forEach((run) => { if (run.length >= n) n = run.length + 1; });
    const bar = new Array(n + 1).join("`");
    return bar + lang + "\n" + s + "\n" + bar;
  }

  function heading(level, content) {
    const n = Math.min(Math.max(level, 1), 6);
    return new Array(n + 1).join("#") + " " + content;
  }
  function indent(level) { return new Array(Math.max(0, level - 2) * 2 + 1).join(" "); }

  function normalizeOptions(collection, options) {
    const opt = object(options) || {};
    const lang = normalizeLang(opt.lang || defaultLang());
    const L = LANG[lang] || LANG["zh-CN"];
    const redact = opt.redact === true;
    const sections = buildSections(collection, L);
    const entries = sections.filter((sec) => sec.type === "request");
    return {
      lang, L, redact,
      format: opt.format === "html" ? "html" : "markdown",
      title: text(opt.title) || text(object(collection) && object(collection).name) || L.untitledCollection,
      includeExamples: opt.includeExamples !== false,
      includeAuth: opt.includeAuth !== false,
      includeScripts: opt.includeScripts === true,
      generatedAt: formatDate(new Date()),
      sections, entries, secrets: buildSecrets(entries, redact)
    };
  }

  function valueForRow(ctx, row) {
    if (ctx.redact && isSensitiveKey(row.key) && text(row.value) !== "") return REDACTED;
    return row.value;
  }

  function paramData(ctx, rows, location) {
    const L = ctx.L;
    const headers = [L.colName, L.colType, L.colRequired, L.colExample, L.colDescription];
    const body = array(rows).map((raw) => {
      const row = normalizeRow(raw);
      const description = row.inherited
        ? (L.inheritedFrom + " " + row.source + (row.description ? " · " + row.description : ""))
        : row.description;
      return [row.key, location, row.enabled ? L.yes : L.no, valueForRow(ctx, row), description];
    });
    return { headers, rows: body };
  }

  /* Request headers plus inherited public headers, de-duplicated by key. */
  function headerData(ctx, sec) {
    const own = normalizeRows(sec.request.headers, "");
    const ownKeys = own.map((row) => row.key.toLowerCase());
    const inherited = sec.inherited.headers.filter((row) => ownKeys.indexOf(row.key.toLowerCase()) < 0);
    return paramData(ctx, own.concat(inherited), "header");
  }

  function authTypeName(type) {
    const names = { basic: "Basic", bearer: "Bearer", oauth2: "OAuth2", apikey: "API Key", "api-key": "API Key" };
    return names[type] || type;
  }

  function authRows(ctx, auth) {
    const a = object(auth) || {};
    const type = text(a.type || "none").toLowerCase();
    if (!type || type === "none" || type === "noauth") return [];
    const L = ctx.L;
    const secret = (value) => (ctx.redact && text(value) !== "" ? REDACTED : text(value));
    const rows = [[L.authType, authTypeName(type)]];
    if (type === "basic") {
      rows.push([L.authUsername, text(a.username)]);
      rows.push([L.authPassword, secret(a.password)]);
    } else if (type === "bearer" || type === "oauth2") {
      rows.push([L.authToken, secret(a.token)]);
    } else if (type === "apikey" || type === "api-key") {
      rows.push([L.authKey, text(a.key)]);
      rows.push([L.authValue, secret(a.value)]);
      rows.push([L.authIn, text(a.in) || "header"]);
    } else {
      ["username", "password", "token", "key", "value", "in"].forEach((key) => {
        if (text(a[key]) !== "") {
          rows.push([key, isSensitiveKey(key) ? secret(a[key]) : text(a[key])]);
        }
      });
    }
    return rows;
  }

  function authGroups(ctx, sec) {
    const groups = [];
    const own = authRows(ctx, sec.request.auth);
    if (own.length) groups.push({ label: "", rows: own });
    sec.inherited.auths.forEach((item) => {
      const rows = authRows(ctx, item.auth);
      if (rows.length) groups.push({ label: item.source, rows });
    });
    return groups;
  }

  function examplesOf(sec) {
    return array(sec.request.examples).slice(0, 2).map(object).filter(Boolean);
  }

  function exampleTitle(ctx, example, index) {
    const L = ctx.L;
    const bits = [text(example.name) || (L.example + " " + (index + 1))];
    const status = [text(example.status), text(example.statusText)].filter(Boolean).join(" ");
    if (status) bits.push(status);
    if (text(example.contentType)) bits.push(text(example.contentType));
    return bits.join(" · ");
  }

  function requestName(ctx, sec) { return text(sec.request.name) || ctx.L.untitledRequest; }
  function requestMethod(sec) { return text(sec.request.method || "GET").toUpperCase(); }
  function tocLabel(ctx, sec) { return requestMethod(sec) + " " + requestName(ctx, sec); }

  /* ------------------------------ Markdown ------------------------------ */

  function mdTable(ctx, data) {
    if (!data.rows.length) return ctx.L.none + "\n";
    const head = "| " + data.headers.map((h) => mdCell(ctx, h)).join(" | ") + " |";
    const sep = "| " + data.headers.map(() => "---").join(" | ") + " |";
    const lines = data.rows.map((row) => "| " + row.map((cell) => mdCell(ctx, cell)).join(" | ") + " |");
    return [head, sep].concat(lines).join("\n") + "\n";
  }

  function mdTableSection(out, ctx, level, title, data) {
    out.push(heading(level, mdInline(ctx, title)));
    out.push("");
    out.push(mdTable(ctx, data));
    out.push("");
  }

  function mdBodySection(out, ctx, sec) {
    const L = ctx.L;
    const body = object(sec.request.body) || {};
    const mode = text(body.mode || "none").toLowerCase();
    const level = sec.level + 1;
    out.push(heading(level, mdInline(ctx, L.sectionBody)));
    out.push("");
    if (mode === "raw") {
      out.push("**" + mdInline(ctx, L.bodyContentType) + "**: " + codeSpan(ctx, body.contentType));
      out.push("");
      out.push(fenced(ctx, body.raw, codeLang(body.contentType)));
      out.push("");
    } else if (array(body.fields).length) {
      out.push(mdTable(ctx, paramData(ctx, body.fields, "body")));
      out.push("");
    } else {
      out.push(mdInline(ctx, L.noBody));
      out.push("");
    }
  }

  function mdAuthSection(out, ctx, sec) {
    if (!ctx.includeAuth) return;
    const L = ctx.L;
    const groups = authGroups(ctx, sec);
    out.push(heading(sec.level + 1, mdInline(ctx, L.sectionAuth)));
    out.push("");
    if (!groups.length) {
      out.push(mdInline(ctx, L.authNone));
      out.push("");
      return;
    }
    groups.forEach((group) => {
      if (group.label) {
        out.push("**" + mdInline(ctx, L.inheritedFrom) + " " + mdInline(ctx, group.label) + "**");
        out.push("");
      }
      out.push(mdTable(ctx, { headers: [L.authField, L.authValueCol], rows: group.rows }));
      out.push("");
    });
  }

  function mdScriptsSection(out, ctx, sec) {
    if (!ctx.includeScripts) return;
    const L = ctx.L;
    const scripts = object(sec.request.scripts) || {};
    const pre = text(scripts.pre);
    const post = text(scripts.post);
    if (!pre && !post) return;
    out.push(heading(sec.level + 1, mdInline(ctx, L.sectionScripts)));
    out.push("");
    if (pre) {
      out.push("**" + mdInline(ctx, L.preScript) + "**");
      out.push("");
      out.push(fenced(ctx, pre, "javascript"));
      out.push("");
    }
    if (post) {
      out.push("**" + mdInline(ctx, L.postScript) + "**");
      out.push("");
      out.push(fenced(ctx, post, "javascript"));
      out.push("");
    }
  }

  function mdExamplesSection(out, ctx, sec) {
    if (!ctx.includeExamples) return;
    const L = ctx.L;
    const list = examplesOf(sec);
    if (!list.length) return;
    out.push(heading(sec.level + 1, mdInline(ctx, L.sectionExamples)));
    out.push("");
    list.forEach((example, index) => {
      out.push("**" + mdInline(ctx, exampleTitle(ctx, example, index)) + "**");
      out.push("");
      if (text(example.body)) {
        out.push(fenced(ctx, example.body, codeLang(example.contentType)));
        out.push("");
      }
    });
  }

  function renderRequestMarkdown(out, sec, ctx) {
    const L = ctx.L;
    out.push(heading(sec.level, "<a id=\"" + sec.anchor + "\"></a> " + sec.index + ". " + mdInline(ctx, requestName(ctx, sec))));
    out.push("");
    out.push("**" + mdInline(ctx, requestMethod(sec)) + "** " + codeSpan(ctx, sec.request.url));
    out.push("");
    if (sec.folderPath.length) {
      out.push("> " + mdInline(ctx, L.folder) + ": " + mdInline(ctx, sec.folderPath.join(" / ")));
      out.push("");
    }
    mdTableSection(out, ctx, sec.level + 1, L.sectionPath, paramData(ctx, sec.request.pathParams, "path"));
    mdTableSection(out, ctx, sec.level + 1, L.sectionQuery, paramData(ctx, sec.request.params, "query"));
    mdTableSection(out, ctx, sec.level + 1, L.sectionHeaders, headerData(ctx, sec));
    mdTableSection(out, ctx, sec.level + 1, L.sectionCookies, paramData(ctx, sec.request.cookies, "cookie"));
    mdBodySection(out, ctx, sec);
    mdAuthSection(out, ctx, sec);
    mdScriptsSection(out, ctx, sec);
    mdExamplesSection(out, ctx, sec);
  }

  function renderMarkdown(collection, ctx) {
    const L = ctx.L;
    const out = [];
    out.push("# " + mdInline(ctx, ctx.title));
    out.push("");
    out.push("> " + mdInline(ctx, L.generatedAt) + ": " + ctx.generatedAt +
      " · " + mdInline(ctx, L.totalRequests) + ": " + ctx.entries.length);
    out.push("");
    out.push("## " + mdInline(ctx, L.toc));
    out.push("");
    ctx.sections.forEach((sec) => {
      if (sec.type === "folder") {
        out.push(indent(sec.level) + "- [" + mdLinkText(ctx, sec.name) + "](#" + sec.anchor + ")");
      } else if (sec.type === "request") {
        out.push(indent(sec.level) + "- [" + mdLinkText(ctx, tocLabel(ctx, sec)) + "](#" + sec.anchor + ")");
      }
    });
    out.push("");
    ctx.sections.forEach((sec) => {
      if (sec.type === "folder") {
        out.push(heading(sec.level, "<a id=\"" + sec.anchor + "\"></a> " + mdInline(ctx, sec.name)));
        out.push("");
      } else if (sec.type === "empty") {
        out.push("*(" + mdInline(ctx, L.emptyFolder) + ")*");
        out.push("");
      } else if (sec.type === "request") {
        renderRequestMarkdown(out, sec, ctx);
      }
    });
    return out.join("\n") + "\n";
  }

  /* -------------------------------- HTML -------------------------------- */

  function methodClass(method) {
    const m = text(method).toUpperCase();
    if (m === "GET") return "get";
    if (m === "POST") return "post";
    if (m === "PUT" || m === "PATCH") return "put";
    if (m === "DELETE") return "del";
    return "other";
  }

  function badgeHtml(method) {
    const m = text(method || "GET").toUpperCase();
    return "<span class=\"badge badge-" + methodClass(m) + "\">" + escapeHtml(m) + "</span>";
  }

  function htmlTable(parts, ctx, data) {
    if (!data.rows.length) {
      parts.push("<p class=\"empty\">" + escHtml(ctx, ctx.L.none) + "</p>");
      return;
    }
    parts.push("<table><thead><tr>" +
      data.headers.map((h) => "<th>" + escHtml(ctx, h) + "</th>").join("") +
      "</tr></thead><tbody>");
    data.rows.forEach((row) => {
      parts.push("<tr>" + row.map((cell) => "<td>" + escHtml(ctx, cell) + "</td>").join("") + "</tr>");
    });
    parts.push("</tbody></table>");
  }

  function htmlTableSection(parts, ctx, title, data) {
    parts.push("<h4>" + escHtml(ctx, title) + "</h4>");
    htmlTable(parts, ctx, data);
  }

  function htmlBodySection(parts, ctx, sec) {
    const L = ctx.L;
    const body = object(sec.request.body) || {};
    const mode = text(body.mode || "none").toLowerCase();
    parts.push("<h4>" + escHtml(ctx, L.sectionBody) + "</h4>");
    if (mode === "raw") {
      parts.push("<p class=\"hint\">" + escHtml(ctx, L.bodyContentType) + ": <code>" +
        escHtml(ctx, body.contentType) + "</code></p>");
      parts.push("<pre><code>" + escHtml(ctx, body.raw) + "</code></pre>");
    } else if (array(body.fields).length) {
      htmlTable(parts, ctx, paramData(ctx, body.fields, "body"));
    } else {
      parts.push("<p class=\"empty\">" + escHtml(ctx, L.noBody) + "</p>");
    }
  }

  function htmlAuthSection(parts, ctx, sec) {
    if (!ctx.includeAuth) return;
    const L = ctx.L;
    parts.push("<h4>" + escHtml(ctx, L.sectionAuth) + "</h4>");
    const groups = authGroups(ctx, sec);
    if (!groups.length) {
      parts.push("<p class=\"empty\">" + escHtml(ctx, L.authNone) + "</p>");
      return;
    }
    groups.forEach((group) => {
      if (group.label) {
        parts.push("<p class=\"hint\">" + escHtml(ctx, L.inheritedFrom) + " " + escHtml(ctx, group.label) + "</p>");
      }
      htmlTable(parts, ctx, { headers: [L.authField, L.authValueCol], rows: group.rows });
    });
  }

  function htmlScriptsSection(parts, ctx, sec) {
    if (!ctx.includeScripts) return;
    const L = ctx.L;
    const scripts = object(sec.request.scripts) || {};
    const pre = text(scripts.pre);
    const post = text(scripts.post);
    if (!pre && !post) return;
    parts.push("<h4>" + escHtml(ctx, L.sectionScripts) + "</h4>");
    if (pre) {
      parts.push("<p class=\"hint\">" + escHtml(ctx, L.preScript) + "</p>");
      parts.push("<pre><code>" + escHtml(ctx, pre) + "</code></pre>");
    }
    if (post) {
      parts.push("<p class=\"hint\">" + escHtml(ctx, L.postScript) + "</p>");
      parts.push("<pre><code>" + escHtml(ctx, post) + "</code></pre>");
    }
  }

  function htmlExamplesSection(parts, ctx, sec) {
    if (!ctx.includeExamples) return;
    const L = ctx.L;
    const list = examplesOf(sec);
    if (!list.length) return;
    parts.push("<h4>" + escHtml(ctx, L.sectionExamples) + "</h4>");
    list.forEach((example, index) => {
      parts.push("<p class=\"example-title\">" + escHtml(ctx, exampleTitle(ctx, example, index)) + "</p>");
      if (text(example.body)) {
        parts.push("<pre><code>" + escHtml(ctx, example.body) + "</code></pre>");
      }
    });
  }

  function renderRequestHtml(parts, sec, ctx) {
    const L = ctx.L;
    parts.push("<section class=\"api\" id=\"" + sec.anchor + "\">");
    parts.push("<h3>" + badgeHtml(requestMethod(sec)) + " " + escHtml(ctx, requestName(ctx, sec)) + "</h3>");
    parts.push("<p class=\"endpoint\"><code>" + escHtml(ctx, sec.request.url) + "</code></p>");
    if (sec.folderPath.length) {
      parts.push("<p class=\"crumb\">" + escHtml(ctx, L.folder) + ": " +
        escHtml(ctx, sec.folderPath.join(" / ")) + "</p>");
    }
    htmlTableSection(parts, ctx, L.sectionPath, paramData(ctx, sec.request.pathParams, "path"));
    htmlTableSection(parts, ctx, L.sectionQuery, paramData(ctx, sec.request.params, "query"));
    htmlTableSection(parts, ctx, L.sectionHeaders, headerData(ctx, sec));
    htmlTableSection(parts, ctx, L.sectionCookies, paramData(ctx, sec.request.cookies, "cookie"));
    htmlBodySection(parts, ctx, sec);
    htmlAuthSection(parts, ctx, sec);
    htmlScriptsSection(parts, ctx, sec);
    htmlExamplesSection(parts, ctx, sec);
    parts.push("</section>");
  }

  function renderHtml(collection, ctx) {
    const L = ctx.L;
    const parts = [];
    parts.push("<!doctype html><html lang=\"" + (ctx.lang === "en" ? "en" : "zh-CN") +
      "\"><head><meta charset=\"utf-8\">");
    parts.push("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">");
    parts.push("<title>" + escHtml(ctx, ctx.title) + "</title>");
    parts.push("<style>" + CSS + "</style>");
    parts.push("</head><body>");
    parts.push("<div class=\"layout\">");
    parts.push("<nav class=\"sidebar\"><div class=\"side-title\">" + escHtml(ctx, L.toc) + "</div><ul class=\"toc\">");
    ctx.sections.forEach((sec) => {
      if (sec.type === "folder") {
        parts.push("<li class=\"toc-folder\" style=\"padding-left:" + (8 + (sec.level - 2) * 14) +
          "px\"><a href=\"#" + sec.anchor + "\">" + escHtml(ctx, sec.name) + "</a></li>");
      } else if (sec.type === "request") {
        parts.push("<li class=\"toc-api\" style=\"padding-left:" + (8 + (sec.level - 2) * 14) +
          "px\"><a href=\"#" + sec.anchor + "\">" + badgeHtml(requestMethod(sec)) + " " +
          escHtml(ctx, requestName(ctx, sec)) + "</a></li>");
      }
    });
    parts.push("</ul></nav>");
    parts.push("<main class=\"content\">");
    parts.push("<header class=\"doc-header\"><h1>" + escHtml(ctx, ctx.title) + "</h1>");
    parts.push("<p class=\"meta\">" + escHtml(ctx, L.generatedAt) + ": " + escHtml(ctx, ctx.generatedAt) +
      " &middot; " + escHtml(ctx, L.totalRequests) + ": " + ctx.entries.length + "</p></header>");
    ctx.sections.forEach((sec) => {
      if (sec.type === "folder") {
        parts.push("<section class=\"folder\" id=\"" + sec.anchor + "\"><h2>" +
          escHtml(ctx, sec.name) + "</h2></section>");
      } else if (sec.type === "empty") {
        parts.push("<p class=\"empty\">" + escHtml(ctx, L.emptyFolder) + "</p>");
      } else if (sec.type === "request") {
        renderRequestHtml(parts, sec, ctx);
      }
    });
    parts.push("</main></div></body></html>");
    return parts.join("\n");
  }

  /* ------------------------------- Public ------------------------------- */

  function generate(collection, options) {
    const ctx = normalizeOptions(collection, options);
    return ctx.format === "html" ? renderHtml(collection, ctx) : renderMarkdown(collection, ctx);
  }

  function generateMarkdown(collection, options) {
    const merged = Object.assign({}, object(options) || {}, { format: "markdown" });
    return renderMarkdown(collection, normalizeOptions(collection, merged));
  }

  function generateHtml(collection, options) {
    const merged = Object.assign({}, object(options) || {}, { format: "html" });
    return renderHtml(collection, normalizeOptions(collection, merged));
  }

  /** Returns every request as { folderPath: [names], request: node }, in tree order. */
  function collectRequests(collection) {
    return buildSections(collection, LANG["zh-CN"])
      .filter((sec) => sec.type === "request")
      .map((sec) => ({ folderPath: sec.folderPath.slice(), request: sec.request }));
  }

  window.HC = window.HC || {};
  window.HC.docExport = { generate, generateMarkdown, generateHtml, collectRequests };
})();
