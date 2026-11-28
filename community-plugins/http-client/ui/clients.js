/* Typed client presets (HTTP / SSE / WS / …) and local OpenAPI extraction. */

(function () {
  const util = HC.util;
  const t = (key, params) => HC.i18n.t(key, params);

  const CLIENT_META = {
    http: { label: "HTTP", tag: "HTTP", color: "http" },
    sse: { label: "SSE", tag: "SSE", color: "sse" },
    websocket: { label: "WebSocket", tag: "WS", color: "ws" },
    socketio: { label: "Socket.IO", tag: "SIO", color: "sio" },
    grpc: { label: "gRPC", tag: "gRPC", color: "grpc" },
    graphql: { label: "GraphQL", tag: "GQL", color: "gql" },
    tcp: { label: "TCP", tag: "TCP", color: "tcp" },
    markdown: { label: "Markdown", tag: "MD", color: "md" }
  };

  const METHOD_TO_CLIENT = {
    MD: "markdown",
    MARKDOWN: "markdown",
    WS: "websocket",
    WEBSOCKET: "websocket",
    SIO: "socketio",
    TCP: "tcp",
    GQL: "graphql",
    GRAPHQL: "graphql",
    SSE: "sse",
    GRPC: "grpc"
  };

  function emptyHeader(key, value) {
    return { key: key || "", value: value || "", enabled: true };
  }

  function normalizeClientType(node) {
    if (!node || typeof node !== "object") return "http";
    const explicit = String(node.clientType || "").toLowerCase();
    if (explicit && CLIENT_META[explicit]) return explicit;
    const method = String(node.method || "").toUpperCase();
    if (METHOD_TO_CLIENT[method]) return METHOD_TO_CLIENT[method];
    return "http";
  }

  function preset(clientType) {
    const base = {
      clientType: clientType || "http",
      stream: { sessionId: "", connected: false, log: [] }
    };
    switch (clientType) {
      case "sse":
        return Object.assign(base, {
          name: t("client.sseUntitled"),
          method: "GET",
          url: "https://",
          headers: [
            emptyHeader("Accept", "text/event-stream"),
            emptyHeader("Cache-Control", "no-cache"),
            util.emptyRow()
          ],
          options: {
            timeoutMs: 300000,
            followRedirects: true,
            maxRedirects: 10,
            verifyTls: true,
            proxyMode: "environment",
            proxyUrl: "",
            maxBodyBytes: 33554432,
            progressEvents: true
          }
        });
      case "websocket":
        return Object.assign(base, {
          name: t("client.wsUntitled"),
          method: "WS",
          url: "wss://",
          headers: [util.emptyRow()],
          section: "messages"
        });
      case "socketio":
        return Object.assign(base, {
          name: t("client.sioUntitled"),
          method: "SIO",
          url: "wss://example.com/socket.io/?EIO=4&transport=websocket",
          headers: [util.emptyRow()],
          section: "messages"
        });
      case "grpc":
        return Object.assign(base, {
          name: t("client.grpcUntitled"),
          method: "POST",
          url: "https://",
          headers: [
            emptyHeader("Content-Type", "application/json"),
            emptyHeader("Accept", "application/json"),
            util.emptyRow()
          ],
          body: {
            mode: "raw",
            contentType: "application/json",
            raw: "{\n  \n}",
            fields: []
          },
          grpc: { service: "", method: "" },
          section: "body"
        });
      case "graphql":
        return Object.assign(base, {
          name: t("client.gqlUntitled"),
          method: "POST",
          url: "https://",
          headers: [
            emptyHeader("Content-Type", "application/json"),
            emptyHeader("Accept", "application/json"),
            util.emptyRow()
          ],
          body: {
            mode: "raw",
            contentType: "application/json",
            raw: "",
            fields: []
          },
          graphql: {
            query: "query {\n  \n}",
            variables: "{\n  \n}"
          },
          section: "body"
        });
      case "tcp":
        return Object.assign(base, {
          name: t("client.tcpUntitled"),
          method: "TCP",
          url: "127.0.0.1:80",
          headers: [],
          section: "messages"
        });
      case "markdown":
        return Object.assign(base, {
          name: t("client.mdUntitled"),
          method: "MD",
          url: "",
          body: {
            mode: "raw",
            contentType: "text/markdown",
            raw: "# \n\n",
            fields: []
          },
          section: "body"
        });
      default:
        return Object.assign(base, { clientType: "http" });
    }
  }

  function isStreamClient(type) {
    return type === "websocket" || type === "socketio" || type === "tcp";
  }

  function isHttpFamily(type) {
    return !type || type === "http" || type === "sse" || type === "graphql" || type === "grpc";
  }

  function syncGraphqlBody(tab) {
    if (!tab || tab.clientType !== "graphql") return;
    if (!tab.graphql) tab.graphql = { query: "", variables: "{}" };
    let variables = {};
    try {
      variables = util.parseJsonc(tab.graphql.variables || "{}");
    } catch (error) {
      variables = {};
    }
    tab.body = tab.body || { mode: "raw", raw: "", contentType: "application/json", fields: [] };
    tab.body.mode = "raw";
    tab.body.contentType = "application/json";
    tab.body.raw = JSON.stringify({ query: tab.graphql.query || "", variables }, null, 2);
  }

  function pushStreamLog(tab, entry) {
    if (!tab.stream) tab.stream = { sessionId: "", connected: false, log: [] };
    tab.stream.log = (tab.stream.log || []).concat([Object.assign({ at: Date.now() }, entry)]).slice(-200);
  }

  /* ---- OpenAPI / Swagger local extract (powers the “AI提取” entry) ---- */

  /* Local-only $ref resolution. Nested refs stay untouched until the consumer
     needs them, so example generation can apply its own depth guard. A visited
     set guards against cyclic definitions. */
  function decodeRefToken(token) {
    return String(token).replace(/~1/g, "/").replace(/~0/g, "~");
  }

  function lookupRef(document, ref) {
    if (typeof ref !== "string" || ref.charAt(0) !== "#") return null;
    const parts = ref.slice(2).split("/").map(decodeRefToken);
    let node = document;
    for (let i = 0; i < parts.length; i += 1) {
      if (!node || typeof node !== "object") return null;
      node = node[parts[i]];
    }
    return node && typeof node === "object" ? node : null;
  }

  function deref(document, value, visited) {
    visited = visited || new Set();
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    if (typeof value.$ref !== "string") return value;
    const ref = value.$ref;
    if (visited.has(ref)) return {};
    const target = lookupRef(document, ref);
    if (!target || typeof target !== "object") return {};
    const nextVisited = new Set(visited);
    nextVisited.add(ref);
    const resolved = deref(document, target, nextVisited);
    const extra = {};
    Object.keys(value).forEach((key) => {
      if (key !== "$ref") extra[key] = value[key];
    });
    return Object.assign({}, resolved, extra);
  }

  function schemaExample(schema, document, depth) {
    if (!schema || typeof schema !== "object") return undefined;
    const node = deref(document, schema);
    const level = depth || 0;
    if (node.example !== undefined) return node.example;
    if (node.default !== undefined) return node.default;
    if (Array.isArray(node.examples) && node.examples.length) return node.examples[0];
    if (Array.isArray(node.enum) && node.enum.length) return node.enum[0];
    const type = node.type || (node.properties ? "object" : (node.items ? "array" : "string"));
    if (level > 6) {
      if (type === "object" || node.properties) return {};
      if (type === "array" || node.items) return [];
      return "";
    }
    if (type === "object" || node.properties) {
      const out = {};
      Object.keys(node.properties || {}).forEach((key) => {
        const child = schemaExample(node.properties[key], document, level + 1);
        if (child !== undefined) out[key] = child;
      });
      return out;
    }
    if (type === "array" || node.items) {
      return [schemaExample(node.items || {}, document, level + 1)];
    }
    if (type === "integer" || type === "number") return 0;
    if (type === "boolean") return false;
    if (type === "null") return null;
    return "";
  }

  function sampleToRaw(sample, contentType) {
    const type = String(contentType || "");
    if (sample && typeof sample === "object") return JSON.stringify(sample, null, 2);
    if (typeof sample === "string" && /xml|html|text|form-urlencoded/.test(type)) return sample;
    if (/json/.test(type)) return JSON.stringify(sample, null, 2);
    return sample == null ? "" : String(sample);
  }

  function parameterValue(param) {
    if (!param || typeof param !== "object") return "";
    const schema = param.schema && typeof param.schema === "object" ? param.schema : {};
    const candidates = [
      param.example, param.exampleValue,
      schema.example, schema.default,
      param.default
    ];
    if (Array.isArray(schema.enum) && schema.enum.length) candidates.push(schema.enum[0]);
    if (Array.isArray(param.enum) && param.enum.length) candidates.push(param.enum[0]);
    for (let i = 0; i < candidates.length; i += 1) {
      const value = candidates[i];
      if (value === undefined || value === null || value === "") continue;
      return typeof value === "object" ? JSON.stringify(value) : String(value);
    }
    return "";
  }

  /* Path-level parameters are collected first; operation-level wins on duplicates. */
  function mergedParameters(document, pathItem, operation) {
    const combined = [];
    const seen = new Map();
    [pathItem, operation].forEach((source) => {
      const list = source && Array.isArray(source.parameters) ? source.parameters : [];
      list.forEach((raw) => {
        const param = deref(document, raw);
        if (!param || typeof param !== "object" || !param.name) return;
        const place = String(param.in || "query").toLowerCase();
        const key = `${place}:${param.name}`;
        const entry = { place, param };
        if (seen.has(key)) {
          combined[seen.get(key)] = entry;
          return;
        }
        seen.set(key, combined.length);
        combined.push(entry);
      });
    });
    return combined;
  }

  function parameterRows(parameters) {
    const rows = { pathParams: [], params: [], headers: [], cookies: [] };
    parameters.forEach((entry) => {
      const param = entry.param;
      const schema = param.schema && typeof param.schema === "object" ? param.schema : {};
      const row = Object.assign(util.emptyRow(), {
        key: String(param.name),
        value: parameterValue(param),
        description: String(param.description || schema.description || ""),
        type: String(param.type || schema.type || "string")
      });
      if (entry.place === "path") rows.pathParams.push(row);
      else if (entry.place === "query") rows.params.push(row);
      else if (entry.place === "header") rows.headers.push(row);
      else if (entry.place === "cookie") rows.cookies.push(row);
    });
    if (!rows.headers.length) rows.headers.push(util.emptyRow());
    if (!rows.params.length) rows.params.push(util.emptyRow());
    return rows;
  }

  function authFromSecurity(document, operation) {
    const emptyAuth = () => ({
      type: "none", username: "", password: "", token: "", key: "", value: "", in: "header"
    });
    const schemes = (document.components && document.components.securitySchemes) || document.securityDefinitions || {};
    const requirements = Array.isArray(operation.security)
      ? operation.security
      : (Array.isArray(document.security) ? document.security : []);
    if (!requirements.length) return emptyAuth();
    const requirement = requirements[0] || {};
    const names = Object.keys(requirement);
    if (!names.length) return emptyAuth();
    const schemeName = names[0];
    const scheme = deref(document, schemes[schemeName] || {});
    const kind = String(scheme.type || "").toLowerCase();
    const hint = scheme.description ? String(scheme.description) : "";
    const auth = emptyAuth();
    if (kind === "http") {
      const httpScheme = String(scheme.scheme || "").toLowerCase();
      if (httpScheme === "bearer") auth.type = "bearer";
      else if (httpScheme === "basic") auth.type = "basic";
      else return emptyAuth();
    } else if (kind === "basic") {
      auth.type = "basic";
    } else if (kind === "apikey") {
      auth.type = "apikey";
      auth.key = String(scheme.name || "");
      auth.in = String(scheme.in || "header").toLowerCase() === "query" ? "query" : "header";
    } else if (kind === "oauth2" || kind === "openidconnect") {
      auth.type = "bearer";
      auth.name = schemeName;
      auth.description = `${kind === "oauth2" ? "OAuth2" : "OpenID Connect"} 认证（${schemeName}）：请手动填写 token`
        + (hint ? `；${hint}` : "");
    } else {
      return emptyAuth();
    }
    if (hint && !auth.description) auth.description = hint;
    if (names.length > 1) {
      auth.name = `${auth.name ? `${auth.name}, ` : ""}${names.slice(1).join(", ")}`;
    }
    return auth;
  }

  function serverBaseUrl(document) {
    const servers = Array.isArray(document.servers) ? document.servers : [];
    if (servers.length && servers[0] && servers[0].url) {
      let url = String(servers[0].url);
      const variables = servers[0].variables || {};
      Object.keys(variables).forEach((name) => {
        const variable = variables[name] || {};
        const value = variable.default !== undefined
          ? variable.default
          : (Array.isArray(variable.enum) && variable.enum.length ? variable.enum[0] : "");
        url = url.split(`{${name}}`).join(String(value));
      });
      return url;
    }
    if (document.host) {
      const scheme = (Array.isArray(document.schemes) && document.schemes[0]) || "https";
      return `${scheme}://${document.host}${document.basePath || ""}`;
    }
    return document.basePath || "";
  }

  function bodyFromContent(document, operation, parameters) {
    const none = () => ({ mode: "none", raw: "", contentType: "application/json", fields: [] });
    let content = null;
    let mediaType = "";
    const requestBody = operation.requestBody && typeof operation.requestBody === "object"
      ? deref(document, operation.requestBody)
      : null;
    if (requestBody && requestBody.content && typeof requestBody.content === "object") {
      const types = Object.keys(requestBody.content);
      const jsonType = types.find((key) => key.toLowerCase().indexOf("json") >= 0);
      if (jsonType) {
        mediaType = jsonType;
        content = requestBody.content[jsonType];
      } else {
        const withExample = types.find((key) => {
          const media = requestBody.content[key] || {};
          return media.example !== undefined
            || (media.examples && Object.keys(media.examples).length)
            || (media.schema && media.schema.example !== undefined);
        });
        mediaType = withExample || types[0] || "";
        content = mediaType ? requestBody.content[mediaType] : null;
      }
    } else {
      const bodyParam = parameters.find((entry) => entry.place === "body");
      if (bodyParam && bodyParam.param && bodyParam.param.schema) {
        mediaType = "application/json";
        content = { schema: bodyParam.param.schema, example: bodyParam.param.example };
      }
    }
    if (!content) return none();
    const media = deref(document, content);
    let sample = media.example;
    if (sample === undefined && media.examples && typeof media.examples === "object") {
      const firstKey = Object.keys(media.examples)[0];
      const first = media.examples[firstKey];
      sample = first && Object.prototype.hasOwnProperty.call(first, "value") ? first.value : first;
    }
    if (sample === undefined && media.schema) sample = schemaExample(media.schema, document, 0);
    const raw = sample === undefined ? "{\n  \n}" : sampleToRaw(sample, mediaType);
    return { mode: "raw", raw, contentType: mediaType || "application/json", fields: [] };
  }

  function makeExample(label, sample, status, description, contentType) {
    const suffix = label ? ` · ${label}` : (description ? ` · ${description}` : "");
    return {
      id: util.uid("ex"),
      name: `${t("examples.defaultName", { status: status || "?" })}${suffix}`.slice(0, 120),
      status: status || 0,
      statusText: String(description || "").slice(0, 120),
      contentType: contentType || "",
      body: String(sampleToRaw(sample, contentType)).slice(0, 200000),
      headers: [],
      at: Date.now()
    };
  }

  function responseExamples(document, operation) {
    const responses = operation.responses && typeof operation.responses === "object" ? operation.responses : {};
    const out = [];
    Object.keys(responses).forEach((statusKey) => {
      const response = deref(document, responses[statusKey]);
      if (!response || typeof response !== "object") return;
      const status = Number(statusKey) || 0;
      const description = String(response.description || "");
      if (response.content && typeof response.content === "object") {
        const types = Object.keys(response.content);
        const jsonType = types.find((key) => key.toLowerCase().indexOf("json") >= 0) || types[0];
        if (!jsonType) return;
        const media = deref(document, response.content[jsonType]);
        if (media && media.example !== undefined) {
          out.push(makeExample("", media.example, status, description, jsonType));
        }
        if (media && media.examples && typeof media.examples === "object") {
          Object.keys(media.examples).forEach((label) => {
            const entry = media.examples[label] || {};
            const value = Object.prototype.hasOwnProperty.call(entry, "value") ? entry.value : entry;
            out.push(makeExample(label, value, status, description, jsonType));
          });
        }
      } else if (response.examples && typeof response.examples === "object") {
        Object.keys(response.examples).forEach((mediaType) => {
          out.push(makeExample(mediaType, response.examples[mediaType], status, description, mediaType));
        });
      } else if (response.schema) {
        const sample = schemaExample(response.schema, document, 0);
        if (sample !== undefined) out.push(makeExample("", sample, status, description, "application/json"));
      }
    });
    return out.slice(0, 10);
  }

  /* Minimal YAML subset (mappings, sequences, scalars, quotes, block scalars,
     flow collections) so YAML documents do not need an external dependency. */
  function yamlStripComment(text) {
    let quote = null;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (quote) {
        if (ch === "\\" && quote === '"') { i += 1; continue; }
        if (ch === quote) {
          if (quote === "'" && text[i + 1] === "'") { i += 1; continue; }
          quote = null;
        }
        continue;
      }
      if (ch === '"' || ch === "'") { quote = ch; continue; }
      if (ch === "#" && (i === 0 || /\s/.test(text[i - 1]))) return text.slice(0, i);
    }
    return text;
  }

  function yamlSplitKey(text) {
    let quote = null;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (quote) {
        if (ch === "\\" && quote === '"') { i += 1; continue; }
        if (ch === quote) {
          if (quote === "'" && text[i + 1] === "'") { i += 1; continue; }
          quote = null;
        }
        continue;
      }
      if (ch === '"' || ch === "'") { quote = ch; continue; }
      if (ch === ":" && (i + 1 === text.length || /\s/.test(text[i + 1]))) {
        return [text.slice(0, i).trim(), text.slice(i + 1).trim()];
      }
    }
    return null;
  }

  function yamlSplitFlow(text) {
    const parts = [];
    let depth = 0;
    let quote = null;
    let start = 0;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (quote) {
        if (ch === "\\" && quote === '"') { i += 1; continue; }
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'") { quote = ch; continue; }
      if (ch === "[" || ch === "{") depth += 1;
      else if (ch === "]" || ch === "}") depth -= 1;
      else if (ch === "," && depth === 0) {
        parts.push(text.slice(start, i));
        start = i + 1;
      }
    }
    parts.push(text.slice(start));
    return parts.map((part) => part.trim()).filter(Boolean);
  }

  function yamlScalar(raw) {
    let text = String(raw == null ? "" : raw).trim();
    if (!text) return null;
    text = text.replace(/^!!\w+\s+/, "").replace(/^&\S+\s+/, "");
    if (/^\*\S+$/.test(text)) return null;
    if (text.charAt(0) === '"') {
      try { return JSON.parse(text); } catch (error) { return text.slice(1, -1); }
    }
    if (text.charAt(0) === "'") return text.slice(1, -1).replace(/''/g, "'");
    if (text.charAt(0) === "[") return yamlSplitFlow(text.slice(1, -1)).map(yamlScalar);
    if (text.charAt(0) === "{") {
      const out = {};
      yamlSplitFlow(text.slice(1, -1)).forEach((part) => {
        const pair = yamlSplitKey(part);
        if (!pair) return;
        out[String(yamlScalar(pair[0]))] = yamlScalar(pair[1]);
      });
      return out;
    }
    const lower = text.toLowerCase();
    if (lower === "null" || lower === "~") return null;
    if (lower === "true") return true;
    if (lower === "false") return false;
    if (/^-?\d+$/.test(text)) return Number(text);
    if (/^-?\d*\.\d+$/.test(text)) return Number(text);
    return text;
  }

  function yamlToJson(source) {
    const lines = String(source || "").replace(/\r\n?/g, "\n").split("\n");
    const tokens = [];
    lines.forEach((raw) => {
      const indent = (raw.match(/^ */) || [""])[0].length;
      let content = raw.slice(indent);
      if (!content.trim()) return;
      if (/^---\s*$/.test(content) || /^\.\.\.\s*$/.test(content)) return;
      content = yamlStripComment(content).replace(/\s+$/, "");
      if (!content) return;
      tokens.push({ indent, text: content });
    });
    if (!tokens.length) return null;

    let pos = 0;
    const isSequence = (token) => !!token && (token.text === "-" || /^-\s/.test(token.text));

    function blockScalar(style, indent) {
      const collected = [];
      while (pos < tokens.length && tokens[pos].indent > indent) {
        collected.push(tokens[pos].text);
        pos += 1;
      }
      const value = collected.join(style.charAt(0) === ">" ? " " : "\n");
      return style.indexOf("-") >= 0 ? value : `${value.replace(/\s+$/, "")}\n`;
    }

    function parseValue(valueText, indent) {
      const text = String(valueText || "").trim();
      if (/^[|>][+-]?\d*$/.test(text)) return blockScalar(text, indent);
      return yamlScalar(text);
    }

    function parseBlock(indent) {
      if (isSequence(tokens[pos])) {
        const list = [];
        while (isSequence(tokens[pos]) && tokens[pos].indent === indent) {
          const rest = tokens[pos].text.slice(1).trim();
          pos += 1;
          if (!rest) {
            const next = tokens[pos];
            list.push(next && (next.indent > indent || next.indent === indent && isSequence(next))
              ? parseBlock(next.indent)
              : null);
          } else if (yamlSplitKey(rest)) {
            tokens.splice(pos, 0, { indent: indent + 2, text: rest });
            list.push(parseBlock(indent + 2));
          } else {
            list.push(parseValue(rest, indent));
          }
        }
        return list;
      }
      const out = {};
      while (tokens[pos] && tokens[pos].indent === indent && !isSequence(tokens[pos])) {
        const pair = yamlSplitKey(tokens[pos].text);
        if (!pair) { pos += 1; continue; }
        pos += 1;
        const key = String(yamlScalar(pair[0]));
        if (pair[1]) {
          out[key] = parseValue(pair[1], indent);
        } else {
          const next = tokens[pos];
          out[key] = next && (next.indent > indent || next.indent === indent && isSequence(next))
            ? parseBlock(next.indent)
            : null;
        }
      }
      return out;
    }

    const result = parseBlock(tokens[0].indent);
    if (pos !== tokens.length) throw new Error("Unsupported YAML structure");
    return result;
  }

  function extractOpenApi(document) {
    if (!document || typeof document !== "object" || Array.isArray(document)) return null;
    const isV2 = !!(document.swagger && document.paths);
    const isV3 = !!document.openapi || (!!document.paths && !isV2);
    if ((!isV3 && !isV2) || !document.paths || typeof document.paths !== "object") return null;

    const title = (document.info && document.info.title) || "OpenAPI";
    const baseUrl = serverBaseUrl(document);
    const methods = ["get", "post", "put", "patch", "delete", "head", "options", "trace"];
    const folders = [];
    const folderMap = new Map();
    let count = 0;

    function folderFor(tag) {
      const key = tag || "";
      if (folderMap.has(key)) return folderMap.get(key);
      const folder = {
        kind: "folder",
        id: util.uid("folder"),
        name: tag || t("misc.untitledFolder"),
        collapsed: false,
        items: []
      };
      folderMap.set(key, folder);
      folders.push(folder);
      return folder;
    }

    Object.keys(document.paths).forEach((path) => {
      const pathItem = deref(document, document.paths[path]);
      if (!pathItem || typeof pathItem !== "object") return;
      methods.forEach((method) => {
        const rawOperation = pathItem[method];
        if (!rawOperation || typeof rawOperation !== "object") return;
        const op = deref(document, rawOperation);
        const parameters = mergedParameters(document, pathItem, op);
        const rows = parameterRows(parameters);
        const tags = Array.isArray(op.tags) ? op.tags.filter(Boolean) : [];
        const folder = folderFor(tags.length ? String(tags[0]) : "");
        folder.items.push({
          kind: "request",
          id: util.uid("req"),
          name: String(op.summary || op.operationId || `${method.toUpperCase()} ${path}`),
          method: method.toUpperCase(),
          url: `${baseUrl}${path}`,
          headers: rows.headers,
          params: rows.params,
          pathParams: rows.pathParams,
          cookies: rows.cookies,
          examples: responseExamples(document, op),
          body: bodyFromContent(document, op, parameters),
          auth: authFromSecurity(document, op),
          scripts: { pre: "", post: "" },
          options: {
            timeoutMs: 30000,
            followRedirects: true,
            maxRedirects: 10,
            verifyTls: true,
            proxyMode: "environment",
            proxyUrl: "",
            maxBodyBytes: 33554432,
            progressEvents: true
          },
          clientType: "http"
        });
        count += 1;
      });
    });
    if (!count) return null;
    return {
      id: util.uid("col"),
      name: title,
      items: folders,
      collapsed: false
    };
  }

  function tryExtractApiDoc(text) {
    const trimmed = String(text || "").trim();
    if (!trimmed) return { error: "empty" };
    let document;
    try {
      document = JSON.parse(trimmed);
    } catch (error) {
      try {
        document = yamlToJson(trimmed);
      } catch (yamlError) {
        return { error: "yaml", message: "目前仅支持 JSON 格式的 OpenAPI 文档" };
      }
      if (!document) return { error: "yaml", message: "目前仅支持 JSON 格式的 OpenAPI 文档" };
    }
    const collection = extractOpenApi(document);
    if (!collection) return { error: "openapi" };
    const count = collection.items.reduce((sum, folder) => (
      sum + (Array.isArray(folder.items) ? folder.items.length : 1)
    ), 0);
    return { collection, count };
  }

  function renderMarkdown(source) {
    const raw = String(source || "");
    if (!raw.trim()) {
      return `<div class="hc-md-empty">${util.escapeHtml(HC.i18n.t("client.mdEmpty"))}</div>`;
    }
    const lines = raw.replace(/\r\n/g, "\n").split("\n");
    const html = [];
    let inCode = false;
    let listOpen = false;
    const closeList = () => {
      if (listOpen) {
        html.push("</ul>");
        listOpen = false;
      }
    };
    const inline = (text) => util.escapeHtml(text)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>");
    lines.forEach((line) => {
      if (line.startsWith("```")) {
        closeList();
        if (inCode) {
          html.push("</code></pre>");
          inCode = false;
        } else {
          html.push("<pre class=\"hc-md-code\"><code>");
          inCode = true;
        }
        return;
      }
      if (inCode) {
        html.push(`${util.escapeHtml(line)}\n`);
        return;
      }
      const heading = /^(#{1,3})\s+(.*)$/.exec(line);
      if (heading) {
        closeList();
        const level = heading[1].length;
        html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
        return;
      }
      if (/^\s*[-*]\s+/.test(line)) {
        if (!listOpen) {
          html.push("<ul>");
          listOpen = true;
        }
        html.push(`<li>${inline(line.replace(/^\s*[-*]\s+/, ""))}</li>`);
        return;
      }
      closeList();
      if (!line.trim()) {
        html.push("<br/>");
        return;
      }
      html.push(`<p>${inline(line)}</p>`);
    });
    closeList();
    if (inCode) html.push("</code></pre>");
    return html.join("");
  }

  window.HC.clients = {
    CLIENT_META,
    preset,
    normalizeClientType,
    isStreamClient,
    isHttpFamily,
    syncGraphqlBody,
    pushStreamLog,
    extractOpenApi,
    tryExtractApiDoc,
    renderMarkdown
  };
})();
