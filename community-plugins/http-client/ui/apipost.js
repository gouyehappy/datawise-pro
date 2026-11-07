/* ApiPost export → DataWise HTTP Client collections / environments.
   Flatten nested children + parent_id into one graph, then rebuild the tree. */

(function () {
  function unwrapDocument(doc) {
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) return doc;
    const data = doc.data;
    if (!data || typeof data !== "object" || Array.isArray(data)) return doc;
    const hasPayload = !!(data.project || data.apis || data.api || data.env || data.envs
      || data.environment || data.environments || data.models);
    if (!hasPayload) return doc;
    // ApiPost / gateway wrappers: { code, data: { project, apis, envs } }
    return Object.assign({}, doc, data);
  }

  function isApipostDocument(doc) {
    const root = unwrapDocument(doc);
    if (!root || typeof root !== "object" || Array.isArray(root)) return false;
    const envs = normalizeEnvs(root);
    if (envs.length) return true;
    const apis = normalizeApis(root);
    if (!apis) return false;
    return !!(root.project || root.api || root.models || apis.length);
  }

  function normalizeApis(doc) {
    if (Array.isArray(doc.apis)) return doc.apis;
    if (Array.isArray(doc.api)) return doc.api;
    if (doc.data && Array.isArray(doc.data.apis)) return doc.data.apis;
    if (doc.data && Array.isArray(doc.data.api)) return doc.data.api;
    if (doc.apis && typeof doc.apis === "object") return Object.keys(doc.apis).map((key) => doc.apis[key]).filter(Boolean);
    return null;
  }

  function asEnvList(raw) {
    if (!raw) return [];
    if (typeof raw === "string") {
      try {
        return asEnvList(JSON.parse(raw));
      } catch (error) {
        return [];
      }
    }
    if (Array.isArray(raw)) return raw.filter((item) => item && typeof item === "object");
    if (typeof raw === "object") {
      // Single env object, or id → env map.
      if (raw.list != null || raw.pre_url != null || raw.env_vars != null || raw.variables != null || raw.values != null
        || raw.server != null || raw.base_url != null || raw.baseUrl != null || raw.name != null || raw.env_name != null) {
        // Prefer treating as one env when it looks like env fields; otherwise id-map.
        const keys = Object.keys(raw);
        const looksLikeMap = keys.length > 0 && keys.every((key) => {
          const item = raw[key];
          return item && typeof item === "object" && (item.list != null || item.pre_url != null || item.name != null || item.env_vars != null);
        }) && raw.list == null && raw.pre_url == null && raw.name == null;
        if (looksLikeMap) {
          return keys.map((key) => raw[key]).filter((item) => item && typeof item === "object");
        }
        return [raw];
      }
      return Object.keys(raw)
        .map((key) => raw[key])
        .filter((item) => item && typeof item === "object");
    }
    return [];
  }

  function normalizeEnvs(doc) {
    if (!doc || typeof doc !== "object") return [];
    const candidates = [
      doc.env,
      doc.envs,
      doc.environment,
      doc.environments,
      doc.global && doc.global.envs,
      doc.global && doc.global.env,
      doc.data && doc.data.env,
      doc.data && doc.data.envs,
      doc.data && doc.data.global && doc.data.global.envs,
      doc.project && doc.project.env,
      doc.project && doc.project.envs
    ];
    for (let i = 0; i < candidates.length; i += 1) {
      const list = asEnvList(candidates[i]);
      if (list.length) return list;
    }
    return [];
  }

  function envBaseUrl(env) {
    if (!env || typeof env !== "object") return "";
    if (env.pre_url) return String(env.pre_url);
    if (env.server) return String(env.server);
    if (env.base_url) return String(env.base_url);
    if (env.baseUrl) return String(env.baseUrl);
    const servers = env.server_list || env.servers;
    if (Array.isArray(servers)) {
      for (let i = 0; i < servers.length; i += 1) {
        const uri = servers[i] && (servers[i].uri || servers[i].url || servers[i].pre_url);
        if (uri) return String(uri);
      }
    }
    return "";
  }

  function checked(row) {
    if (!row) return false;
    if (row.is_checked === 0 || row.is_checked === -1 || row.is_checked === false) return false;
    return true;
  }

  function normalizeFieldType(raw) {
    const text = String(raw || "string").toLowerCase();
    if (text === "int" || text === "integer") return "integer";
    if (text === "float" || text === "double" || text === "number") return "number";
    if (text === "bool" || text === "boolean") return "boolean";
    if (text === "array") return "array";
    if (text === "object") return "object";
    if (text === "file") return "string";
    return "string";
  }

  function paramRows(list) {
    const source = Array.isArray(list) ? list : [];
    const rows = source
      .filter((row) => row && String(row.key || "").trim() !== "")
      .map((row) => ({
        key: String(row.key || ""),
        value: row.value === undefined || row.value === null ? "" : String(row.value),
        description: row.description == null && row.desc == null ? "" : String(row.description || row.desc || ""),
        type: normalizeFieldType(row.field_type || row.type || row.fieldType),
        enabled: checked(row)
      }));
    rows.push({ key: "", value: "", description: "", type: "string", enabled: true });
    return rows;
  }

  function mapBody(body) {
    const empty = { mode: "none", raw: "", contentType: "application/json", fields: [] };
    if (!body || typeof body !== "object") return empty;
    const mode = String(body.mode || "none").toLowerCase();
    if (mode === "none" || mode === "") return empty;
    if (mode === "form-data" || mode === "formdata") {
      return {
        mode: "formdata",
        raw: "",
        contentType: "",
        fields: (body.parameter || []).map((row) => ({
          key: String(row.key || ""),
          value: row.type === "File" || row.field_type === "File" ? "" : String(row.value == null ? "" : row.value),
          description: row.description == null && row.desc == null ? "" : String(row.description || row.desc || ""),
          type: "string",
          enabled: checked(row),
          kind: row.type === "File" || row.field_type === "File" ? "file" : "text",
          fileName: "",
          contentType: "",
          dataBase64: ""
        })).concat([{ key: "", value: "", description: "", type: "string", enabled: true }])
      };
    }
    if (mode === "urlencoded" || mode === "x-www-form-urlencoded") {
      return {
        mode: "urlencoded",
        raw: "",
        contentType: "application/x-www-form-urlencoded",
        fields: paramRows(body.parameter)
      };
    }
    const contentType =
      mode === "json" ? "application/json"
        : mode === "xml" ? "application/xml"
          : mode === "html" ? "text/html"
            : mode === "javascript" ? "application/javascript"
              : mode === "plain" || mode === "text" ? "text/plain"
                : (body.contentType || "application/json");
    return {
      mode: "raw",
      raw: body.raw == null ? "" : String(body.raw),
      contentType,
      fields: []
    };
  }

  function mapAuth(auth) {
    const out = { type: "none", username: "", password: "", token: "", key: "", value: "", in: "header" };
    if (!auth || typeof auth !== "object") return out;
    const type = String(auth.type || auth.auth_type || "none").toLowerCase();
    if (type === "noauth" || type === "none" || type === "") return out;
    if (type === "bearer" || type === "bearertoken") {
      out.type = "bearer";
      out.token = String(auth.bearer && (auth.bearer.key || auth.bearer.token) || auth.token || auth.key || "");
    } else if (type === "basic" || type === "basicauth") {
      out.type = "basic";
      out.username = String(auth.basic && auth.basic.username || auth.username || "");
      out.password = String(auth.basic && auth.basic.password || auth.password || "");
    } else if (type === "apikey" || type === "api-key" || type === "kv") {
      out.type = "apikey";
      out.key = String(auth.apikey && auth.apikey.key || auth.key || "");
      out.value = String(auth.apikey && auth.apikey.value || auth.value || "");
      out.in = String(auth.apikey && auth.apikey.in || auth.in || "header").toLowerCase() === "query" ? "query" : "header";
    }
    return out;
  }

  function mapScripts(eventOrScript) {
    const sources = [];
    if (eventOrScript && typeof eventOrScript === "object") sources.push(eventOrScript);
    const pick = (obj, keys) => {
      if (!obj) return "";
      for (let i = 0; i < keys.length; i += 1) {
        const value = obj[keys[i]];
        if (value == null || value === "") continue;
        if (Array.isArray(value)) {
          const joined = value.map((item) => {
            if (item == null) return "";
            if (typeof item === "string") return item;
            return String(item.script || item.content || item.code || item.value || "");
          }).filter(Boolean).join("\n");
          if (joined) return joined;
          continue;
        }
        if (typeof value === "object") {
          const nested = value.script || value.content || value.code || value.value;
          if (nested) return String(nested);
          continue;
        }
        return String(value);
      }
      return "";
    };
    let pre = "";
    let post = "";
    sources.forEach((source) => {
      if (!pre) {
        pre = pick(source, ["pre_script", "prescript", "pre", "preScript", "pre_request", "prerequest"]);
      }
      if (!post) {
        post = pick(source, ["test", "after_script", "post_script", "post", "postScript", "test_script", "tests"]);
      }
    });
    return { pre, post };
  }

  function stripQuery(url) {
    const text = String(url || "");
    const index = text.indexOf("?");
    return index < 0 ? text : text.slice(0, index);
  }

  function cleanName(name, method, rawUrl) {
    let title = String(name || "").trim();
    if (title) {
      title = title.split("?")[0].trim();
      if (title) return title;
    }
    const path = stripQuery(rawUrl);
    if (path) {
      try {
        if (/^https?:\/\//i.test(path)) return new URL(path).pathname || path;
      } catch (error) { /* keep path */ }
      return path;
    }
    return method || "未命名接口";
  }

  function bySort(a, b) {
    const sa = Number(a && a.sort);
    const sb = Number(b && b.sort);
    if (Number.isFinite(sa) && Number.isFinite(sb) && sa !== sb) return sa - sb;
    return String((a && a.name) || "").localeCompare(String((b && b.name) || ""), "zh");
  }

  function nodeId(node, fallback) {
    const raw = node.target_id || node.targetId || node.uuid || node.id || node.api_id || node.folder_id;
    if (raw !== undefined && raw !== null && String(raw) !== "") return String(raw);
    return fallback;
  }

  function parentIdOf(node) {
    const raw = node.parent_id !== undefined ? node.parent_id
      : (node.parentId !== undefined ? node.parentId
        : (node.pid !== undefined ? node.pid
          : node.parent_uuid));
    if (raw === undefined || raw === null || raw === "" || raw === 0 || raw === "0" || raw === -1 || raw === "-1") {
      return "0";
    }
    return String(raw);
  }

  function isFolderNode(node) {
    const explicit = String(node.target_type || node.targetType || node.type || "").toLowerCase();
    if (explicit === "folder" || explicit === "dir" || explicit === "directory" || explicit === "group") return true;
    if (explicit === "api" || explicit === "http" || explicit === "websocket" || explicit === "socket" || explicit === "doc") return false;
    if (node.method || node.url || (node.request && (node.request.url || node.request.method || node.request.body))) return false;
    // Only treat as folder when there are real nested children — ApiPost APIs often ship with children: [].
    if (Array.isArray(node.children) && node.children.length > 0) return true;
    return false;
  }

  function mapRequest(node, baseUrl) {
    const req = node.request || {};
    const method = String(node.method || req.method || "GET").toUpperCase();
    const rawUrl = req.url || node.mock_url || node.url || "";
    let path = stripQuery(rawUrl);
    const queryFromUrl = [];
    const qIndex = String(rawUrl).indexOf("?");
    if (qIndex >= 0) {
      String(rawUrl).slice(qIndex + 1).split("&").forEach((pair) => {
        if (!pair) return;
        const eq = pair.indexOf("=");
        const key = eq < 0 ? pair : pair.slice(0, eq);
        const value = eq < 0 ? "" : pair.slice(eq + 1);
        try {
          queryFromUrl.push({
            key: decodeURIComponent(key.replace(/\+/g, " ")),
            value: decodeURIComponent(value.replace(/\+/g, " ")),
            enabled: true
          });
        } catch (error) {
          queryFromUrl.push({ key, value, enabled: true });
        }
      });
    }
    let url = path;
    if (baseUrl && url && !/^https?:\/\//i.test(url) && url.indexOf("{{") < 0) {
      url = "{{baseUrl}}" + (url.startsWith("/") ? url : "/" + url);
    } else if (!url && baseUrl) {
      url = "{{baseUrl}}";
    }
    const queryDeclared = paramRows(req.query && req.query.parameter);
    const queryKeys = new Set(queryDeclared.filter((row) => row.key).map((row) => row.key));
    queryFromUrl.forEach((row) => {
      if (!row.key || queryKeys.has(row.key)) return;
      queryDeclared.splice(queryDeclared.length - 1, 0, row);
      queryKeys.add(row.key);
    });
    const headers = paramRows(req.header && req.header.parameter);
    const pathParams = paramRows(req.resful && req.resful.parameter);
    pathParams.filter((row) => row.key && row.enabled !== false).forEach((row) => {
      const token = `:${row.key}`;
      const brace = `{{${row.key}}}`;
      if (url.indexOf(token) >= 0) url = url.split(token).join(row.value || brace);
      else if (url.indexOf(`{${row.key}}`) >= 0) url = url.split(`{${row.key}}`).join(row.value || brace);
    });
    return {
      kind: "request",
      id: "",
      name: cleanName(node.name, method, path),
      method,
      url,
      headers,
      params: queryDeclared,
      body: mapBody(req.body),
      auth: mapAuth(req.auth),
      options: {},
      scripts: mapScripts(Object.assign({}, req.event || {}, req.script || {}, node.script || {}, node.event || {})),
      sort: node.sort
    };
  }

  function mapFolder(node, childrenItems) {
    return {
      kind: "folder",
      id: "",
      name: String(node.name || "文件夹").trim() || "文件夹",
      collapsed: true,
      items: sortItems(childrenItems || []),
      sort: node.sort
    };
  }

  function sortItems(items) {
    const folders = [];
    const requests = [];
    (items || []).forEach((item) => {
      if (item.kind === "folder") folders.push(item);
      else requests.push(item);
    });
    folders.sort(bySort);
    requests.sort(bySort);
    return folders.concat(requests);
  }

  /* Walk nested children into a flat list; honor explicit parent_id when set. */
  function flattenNodes(nodes, inheritedParent, out, seen) {
    (nodes || []).forEach((node, index) => {
      if (!node || typeof node !== "object") return;
      const id = nodeId(node, `gen-${inheritedParent}-${index}-${out.length}`);
      if (seen.has(id)) {
        // Same node may appear in children and top-level; keep first, still walk children.
      } else {
        seen.add(id);
        const hasExplicitParent = Object.prototype.hasOwnProperty.call(node, "parent_id")
          || Object.prototype.hasOwnProperty.call(node, "parentId")
          || Object.prototype.hasOwnProperty.call(node, "pid")
          || Object.prototype.hasOwnProperty.call(node, "parent_uuid");
        // When walking a nested children[] array, prefer the tree parent over a
        // stamped parent_id:"0" that many ApiPost exports put on every node.
        let parent = inheritedParent || "0";
        if (hasExplicitParent) {
          const explicit = parentIdOf(node);
          if (inheritedParent && inheritedParent !== "0" && (explicit === "0" || !explicit)) {
            parent = inheritedParent;
          } else {
            parent = explicit || inheritedParent || "0";
          }
        }
        out.push({ node, id, parent, sort: node.sort });
      }
      if (Array.isArray(node.children) && node.children.length) {
        flattenNodes(node.children, id, out, seen);
      }
    });
  }

  function buildTree(flat, baseUrl) {
    const byId = new Map();
    flat.forEach((entry) => byId.set(entry.id, entry));
    const childrenOf = new Map();
    const roots = [];

    flat.forEach((entry) => {
      let parent = entry.parent;
      if (parent && parent !== "0" && !byId.has(parent)) {
        // Dangling parent → treat as root rather than drop the node.
        parent = "0";
      }
      if (!parent || parent === "0" || parent === entry.id) {
        roots.push(entry);
        return;
      }
      if (!childrenOf.has(parent)) childrenOf.set(parent, []);
      childrenOf.get(parent).push(entry);
    });

    function materialize(entry) {
      const kids = (childrenOf.get(entry.id) || []).slice().sort(bySort);
      if (isFolderNode(entry.node)) {
        return mapFolder(entry.node, kids.map(materialize).filter(Boolean));
      }
      const request = mapRequest(entry.node, baseUrl);
      if (!kids.length) return request;
      // API that owns nested children → folder wrapping the request + kids
      return mapFolder(
        { name: request.name, sort: entry.node.sort },
        [request].concat(kids.map(materialize).filter(Boolean))
      );
    }

    return sortItems(roots.slice().sort(bySort).map(materialize).filter(Boolean));
  }

  function mapTree(nodes, baseUrl) {
    if (!nodes || !nodes.length) return [];
    const flat = [];
    flattenNodes(nodes, "0", flat, new Set());
    return buildTree(flat, baseUrl);
  }

  function envVariables(env) {
    const rows = [];
    const seen = new Set();
    const pushRow = (key, value, enabled) => {
      const name = String(key || "").trim();
      if (!name || seen.has(name)) return;
      seen.add(name);
      rows.push({
        key: name,
        value: String(value == null ? "" : value),
        enabled: enabled !== false
      });
    };
    const readValue = (row) => {
      if (row == null) return "";
      if (typeof row !== "object") return row;
      // ApiPost: current_value is the live value; null means fall back to value.
      if (row.current_value != null) return row.current_value;
      if (row.value != null) return row.value;
      if (row.initial_value != null) return row.initial_value;
      if (row.variable_value != null) return row.variable_value;
      return "";
    };
    const ingestList = (list) => {
      if (Array.isArray(list)) {
        list.forEach((row) => {
          if (!row) return;
          const key = row.key || row.name || row.variable_name || row.var_name;
          if (!key) return;
          const enabled = row.is_checked === undefined && row.enabled === undefined
            ? true
            : (checked(row) || row.enabled === true);
          pushRow(key, readValue(row), enabled);
        });
        return;
      }
      if (list && typeof list === "object") {
        Object.keys(list).forEach((key) => {
          const row = list[key];
          if (row && typeof row === "object") {
            pushRow(key, readValue(row), true);
          } else {
            pushRow(key, row, true);
          }
        });
      }
    };
    ingestList(env.list);
    ingestList(env.env_var_list);
    ingestList(env.env_vars);
    ingestList(env.variables);
    ingestList(env.values);
    const preUrl = envBaseUrl(env);
    if (preUrl) {
      const hasBase = rows.some((row) => /^(baseUrl|base_url|url|host)$/i.test(row.key));
      if (!hasBase) pushRow("baseUrl", preUrl, true);
    }
    rows.push({ key: "", value: "", enabled: true });
    return rows;
  }

  function countFolders(items) {
    let n = 0;
    (items || []).forEach((item) => {
      if (item.kind === "folder") {
        n += 1 + countFolders(item.items);
      }
    });
    return n;
  }

  function convert(doc) {
    const root = unwrapDocument(doc);
    if (!isApipostDocument(root)) return null;
    const projectName = (root.project && (root.project.name || root.project.project_name))
      || root.name
      || root.project_name
      || "全部接口";
    const envs = normalizeEnvs(root);
    const primaryEnv = envs.find((env) => envBaseUrl(env)) || envs[0] || null;
    const baseUrl = envBaseUrl(primaryEnv);
    const apis = normalizeApis(root) || [];
    let items = mapTree(apis, baseUrl);

    // If the export wrapped everything in a single project-named folder, unwrap.
    if (items.length === 1 && items[0].kind === "folder") {
      const only = items[0];
      const sameName = only.name === projectName || only.name === "根目录" || only.name === "root" || only.name === "全部接口";
      if (sameName && only.items && only.items.length) items = only.items;
    }

    const projectKey = String(projectName).trim() || "全部接口";
    // ApiPost "全部接口" tree: one collection whose root children are folders + loose requests.
    const collection = {
      name: projectKey,
      collapsed: false,
      source: "apipost",
      projectKey,
      items
    };
    const environments = envs.map((env, index) => ({
      name: env.name || env.env_name || `环境 ${index + 1}`,
      variables: envVariables(env),
      source: "apipost",
      projectKey
    }));

    // Newer ApiPost exports keep shared vars under global.global_vars.
    const globalVars = root.global && root.global.global_vars;
    if (globalVars && typeof globalVars === "object" && Object.keys(globalVars).length) {
      environments.push({
        name: "全局变量",
        variables: envVariables({ name: "全局变量", env_var_list: globalVars }),
        source: "apipost",
        projectKey
      });
    }

    return {
      collection,
      environments,
      format: "apipost",
      stats: {
        requests: countRequests(items),
        folders: countFolders(items),
        environments: environments.length
      }
    };
  }

  function countRequests(items) {
    let n = 0;
    (items || []).forEach((item) => {
      if (item.kind === "request") n += 1;
      else if (item.kind === "folder") n += countRequests(item.items);
    });
    return n;
  }

  window.HC.apipost = { isApipostDocument, convert, countRequests, countFolders, mapTree };
})();
