/* Generate client snippets from the active request (curl / fetch / python). */

(function () {
  function quoteJs(value) {
    return JSON.stringify(String(value == null ? "" : value));
  }

  function resolveTab(tab, resolve) {
    const resolveFn = resolve || ((value) => value);
    const method = String(tab.method || "GET").toUpperCase();
    const url = resolveFn(tab.url || "");
    const headers = {};
    (tab.headers || []).forEach((row) => {
      if (!row || row.enabled === false || !row.key) return;
      headers[resolveFn(row.key)] = resolveFn(row.value || "");
    });
    if (tab.auth && tab.auth.type === "bearer" && tab.auth.token) {
      headers.Authorization = `Bearer ${resolveFn(tab.auth.token)}`;
    }
    if (tab.auth && tab.auth.type === "basic") {
      const token = btoa(`${resolveFn(tab.auth.username || "")}:${resolveFn(tab.auth.password || "")}`);
      headers.Authorization = `Basic ${token}`;
    }
    if (tab.auth && tab.auth.type === "apikey" && tab.auth.in !== "query" && tab.auth.key) {
      headers[resolveFn(tab.auth.key)] = resolveFn(tab.auth.value || "");
    }
    let body = null;
    let bodyMode = (tab.body && tab.body.mode) || "none";
    if (bodyMode === "raw" && tab.body.raw) {
      body = resolveFn(tab.body.raw);
      if (!headers["Content-Type"] && !headers["content-type"] && tab.body.contentType) {
        headers["Content-Type"] = tab.body.contentType;
      }
    } else if (bodyMode === "urlencoded") {
      const params = new URLSearchParams();
      (tab.body.fields || []).forEach((row) => {
        if (!row || row.enabled === false || !row.key) return;
        params.append(resolveFn(row.key), resolveFn(row.value || ""));
      });
      body = params.toString();
      headers["Content-Type"] = "application/x-www-form-urlencoded";
    }
    return { method, url, headers, body, bodyMode };
  }

  function generateFetch(tab, options) {
    const spec = resolveTab(tab, options && options.resolve);
    const lines = [];
    lines.push(`const response = await fetch(${quoteJs(spec.url)}, {`);
    lines.push(`  method: ${quoteJs(spec.method)},`);
    const headerEntries = Object.keys(spec.headers);
    if (headerEntries.length) {
      lines.push("  headers: {");
      headerEntries.forEach((key, index) => {
        const comma = index === headerEntries.length - 1 ? "" : ",";
        lines.push(`    ${quoteJs(key)}: ${quoteJs(spec.headers[key])}${comma}`);
      });
      lines.push(spec.body != null ? "  }," : "  }");
    }
    if (spec.body != null) {
      lines.push(`  body: ${quoteJs(spec.body)}`);
    }
    lines.push("});");
    lines.push("const data = await response.json();");
    lines.push("console.log(response.status, data);");
    return lines.join("\n");
  }

  function generatePython(tab, options) {
    const spec = resolveTab(tab, options && options.resolve);
    const lines = [];
    lines.push("import requests");
    lines.push("");
    lines.push(`url = ${JSON.stringify(spec.url)}`);
    const headerEntries = Object.keys(spec.headers);
    if (headerEntries.length) {
      lines.push("headers = {");
      headerEntries.forEach((key) => {
        lines.push(`    ${JSON.stringify(key)}: ${JSON.stringify(spec.headers[key])},`);
      });
      lines.push("}");
    } else {
      lines.push("headers = {}");
    }
    if (spec.body != null && spec.bodyMode === "raw") {
      lines.push(`payload = ${JSON.stringify(spec.body)}`);
      lines.push(`response = requests.request(${JSON.stringify(spec.method)}, url, headers=headers, data=payload.encode("utf-8"))`);
    } else if (spec.body != null && spec.bodyMode === "urlencoded") {
      lines.push(`payload = ${JSON.stringify(spec.body)}`);
      lines.push(`response = requests.request(${JSON.stringify(spec.method)}, url, headers=headers, data=payload)`);
    } else {
      lines.push(`response = requests.request(${JSON.stringify(spec.method)}, url, headers=headers)`);
    }
    lines.push("print(response.status_code)");
    lines.push("print(response.text)");
    return lines.join("\n");
  }

  function generateGo(tab, options) {
    const spec = resolveTab(tab, options && options.resolve);
    const lines = [];
    lines.push("package main");
    lines.push("");
    lines.push("import (");
    lines.push("\t\"fmt\"");
    lines.push("\t\"net/http\"");
    if (spec.body != null) lines.push("\t\"strings\"");
    lines.push(")");
    lines.push("");
    lines.push("func main() {");
    if (spec.body != null) {
      lines.push(`\tbody := strings.NewReader(${quoteJs(spec.body)})`);
      lines.push(`\treq, err := http.NewRequest(${quoteJs(spec.method)}, ${quoteJs(spec.url)}, body)`);
    } else {
      lines.push(`\treq, err := http.NewRequest(${quoteJs(spec.method)}, ${quoteJs(spec.url)}, nil)`);
    }
    lines.push("\tif err != nil {");
    lines.push("\t\tpanic(err)");
    lines.push("\t}");
    Object.keys(spec.headers).forEach((key) => {
      lines.push(`\treq.Header.Set(${quoteJs(key)}, ${quoteJs(spec.headers[key])})`);
    });
    lines.push("\tresp, err := (&http.Client{}).Do(req)");
    lines.push("\tif err != nil {");
    lines.push("\t\tpanic(err)");
    lines.push("\t}");
    lines.push("\tdefer resp.Body.Close()");
    lines.push("\tfmt.Println(resp.StatusCode)");
    lines.push("}");
    return lines.join("\n");
  }

  function generateJava(tab, options) {
    const spec = resolveTab(tab, options && options.resolve);
    const contentType = spec.headers["Content-Type"] || spec.headers["content-type"] || "application/json";
    const lines = [];
    lines.push("import okhttp3.*;");
    lines.push("");
    lines.push("import java.io.IOException;");
    lines.push("");
    lines.push("public class Main {");
    lines.push("    public static void main(String[] args) throws IOException {");
    lines.push("        OkHttpClient client = new OkHttpClient();");
    if (spec.body != null) {
      lines.push("        RequestBody body = RequestBody.create(");
      lines.push(`                MediaType.parse(${quoteJs(contentType)}),`);
      lines.push(`                ${quoteJs(spec.body)});`);
      lines.push(`        Request.Builder builder = new Request.Builder().url(${quoteJs(spec.url)}).method(${quoteJs(spec.method)}, body);`);
    } else {
      lines.push(`        Request.Builder builder = new Request.Builder().url(${quoteJs(spec.url)}).method(${quoteJs(spec.method)}, null);`);
    }
    Object.keys(spec.headers).forEach((key) => {
      lines.push(`        builder.header(${quoteJs(key)}, ${quoteJs(spec.headers[key])});`);
    });
    lines.push("        Request request = builder.build();");
    lines.push("        try (Response response = client.newCall(request).execute()) {");
    lines.push("            System.out.println(response.code());");
    lines.push("            if (response.body() != null) System.out.println(response.body().string());");
    lines.push("        }");
    lines.push("    }");
    lines.push("}");
    return lines.join("\n");
  }

  function generateAxios(tab, options) {
    const spec = resolveTab(tab, options && options.resolve);
    const config = [
      `  method: ${quoteJs(spec.method)}`,
      `  url: ${quoteJs(spec.url)}`
    ];
    const headerEntries = Object.keys(spec.headers);
    if (headerEntries.length) {
      const entries = headerEntries.map((key) => `    ${quoteJs(key)}: ${quoteJs(spec.headers[key])}`);
      config.push(`  headers: {\n${entries.join(",\n")}\n  }`);
    }
    if (spec.body != null) config.push(`  data: ${quoteJs(spec.body)}`);
    return [
      'const axios = require("axios");',
      "",
      "const response = await axios({",
      config.join(",\n"),
      "});",
      "console.log(response.status, response.data);"
    ].join("\n");
  }

  function quotePs(value) {
    return `'${String(value == null ? "" : value).replace(/'/g, "''")}'`;
  }

  function generatePowerShell(tab, options) {
    const spec = resolveTab(tab, options && options.resolve);
    const lines = [];
    const headerEntries = Object.keys(spec.headers);
    if (headerEntries.length) {
      lines.push("$headers = @{");
      headerEntries.forEach((key) => {
        lines.push(`  ${quotePs(key)} = ${quotePs(spec.headers[key])}`);
      });
      lines.push("}");
    }
    const args = [`-Uri ${quotePs(spec.url)}`, `-Method ${quotePs(spec.method)}`];
    if (headerEntries.length) args.push("-Headers $headers");
    if (spec.body != null) args.push(`-Body ${quotePs(spec.body)}`);
    lines.push(`$response = Invoke-WebRequest ${args.join(" ")}`);
    lines.push("Write-Output $response.StatusCode");
    lines.push("Write-Output $response.Content");
    return lines.join("\n");
  }

  function byteLength(value) {
    const text = String(value == null ? "" : value);
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text).length;
    if (typeof Buffer !== "undefined" && Buffer.byteLength) return Buffer.byteLength(text, "utf8");
    return text.length;
  }

  function generateRawHttp(tab, options) {
    const spec = resolveTab(tab, options && options.resolve);
    let path = spec.url || "/";
    let host = "";
    try {
      const parsed = new URL(spec.url);
      path = `${parsed.pathname || "/"}${parsed.search || ""}`;
      host = parsed.host;
    } catch (error) { /* keep the unresolved URL as the request target */ }
    const headers = Object.assign({}, spec.headers);
    const has = (name) => Object.keys(headers).some((key) => key.toLowerCase() === name);
    if (host && !has("host")) headers.Host = host;
    if (spec.body != null && !has("content-length")) {
      headers["Content-Length"] = String(byteLength(spec.body));
    }
    const lines = [`${spec.method} ${path} HTTP/1.1`];
    Object.keys(headers).forEach((key) => lines.push(`${key}: ${headers[key]}`));
    lines.push("");
    if (spec.body != null) lines.push(spec.body);
    return lines.join("\r\n");
  }

  function generate(kind, tab, options) {
    if (kind === "fetch") return generateFetch(tab, options);
    if (kind === "python") return generatePython(tab, options);
    if (kind === "go") return generateGo(tab, options);
    if (kind === "java") return generateJava(tab, options);
    if (kind === "axios") return generateAxios(tab, options);
    if (kind === "powershell") return generatePowerShell(tab, options);
    if (kind === "raw") return generateRawHttp(tab, options);
    if (kind === "curl" && HC.curl) return HC.curl.generateCurl(tab, options);
    return "";
  }

  const GENERATORS = [
    { kind: "curl", label: "cURL" },
    { kind: "fetch", label: "JavaScript fetch" },
    { kind: "python", label: "Python requests" },
    { kind: "go", label: "Go net/http" },
    { kind: "java", label: "Java OkHttp" },
    { kind: "axios", label: "Node axios" },
    { kind: "powershell", label: "PowerShell Invoke-WebRequest" },
    { kind: "raw", label: "Raw HTTP request" }
  ];

  window.HC.codegen = Object.assign(window.HC.codegen || {}, {
    generate, generateFetch, generatePython,
    generateGo, generateJava, generateAxios, generatePowerShell, generateRawHttp,
    GENERATORS
  });
})();
