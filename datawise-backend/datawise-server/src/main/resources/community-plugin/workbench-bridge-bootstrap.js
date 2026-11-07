/* Injected into community plugin workbench HTML before module scripts.
 * Creates window.datawisePlugin immediately so Vue boot does not race the host. */
(function () {
  // Opaque-origin workbench iframes (sandbox without allow-same-origin): merely
  // reading window.localStorage / sessionStorage throws SecurityError. Install an
  // in-memory Storage shim before any plugin module (i18next, React prefs) runs.
  // Persistence still goes through datawisePlugin.storage when the host bridge is up.
  (function installOpaqueStorageShim() {
    function makeMemoryStorage() {
      var map = Object.create(null);
      var keys = [];
      return {
        get length() { return keys.length; },
        key: function (i) {
          return (i >= 0 && i < keys.length) ? keys[i] : null;
        },
        getItem: function (k) {
          k = String(k);
          return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null;
        },
        setItem: function (k, v) {
          k = String(k);
          v = String(v);
          if (!Object.prototype.hasOwnProperty.call(map, k)) keys.push(k);
          map[k] = v;
        },
        removeItem: function (k) {
          k = String(k);
          if (!Object.prototype.hasOwnProperty.call(map, k)) return;
          delete map[k];
          keys = keys.filter(function (x) { return x !== k; });
        },
        clear: function () {
          map = Object.create(null);
          keys = [];
        }
      };
    }
    function needsShim(name) {
      try {
        var s = window[name];
        var probe = '__dw_opaque_storage_probe__';
        s.setItem(probe, '1');
        s.removeItem(probe);
        return false;
      } catch (e) {
        return true;
      }
    }
    function install(name) {
      if (!needsShim(name)) return null;
      var mem = makeMemoryStorage();
      try {
        Object.defineProperty(window, name, {
          configurable: true,
          enumerable: true,
          value: mem
        });
        return mem;
      } catch (e) {
        try { window[name] = mem; } catch (e2) {}
        return mem;
      }
    }
    var localMem = install('localStorage');
    install('sessionStorage');
    // Expose for bridge hydrate/persist hooks below (null when native storage works).
    window.__dwOpaqueLocalStorage = localMem;
  })();

  if (window.datawisePlugin && window.datawisePlugin.__dwHostBridge) return;
  var pending = Object.create(null);
  var binaryListeners = [];
  var eventListeners = [];
  var contextListeners = [];
  var appearanceListeners = [];
  var localeListeners = [];
  var hostInfoListeners = [];
  var focusListeners = [];
  var activeListeners = [];
  var workbenchActive = true;
  var hostContext = {};
  var hostTheme = null;
  var hostAppearance = null;
  var hostLocale = 'en';
  var hostPluginId = '';
  var readyResolve;
  var readyPromise = new Promise(function (resolve) { readyResolve = resolve; });
  var readySettled = false;

  /** hostApi HostInfo snapshot (locale + appearance + theme tokens). */
  function buildHostInfo() {
    return {
      protocolVersion: 1,
      locale: hostLocale || 'en',
      appearance: hostAppearance || { colorScheme: (hostTheme && hostTheme.appearance) || 'dark' },
      theme: hostTheme || { appearance: 'dark', tokens: {} },
      pluginId: hostPluginId || '',
      context: hostContext || {}
    };
  }

  function notifyHostInfo() {
    var info = buildHostInfo();
    hostInfoListeners.forEach(function (fn) { try { fn(info); } catch (e) {} });
  }

  // Seed from iframe URL so connectionId / first-paint theme survive CEF postMessage races.
  try {
    var q = new URLSearchParams(location.search || '');
    var urlCid = q.get('dwConnectionId');
    var urlWid = q.get('dwWorkbenchId');
    if (urlCid) hostContext.connectionId = urlCid;
    if (urlWid) hostContext.workbenchId = urlWid;
    var urlAppearance = q.get('dwAppearance') === 'light' ? 'light' : 'dark';
    var root = document.documentElement;
    root.setAttribute('data-theme', urlAppearance);
    root.setAttribute('data-dw-theme', urlAppearance);
    root.style.colorScheme = urlAppearance;
    hostAppearance = { colorScheme: urlAppearance };
    var rawCtx = q.get('dwContext');
    if (rawCtx) {
      var parsed = JSON.parse(decodeURIComponent(escape(atob(rawCtx))));
      if (parsed && typeof parsed === 'object') {
        Object.keys(parsed).forEach(function (k) {
          if (hostContext[k] == null || hostContext[k] === '') hostContext[k] = parsed[k];
        });
      }
    }
  } catch (e) {}

  function settleReady() {
    if (readySettled) return;
    readySettled = true;
    try { readyResolve(hostContext); } catch (e) {}
  }

  /**
   * Plugin typography contract (host wins, defaults only when absent):
   *   Host MAY send --font-sans / --font-mono / --dw-font-size / --dw-text-* /
   *   --dw-ui-text-scale. If present, keep them. If absent, install iframe-safe
   *   defaults. Plugins must only consume these vars — then Settings changes
   *   apply live without re-packaging plugins.
   */
  var PLUGIN_FONT_SANS =
    '"Segoe UI Variable", "Segoe UI", "PingFang SC", "Hiragino Sans GB", ' +
    '"Microsoft YaHei UI", "Microsoft YaHei", system-ui, sans-serif';
  var PLUGIN_FONT_MONO =
    'ui-monospace, "Cascadia Mono", "Sarasa Mono SC", "JetBrains Mono", ' +
    'SFMono-Regular, Menlo, Monaco, Consolas, monospace';

  function ensurePluginTypographyBaseline() {
    var id = 'dw-plugin-typography-baseline';
    var el = document.getElementById(id);
    if (!el) {
      el = document.createElement('style');
      el.id = id;
      (document.head || document.documentElement).appendChild(el);
    }
    el.textContent = [
      '/* Injected by workbench-bridge-bootstrap — host tokens + defaults */',
      'html, body, #root, #app {',
      '  font-family: var(--font-sans, var(--plugin-font-sans, ' + PLUGIN_FONT_SANS + ')) !important;',
      '}',
      'body, #root, #app {',
      '  font-size: var(--dw-font-size, var(--font-size, 13.5px)) !important;',
      '  line-height: 1.4;',
      '}',
      'button, input, select, textarea, label, table, th, td, .btn, [class*="btn"] {',
      '  font-family: inherit;',
      '}',
      'code, pre, kbd, samp, .mono, .font-mono, [class*="mono"] {',
      '  font-family: var(--font-mono, var(--plugin-font-mono, ' + PLUGIN_FONT_MONO + '));',
      '}'
    ].join('\n');
  }

  function applyThemeTokens(theme) {
    if (!theme || typeof theme !== 'object') return;
    var root = document.documentElement;
    var appearance = theme.appearance === 'light' ? 'light' : 'dark';
    root.setAttribute('data-theme', appearance);
    root.setAttribute('data-dw-theme', appearance);
    root.style.colorScheme = appearance;
    var tokens = theme.tokens;
    if (!tokens || typeof tokens !== 'object') return;
    Object.keys(tokens).forEach(function (key) {
      var value = tokens[key];
      if (typeof value === 'string' && value) root.style.setProperty(key, value);
    });
    // Always publish documented defaults for CSS fallbacks (var(--x, var(--plugin-…))).
    root.style.setProperty('--plugin-font-sans', PLUGIN_FONT_SANS);
    root.style.setProperty('--plugin-font-mono', PLUGIN_FONT_MONO);

    // Shell uiTextScale → plugin chrome.
    if (!tokens['--dw-ui-text-scale']) {
      root.style.setProperty('--dw-ui-text-scale', '1');
    }
    // Family: host token wins; fill only when missing.
    if (!tokens['--font-sans'] && !tokens['--dw-font']) {
      root.style.setProperty('--font-sans', PLUGIN_FONT_SANS);
      root.style.setProperty('--dw-font', PLUGIN_FONT_SANS);
    } else if (tokens['--font-sans'] && !tokens['--dw-font']) {
      root.style.setProperty('--dw-font', tokens['--font-sans']);
    } else if (tokens['--dw-font'] && !tokens['--font-sans']) {
      root.style.setProperty('--font-sans', tokens['--dw-font']);
    }
    if (!tokens['--font-mono'] && !tokens['--dw-font-mono']) {
      root.style.setProperty('--font-mono', PLUGIN_FONT_MONO);
      root.style.setProperty('--dw-font-mono', PLUGIN_FONT_MONO);
    } else if (tokens['--font-mono'] && !tokens['--dw-font-mono']) {
      root.style.setProperty('--dw-font-mono', tokens['--font-mono']);
    } else if (tokens['--dw-font-mono'] && !tokens['--font-mono']) {
      root.style.setProperty('--font-mono', tokens['--dw-font-mono']);
    }
    // Aliases always track the resolved tokens (SSH / K8s / HTTP client).
    root.style.setProperty('--sans', 'var(--font-sans)');
    root.style.setProperty('--mono', 'var(--font-mono)');
    root.style.setProperty('--ui-font-family', 'var(--font-sans)');
    root.style.setProperty('--app-font-sans', 'var(--font-sans)');
    root.style.setProperty('--hc-font', 'var(--font-sans)');
    root.style.setProperty('--terminal-font-family', 'var(--font-mono)');

    // Body size: host --dw-font-size when present; else 13.5px × scale (md).
    if (!tokens['--dw-font-size'] && !tokens['--font-size']) {
      root.style.setProperty('--dw-font-size', 'calc(13.5px * var(--dw-ui-text-scale, 1))');
      root.style.setProperty('--font-size', 'calc(13.5px * var(--dw-ui-text-scale, 1))');
    } else if (tokens['--dw-font-size'] && !tokens['--font-size']) {
      root.style.setProperty('--font-size', tokens['--dw-font-size']);
    } else if (tokens['--font-size'] && !tokens['--dw-font-size']) {
      root.style.setProperty('--dw-font-size', tokens['--font-size']);
    }
    // Plugin type ladder = percentages of body (--dw-font-size), not absolute px.
    // So captions/titles stay proportional when host changes 界面文字大小; plugins
    // only need var(--dw-font-size) / var(--dw-text-xs|…) — no per-plugin px.
    // Ratios match host ui-text-scale.css (shell + iframe share one body token).
    root.style.setProperty('--dw-text-2xs', 'calc(var(--dw-font-size) * 0.75)');
    root.style.setProperty('--dw-text-xs', 'calc(var(--dw-font-size) * 0.85)');
    root.style.setProperty('--dw-text-sm', 'var(--dw-font-size)');
    root.style.setProperty('--dw-text-md', 'calc(var(--dw-font-size) * 1.08)');
    root.style.setProperty('--dw-text-lg', 'calc(var(--dw-font-size) * 1.15)');
    root.style.setProperty('--dw-text-xl', 'calc(var(--dw-font-size) * 1.25)');
    root.style.setProperty('--fs', 'var(--dw-font-size)');
    root.style.setProperty('--fs-sm', 'var(--dw-text-xs)');
    // Rem-safe host body mapping (K8s/Tailwind etc.):
    // Shell --dw-font-size is chrome *body* (~text-sm), NOT a rem root.
    // Tailwind text-sm = 0.875rem → root = body / 0.875 so plugin body matches host.
    root.style.fontSize = 'calc(var(--dw-font-size, var(--font-size, 13.5px)) / 0.875)';
    ensurePluginTypographyBaseline();
    // Shell uiDensity → data-ui-density (+ optional --dw-ui-density id token).
    var density = tokens['--dw-ui-density'];
    if (density === 'sm' || density === 'md' || density === 'lg') {
      root.setAttribute('data-ui-density', density);
    }
  }

  function applyHostFields(data) {
    if (data.context && typeof data.context === 'object') {
      var next = {};
      Object.keys(hostContext).forEach(function (k) { next[k] = hostContext[k]; });
      Object.keys(data.context).forEach(function (k) {
        var v = data.context[k];
        if (v != null && v !== '') next[k] = v;
      });
      if (data.context.connection && typeof data.context.connection === 'object') {
        next.connection = Object.assign({}, hostContext.connection || {}, data.context.connection);
      }
      if (!next.connectionId && next.connection && next.connection.id) {
        next.connectionId = next.connection.id;
      }
      hostContext = next;
    }
    if (data.locale) hostLocale = data.locale;
    if (data.pluginId) hostPluginId = data.pluginId;
    if (data.theme) {
      hostTheme = data.theme;
      applyThemeTokens(hostTheme);
    }
    if (data.appearance) hostAppearance = data.appearance;
    var api = window.datawisePlugin;
    if (!api) return;
    api.context = hostContext;
    api.locale = hostLocale;
    api.pluginId = hostPluginId || api.pluginId;
    api.theme = hostTheme;
    api.appearance = hostAppearance;
  }

  function toBase64(u8) {
    var s = '';
    var chunk = 0x8000;
    for (var i = 0; i < u8.length; i += chunk) {
      s += String.fromCharCode.apply(null, Array.from(u8.subarray(i, i + chunk)));
    }
    return btoa(s);
  }

  function fromBase64(value) {
    var raw = atob(value || '');
    var bytes = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes;
  }

  /** Strip Vue Proxies / non-cloneables before postMessage (structured clone). */
  function cloneForPostMessage(value) {
    if (value == null) return {};
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (e) {
      return {};
    }
  }

  function invoke(method, params, options) {
    var timeoutMs = options && typeof options.timeoutMs === 'number' ? options.timeoutMs : 0;
    return new Promise(function (resolve, reject) {
      var id = 'req-' + Math.random().toString(36).slice(2);
      var timer = 0;
      pending[id] = {
        resolve: function (result) {
          if (timer) clearTimeout(timer);
          resolve(result);
        },
        reject: function (err) {
          if (timer) clearTimeout(timer);
          reject(err);
        }
      };
      try {
        parent.postMessage({ type: 'datawise-plugin-request', id: id, method: method, params: cloneForPostMessage(params) }, '*');
      } catch (e) {
        delete pending[id];
        reject(e instanceof Error ? e : new Error(String(e)));
        return;
      }
      if (timeoutMs > 0) {
        timer = setTimeout(function () {
          if (!pending[id]) return;
          delete pending[id];
          reject(new Error('Plugin invoke timed out: ' + method));
        }, timeoutMs);
      }
    });
  }

  window.addEventListener('message', function (event) {
    // The plugin page only ever talks to its embedding host frame; drop anything else.
    if (event.source !== window.parent) return;
    var data = event.data;
    if (!data) return;
    if (data.type === 'datawise-plugin-response' && data.id && pending[data.id]) {
      var p = pending[data.id];
      delete pending[data.id];
      if (data.error) p.reject(new Error(data.error));
      else p.resolve(data.result);
    }
    if (data.type === 'datawise-plugin-event' && data.method) {
      var evt = { method: data.method, params: data.params || {} };
      eventListeners.forEach(function (fn) { try { fn(evt); } catch (e) {} });
    }
    if (data.type === 'datawise-plugin-binary' && data.channel) {
      // Prefer zero-copy Uint8Array / ArrayBuffer from the host bridge; fall
      // back to legacy dataBase64 for older hosts.
      var bytes;
      if (data.data instanceof Uint8Array) {
        bytes = data.data;
      } else if (data.data instanceof ArrayBuffer) {
        bytes = new Uint8Array(data.data);
      } else if (ArrayBuffer.isView(data.data) && data.data.buffer) {
        bytes = new Uint8Array(data.data.buffer, data.data.byteOffset, data.data.byteLength);
      } else {
        var raw = atob(data.dataBase64 || '');
        bytes = new Uint8Array(raw.length);
        for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      }
      var bin = { channel: data.channel, data: bytes, dataBase64: data.dataBase64 };
      binaryListeners.forEach(function (fn) { try { fn(bin); } catch (e) {} });
    }
    if (data.type === 'datawise-plugin-context' && data.context) {
      applyHostFields({ context: data.context });
      settleReady();
      contextListeners.forEach(function (fn) { try { fn(hostContext); } catch (e) {} });
    }
    if (data.type === 'datawise-plugin-env') {
      applyHostFields(data);
      settleReady();
      try {
        document.dispatchEvent(new CustomEvent('datawise-plugin-env', { detail: data }));
      } catch (e) {}
      if (hostAppearance) {
        appearanceListeners.forEach(function (fn) { try { fn(hostAppearance); } catch (e) {} });
      }
      if (data.locale) {
        localeListeners.forEach(function (fn) { try { fn(hostLocale); } catch (e) {} });
      }
      contextListeners.forEach(function (fn) { try { fn(hostContext); } catch (e) {} });
      notifyHostInfo();
    }
    // Host moved keyboard focus into this iframe (tab activate). Plugins with
    // a terminal / primary input should steal focus from the tab chrome.
    if (data.type === 'datawise-plugin-focus') {
      focusListeners.forEach(function (fn) { try { fn(); } catch (e) {} });
      try {
        document.dispatchEvent(new CustomEvent('datawise-plugin-focus'));
      } catch (e) {}
    }
    if (data.type === 'datawise-plugin-active') {
      workbenchActive = data.active !== false;
      activeListeners.forEach(function (fn) {
        try { fn(workbenchActive); } catch (e) {}
      });
      try {
        document.dispatchEvent(new CustomEvent('datawise-plugin-active', { detail: { active: workbenchActive } }));
      } catch (e) {}
    }
  });

  var api = {
    __dwHostBridge: true,
    context: hostContext,
    locale: hostLocale,
    pluginId: hostPluginId,
    theme: hostTheme,
    appearance: hostAppearance,
    request: invoke,
    invoke: invoke,
    notify: function (method, params) {
      parent.postMessage({ type: 'datawise-plugin-notify', method: method, params: cloneForPostMessage(params) }, '*');
      return Promise.resolve();
    },
    sendBinary: function (channel, data) {
      var bytes = typeof data === 'string' ? new TextEncoder().encode(data)
        : (data instanceof Uint8Array ? data : new Uint8Array(data));
      // Prefer transferable bytes (hot SFTP / terminal input paths); fall back
      // to legacy base64 for older hosts that only read dataBase64.
      var copy = bytes.slice();
      try {
        parent.postMessage({
          type: 'datawise-plugin-binary-out',
          channel: channel,
          data: copy
        }, '*', [copy.buffer]);
      } catch (e) {
        parent.postMessage({
          type: 'datawise-plugin-binary-out',
          channel: channel,
          dataBase64: toBase64(bytes)
        }, '*');
      }
      return Promise.resolve();
    },
    onBinary: function (fn) {
      binaryListeners.push(fn);
      return function () { binaryListeners = binaryListeners.filter(function (x) { return x !== fn; }); };
    },
    onEvent: function (fn) {
      eventListeners.push(fn);
      return function () { eventListeners = eventListeners.filter(function (x) { return x !== fn; }); };
    },
    onContextChange: function (fn) {
      contextListeners.push(fn);
      return function () { contextListeners = contextListeners.filter(function (x) { return x !== fn; }); };
    },
    onAppearanceChange: function (fn) {
      appearanceListeners.push(fn);
      return function () { appearanceListeners = appearanceListeners.filter(function (x) { return x !== fn; }); };
    },
    onLocaleChange: function (fn) {
      localeListeners.push(fn);
      return function () { localeListeners = localeListeners.filter(function (x) { return x !== fn; }); };
    },
    /** Host asks the workbench to take keyboard focus (after workspace tab activate). */
    onFocus: function (fn) {
      if (typeof fn !== 'function') return function () {};
      focusListeners.push(fn);
      return function () { focusListeners = focusListeners.filter(function (x) { return x !== fn; }); };
    },
    /**
     * KeepAlive visibility: false while another workspace tab is focused.
     * Plugins should keep sequence/drain alive but can defer expensive paints.
     */
    onActive: function (fn) {
      if (typeof fn !== 'function') return function () {};
      activeListeners.push(fn);
      try { fn(workbenchActive); } catch (e) {}
      return function () { activeListeners = activeListeners.filter(function (x) { return x !== fn; }); };
    },
    get active() { return workbenchActive; },
    /**
     * hostApi HostInfo: pull the latest locale/appearance/theme snapshot.
     * Prefer this over reading mutable `.locale` / `.theme` when starting up.
     */
    getHostInfo: function () {
      var snapshot = buildHostInfo();
      if (hostTheme && hostLocale) {
        return Promise.resolve(snapshot);
      }
      return readyPromise.then(function () {
        return invoke('host.getHostInfo', {}).then(function (result) {
          if (result && typeof result === 'object') {
            applyHostFields(result);
            notifyHostInfo();
          }
          return buildHostInfo();
        }, function () {
          return buildHostInfo();
        });
      });
    },
    onHostInfo: function (fn) {
      if (typeof fn !== 'function') return function () {};
      hostInfoListeners.push(fn);
      try { fn(buildHostInfo()); } catch (e) {}
      return function () { hostInfoListeners = hostInfoListeners.filter(function (x) { return x !== fn; }); };
    },
    decodeBase64: fromBase64,
    encodeBase64: function (value) {
      var u8 = value instanceof Uint8Array ? value : new Uint8Array(value);
      return toBase64(u8);
    },
    openWorkbench: function (contributionId, context, openOptions) {
      return invoke('host.openWorkbench', {
        contributionId: contributionId,
        context: context || {},
        options: openOptions || {}
      });
    },
    reopenConnection: function (connectionId) {
      return invoke('host.reopenConnection', { connectionId: connectionId });
    },
    listOpenWorkbenches: function () {
      return invoke('host.listOpenWorkbenches', {});
    },
    /**
     * hostApi 1.5. Requires manifest permission host.sql.
     * Credentials stay on the host; executeReadonly is SELECT-only.
     */
    sql: {
      listConnections: function () {
        return invoke('host.sql.listConnections', {}, { timeoutMs: 20000 });
      },
      executeReadonly: function (params) {
        return invoke('host.sql.executeReadonly', params || {}, { timeoutMs: 120000 });
      },
      openConsole: function (params) {
        return invoke('host.sql.openConsole', params || {}, { timeoutMs: 15000 });
      }
    },
    /**
     * hostApi 1.6. Requires manifest permission host.ai.
     * Uses the current user's default chat LLM; API keys never leave the host.
     */
    ai: {
      status: function () {
        return invoke('host.ai.status', {}, { timeoutMs: 15000 });
      },
      chat: function (params) {
        return invoke('host.ai.chat', params || {}, { timeoutMs: 180000 });
      },
      chatCancel: function (params) {
        return invoke('host.ai.chatCancel', params || {}, { timeoutMs: 5000 });
      }
    },
    clipboard: {
      readText: function () {
        return invoke('host.clipboard.readText', {}).then(function (result) {
          return (result && typeof result.text === 'string') ? result.text : '';
        });
      },
      writeText: function (text) {
        return invoke('host.clipboard.writeText', { text: String(text || '') }).then(function () {});
      }
    },
    /** Open http(s) via the host shell (avoids sandboxed-frame window.open blocks). */
    shell: {
      openExternal: function (url) {
        return invoke('host.openExternal', { url: String(url || '') }, { timeoutMs: 8000 }).then(function (result) {
          return !!(result && result.ok);
        });
      }
    },
    /** hostApi 1.2: opaque-origin frames have no localStorage — UI persistence runs through the host. */
    storage: {
      getAll: function () {
        return readyPromise.then(function () {
          return invoke('host.storage.getAll', {}, { timeoutMs: 5000 }).then(function (result) {
            return (result && typeof result.values === 'object' && result.values) || {};
          });
        });
      },
      get: function (key) {
        return readyPromise.then(function () {
          return invoke('host.storage.get', { key: String(key) }, { timeoutMs: 5000 }).then(function (result) {
            return (result && typeof result.value === 'string') ? result.value : null;
          });
        });
      },
      set: function (key, value) {
        return readyPromise.then(function () {
          return invoke('host.storage.set', { key: String(key), value: value == null ? null : String(value) }, { timeoutMs: 5000 }).then(function () {});
        });
      },
      remove: function (key) {
        return readyPromise.then(function () {
          return invoke('host.storage.remove', { key: String(key) }, { timeoutMs: 5000 }).then(function () {});
        });
      }
    }
  };

  // When the opaque-origin shim is active, mirror localStorage writes to host
  // storage and hydrate the memory map once the bridge is ready.
  (function wireOpaqueLocalStoragePersistence() {
    var mem = window.__dwOpaqueLocalStorage;
    if (!mem || typeof mem.setItem !== 'function') return;
    var rawSet = mem.setItem.bind(mem);
    var rawRemove = mem.removeItem.bind(mem);
    mem.setItem = function (k, v) {
      rawSet(k, v);
      // Fire-and-forget: large values / offline host must not surface as toasts.
      try {
        var pending = api.storage.set(k, v);
        if (pending && typeof pending.catch === 'function') pending.catch(function () {});
      } catch (e) {}
    };
    mem.removeItem = function (k) {
      rawRemove(k);
      try {
        var pending = api.storage.remove(k);
        if (pending && typeof pending.catch === 'function') pending.catch(function () {});
      } catch (e) {}
    };
    function hydrate() {
      api.storage.getAll().then(function (values) {
        if (!values || typeof values !== 'object') return;
        Object.keys(values).forEach(function (key) {
          if (typeof values[key] === 'string' && mem.getItem(key) == null) {
            rawSet(key, values[key]);
          }
        });
      }).catch(function () {});
    }
    readyPromise.then(hydrate, hydrate);
  })();

  // ready is always the deferred promise — host must not replace it with
  // Promise.resolve(...) or initialize() can await a promise that never settles.
  Object.defineProperty(api, 'ready', {
    configurable: true,
    enumerable: true,
    get: function () { return readyPromise; },
    set: function (value) {
      Promise.resolve(value).then(function (ctx) {
        if (ctx && typeof ctx === 'object') {
          hostContext = ctx;
          api.context = hostContext;
        }
        settleReady();
      }, function () { settleReady(); });
    }
  });

  window.datawisePlugin = api;

  try {
    parent.postMessage({ type: 'datawise-plugin-bridge-hello' }, '*');
  } catch (e) {}
})();
