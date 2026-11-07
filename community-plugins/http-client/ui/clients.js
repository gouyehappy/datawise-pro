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
      variables = JSON.parse(tab.graphql.variables || "{}");
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

  function extractOpenApi(document) {
    if (!document || typeof document !== "object") return null;
    const isV3 = !!(document.openapi || document.paths);
    const isV2 = !!(document.swagger && document.paths);
    if (!isV3 && !isV2) return null;

    const title = (document.info && document.info.title) || "OpenAPI";
    const servers = document.servers || [];
    const baseUrl = (servers[0] && servers[0].url) ||
      (document.host ? `${document.schemes && document.schemes[0] ? document.schemes[0] : "https"}://${document.host}${document.basePath || ""}` : "");
    const items = [];
    const paths = document.paths || {};
    Object.keys(paths).forEach((path) => {
      const pathItem = paths[path] || {};
      ["get", "post", "put", "patch", "delete", "head", "options"].forEach((method) => {
        const op = pathItem[method];
        if (!op || typeof op !== "object") return;
        const name = op.summary || op.operationId || `${method.toUpperCase()} ${path}`;
        const headers = [util.emptyRow()];
        let body = { mode: "none", raw: "", contentType: "application/json", fields: [] };
        if (op.requestBody && op.requestBody.content) {
          const json = op.requestBody.content["application/json"];
          if (json) {
            body = {
              mode: "raw",
              contentType: "application/json",
              raw: json.example ? JSON.stringify(json.example, null, 2) : "{\n  \n}",
              fields: []
            };
          }
        }
        items.push({
          kind: "request",
          id: util.uid("req"),
          name,
          method: method.toUpperCase(),
          url: `${baseUrl}${path}`,
          headers,
          params: [util.emptyRow()],
          body,
          auth: { type: "none", username: "", password: "", token: "", key: "", value: "", in: "header" },
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
      });
    });
    if (!items.length) return null;
    return {
      id: util.uid("col"),
      name: title,
      items,
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
      return { error: "json" };
    }
    const collection = extractOpenApi(document);
    if (!collection) return { error: "openapi" };
    return { collection, count: collection.items.length };
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
