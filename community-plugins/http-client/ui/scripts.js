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
    if (!ctx.req) {
      ctx.req = {
        method: ctx.method || "",
        url: ctx.url || "",
        headers: Array.isArray(ctx.headersList) ? ctx.headersList.slice() : [],
        bodyMode: ctx.bodyMode || "raw",
        bodyRaw: ctx.bodyRaw || "",
        bodyContentType: ctx.bodyContentType || "application/json",
        dirty: false
      };
    }
    const reqState = ctx.req;
    const headerApi = {
      get(key) {
        const name = String(key || "");
        const row = (reqState.headers || []).find((item) => String(item.key || "").toLowerCase() === name.toLowerCase());
        return row ? row.value : undefined;
      },
      set(key, value) {
        const name = String(key || "").trim();
        if (!name) return;
        const enabled = true;
        const next = value == null ? "" : String(value);
        const list = reqState.headers || (reqState.headers = []);
        const existing = list.find((item) => String(item.key || "").toLowerCase() === name.toLowerCase());
        if (existing) {
          existing.key = name;
          existing.value = next;
          existing.enabled = enabled;
        } else {
          list.push({ key: name, value: next, enabled });
        }
        reqState.dirty = true;
        ctx.reqDirty = true;
      },
      upsert(key, value) { headerApi.set(key, value); },
      remove(key) {
        const name = String(key || "");
        const before = (reqState.headers || []).length;
        reqState.headers = (reqState.headers || []).filter(
          (item) => String(item.key || "").toLowerCase() !== name.toLowerCase()
        );
        if (reqState.headers.length !== before) {
          reqState.dirty = true;
          ctx.reqDirty = true;
        }
      }
    };
    const bodyApi = {
      get raw() { return reqState.bodyRaw || ""; },
      set raw(value) {
        reqState.bodyRaw = value == null ? "" : String(value);
        if (!reqState.bodyMode || reqState.bodyMode === "none") reqState.bodyMode = "raw";
        reqState.dirty = true;
        ctx.reqDirty = true;
      },
      get mode() { return reqState.bodyMode || "raw"; },
      set mode(value) {
        reqState.bodyMode = value == null ? "raw" : String(value);
        reqState.dirty = true;
        ctx.reqDirty = true;
      },
      update(value) {
        if (value == null) return;
        if (typeof value === "string") {
          reqState.bodyRaw = value;
        } else {
          try { reqState.bodyRaw = JSON.stringify(value); }
          catch (error) { reqState.bodyRaw = String(value); }
        }
        if (!reqState.bodyMode || reqState.bodyMode === "none") reqState.bodyMode = "raw";
        if (!reqState.bodyContentType) reqState.bodyContentType = "application/json";
        reqState.dirty = true;
        ctx.reqDirty = true;
      }
    };
    const requestApi = {
      get method() { return reqState.method || ""; },
      set method(value) {
        reqState.method = String(value || "").toUpperCase();
        reqState.dirty = true;
        ctx.reqDirty = true;
      },
      get url() { return reqState.url || ""; },
      set url(value) {
        reqState.url = value == null ? "" : String(value);
        reqState.dirty = true;
        ctx.reqDirty = true;
        ctx.urlDirty = true;
      },
      headers: headerApi,
      body: bodyApi
    };
    const pm = {
      environment: env,
      variables: env,
      globals: env,
      response,
      request: requestApi,
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

  /* Scripts now run inside the Go sidecar's goja VM (script/run RPC) rather
     than `new Function` in the iframe. That gives a real sandbox (no window,
     document, fetch or HC.bridge), a hard execution timeout and identical
     pm.* behaviour in single requests and workflow runs. `buildSandbox` above
     is kept only as a reference for the older local runner. */
  async function run(code, ctx) {
    const source = String(code || "").trim();
    const result = { ok: true, tests: [], logs: [], error: "", durationMs: 0 };
    if (!source) return result;
    const started = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    const context = ctx || { vars: {} };
    const hasResponse = Object.prototype.hasOwnProperty.call(context, "status");
    const params = {
      code: source,
      vars: context.vars || {},
      response: null,
      request: null
    };
    if (hasResponse) {
      params.response = {
        status: context.status || 0,
        statusText: context.statusText || "",
        durationMs: context.durationMs || 0,
        headers: context.headers || {},
        bodyText: context.bodyText || ""
      };
    } else {
      params.request = {
        method: context.method || "GET",
        url: context.url || "",
        headers: context.headersList || [],
        bodyMode: context.bodyMode || "raw",
        bodyRaw: context.bodyRaw || "",
        bodyContentType: context.bodyContentType || "application/json",
        auth: context.auth || null
      };
    }
    try {
      const out = await HC.bridge.invoke("script/run", params);
      result.ok = !!out.ok;
      result.error = out.error || "";
      result.logs = out.logs || [];
      result.tests = out.tests || [];
      result.durationMs = Number(out.durationMs) || 0;
      context.dirty = !!out.dirty;
      context.reqDirty = !!out.reqDirty;
      if (out.vars && typeof out.vars === "object") {
        Object.keys(context.vars).forEach((key) => {
          if (!Object.prototype.hasOwnProperty.call(out.vars, key)) delete context.vars[key];
        });
        Object.assign(context.vars, out.vars);
      }
      if (out.request && typeof out.request === "object") context.req = out.request;
      if (result.error) result.ok = false;
    } catch (error) {
      result.ok = false;
      result.error = (error && error.message) || String(error);
    }
    const ended = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    if (!result.durationMs) result.durationMs = Math.round(ended - started);
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
