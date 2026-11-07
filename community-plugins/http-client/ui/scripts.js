/* Minimal pre/post script runner (ApiPost / Postman-lite).
   Exposes `pm` and `apt` with environment + test helpers. No DOM / fetch. */

(function () {
  function createExpect(actual) {
    const api = {
      to: {
        eql(expected) {
          if (actual !== expected && JSON.stringify(actual) !== JSON.stringify(expected)) {
            throw new Error(`expected ${fmt(expected)} but got ${fmt(actual)}`);
          }
        },
        equal(expected) { api.to.eql(expected); },
        deeply: {
          eql(expected) { api.to.eql(expected); }
        }
      },
      a(type) {
        const ok = type === "object" ? actual !== null && typeof actual === "object"
          : type === "array" ? Array.isArray(actual)
            : typeof actual === type;
        if (!ok) throw new Error(`expected type ${type}`);
      },
      ok() {
        if (!actual) throw new Error("expected truthy value");
      }
    };
    return api;
  }

  function fmt(value) {
    try { return JSON.stringify(value); } catch (error) { return String(value); }
  }

  function buildSandbox(ctx) {
    const logs = [];
    const tests = [];
    const env = {
      get(key) {
        return Object.prototype.hasOwnProperty.call(ctx.vars, key) ? ctx.vars[key] : undefined;
      },
      set(key, value) {
        if (!key) return;
        const name = String(key);
        if (ctx.removed) delete ctx.removed[name];
        ctx.vars[name] = value == null ? "" : String(value);
        ctx.dirty = true;
      },
      unset(key) {
        if (!key) return;
        const name = String(key);
        delete ctx.vars[name];
        if (!ctx.removed) ctx.removed = {};
        ctx.removed[name] = true;
        ctx.dirty = true;
      }
    };
    const response = {
      code: ctx.status || 0,
      status: ctx.statusText || "",
      responseTime: ctx.durationMs || 0,
      headers: ctx.headers || {},
      text() { return ctx.bodyText || ""; },
      json() {
        try { return JSON.parse(ctx.bodyText || "null"); }
        catch (error) { throw new Error("response body is not JSON: " + error.message); }
      }
    };
    // ApiPost-style bare `response` (response.json.xxx / response.raw.status).
    let parsedJson = null;
    let parsedJsonOk = false;
    const responseCompat = {
      get json() {
        if (!parsedJsonOk) {
          try { parsedJson = JSON.parse(ctx.bodyText || "null"); parsedJsonOk = true; }
          catch (error) { throw new Error("response body is not JSON: " + error.message); }
        }
        return parsedJson;
      },
      raw: {
        status: ctx.status || 0,
        responseTime: ctx.durationMs || 0,
        responseText: ctx.bodyText || "",
        type: "json"
      },
      headers: ctx.headers || {}
    };
    const pm = {
      environment: env,
      variables: env,
      globals: env,
      response,
      request: { url: ctx.url || "", method: ctx.method || "" },
      test(name, fn) {
        const title = String(name || "test");
        try {
          if (typeof fn === "function") fn();
          tests.push({ name: title, ok: true });
        } catch (error) {
          tests.push({ name: title, ok: false, message: (error && error.message) || String(error) });
        }
      },
      expect: createExpect,
      assert(expression) {
        const source = String(expression || "").trim();
        if (!source) return;
        let ok = false;
        try {
          ok = Function("response", "pm", "apt", `"use strict"; return !!(${source});`)(
            responseCompat, this, this
          );
        } catch (error) {
          tests.push({
            name: source,
            ok: false,
            message: (error && error.message) || String(error)
          });
          throw error;
        }
        if (!ok) {
          const message = "assert failed: " + source;
          tests.push({ name: source, ok: false, message });
          throw new Error(message);
        }
        tests.push({ name: source, ok: true });
      }
    };
    const consoleLike = {
      log() { logs.push(Array.prototype.slice.call(arguments).map(fmt).join(" ")); },
      info() { consoleLike.log.apply(null, arguments); },
      warn() { consoleLike.log.apply(null, arguments); },
      error() { consoleLike.log.apply(null, arguments); }
    };
    // ApiPost / classic Postman globals commonly used in imported scripts.
    const responseBody = ctx.bodyText || "";
    const responseHeaders = ctx.headers || {};
    const responseCode = {
      code: ctx.status || 0,
      name: ctx.statusText || "",
      detail: ctx.statusText || ""
    };
    return {
      pm,
      apt: pm,
      response: responseCompat,
      responseBody,
      responseHeaders,
      responseCode,
      console: consoleLike,
      tests,
      logs
    };
  }

  function run(code, ctx) {
    const source = String(code || "").trim();
    const result = { ok: true, tests: [], logs: [], error: "", durationMs: 0 };
    if (!source) return result;
    const started = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    const box = buildSandbox(ctx || { vars: {} });
    try {
      // Restricted surface: no access to window via scope chain of the Function body
      // beyond the injected bindings. Plugin iframe already isolates host chrome.
      const runner = new Function(
        "pm", "apt", "response", "responseBody", "responseHeaders", "responseCode", "console", "expect",
        `"use strict";\n${source}`
      );
      runner(
        box.pm,
        box.apt,
        box.response,
        box.responseBody,
        box.responseHeaders,
        box.responseCode,
        box.console,
        box.pm.expect
      );
      result.tests = box.tests;
      result.logs = box.logs;
      if (box.tests.some((item) => !item.ok)) result.ok = false;
    } catch (error) {
      result.ok = false;
      result.error = (error && error.message) || String(error);
      result.tests = box.tests;
      result.logs = box.logs;
    }
    const ended = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    result.durationMs = Math.round(ended - started);
    return result;
  }

  function applyVarsToEnvironment(vars, store, ctx) {
    if (!vars || !store) return;
    let environment = store.activeEnvironment();
    if (!environment) environment = store.createEnvironment(HC.i18n.t("misc.scriptEnvironment"));
    const rows = environment.variables || (environment.variables = []);
    Object.keys(vars).forEach((key) => {
      const existing = rows.find((row) => row.key === key);
      if (existing) {
        existing.value = vars[key];
        existing.enabled = true;
      } else {
        const blank = rows.find((row) => !row.key);
        if (blank) {
          blank.key = key;
          blank.value = vars[key];
          blank.enabled = true;
        } else {
          rows.push({ key, value: vars[key], enabled: true });
        }
      }
    });
    const removed = (ctx && ctx.removed) || {};
    Object.keys(removed).forEach((key) => {
      const index = rows.findIndex((row) => row.key === key);
      if (index >= 0) rows.splice(index, 1);
    });
    if (!rows.some((row) => !row.key)) rows.push({ key: "", value: "", enabled: true });
    store.schedulePersist();
    store.emit("environments");
  }

  window.HC.scripts = { run, applyVarsToEnvironment };
})();
