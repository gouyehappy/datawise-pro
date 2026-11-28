/* Workbench state: open tabs, collections, environments, history, persistence
   and {{variable}} resolution. Persistence prefers the native sidecar (a 0600
   file under the user config directory) and silently falls back to localStorage
   or pure memory. */

(function () {
  const util = HC.util;
  const t = (key, params) => HC.i18n.t(key, params);

  const STORAGE_KEY = "datawise-http-client/store";
  const DEFAULT_HISTORY_LIMIT = 20;
  const MIN_HISTORY_LIMIT = 5;
  const MAX_HISTORY_LIMIT = 200;

  const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "TRACE"];

  const state = {
    tabs: [],
    activeTabId: "",
    collections: [],
    environments: [],
    /** Global variables are available in every environment; env values win. */
    globals: [],
    history: [],
    cookieJar: [],
    activeEnvironmentId: "",
    settings: {
      sidebarWidth: 260,
      sidebarCollapsed: false,
      requestPercent: 45,
      workflowWidth: 560,
      /** Last collection/folder used for quick “new request”. */
      focusCollectionId: "",
      focusFolderId: "",
      historyLimit: DEFAULT_HISTORY_LIMIT,
      sendCookieJar: true
    },
    storePath: "",
    storeDir: "",
    dirConfigured: false,
    memoryOnly: true,
    sideView: "collections",
    loaded: false
  };

  const listeners = new Set();
  let persistTimer = null;

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function emit(reason, payload) {
    listeners.forEach((listener) => {
      try { listener(reason, payload); } catch (error) { console.error(error); }
    });
  }

  /* --------------------------------------------------------- model factory -- */

  function emptyRequest() {
    return {
      id: util.uid("req"),
      name: t("tab.untitled"),
      clientType: "http",
      method: "GET",
      url: "",
      headers: [],
      params: [],
      pathParams: [],
      cookies: [],
      examples: [],
      body: { mode: "none", raw: "", contentType: "application/json", fields: [] },
      auth: { type: "none", username: "", password: "", token: "", key: "", value: "", in: "header" },
      scripts: { pre: "", post: "" },
      runPolicy: "each",
      /** Saved parameter sets ("cases") for one interface. */
      cases: [],
      activeCaseId: "",
      graphql: { query: "", variables: "{}" },
      stream: { sessionId: "", connected: false, log: [], draft: "" },
      options: {
        timeoutMs: 30000,
        followRedirects: true,
        maxRedirects: 10,
        verifyTls: true,
        proxyMode: "environment",
        proxyUrl: "",
        maxBodyBytes: 33554432,
        progressEvents: true,
        retryCount: 0,
        retryBackoffMs: 300,
        retryStatuses: [429, 500, 502, 503, 504],
        retryOnNetwork: false
      }
    };
  }

  function createTab(patch) {
    const incoming = patch || {};
    const clientType = HC.clients
      ? HC.clients.normalizeClientType(incoming)
      : (incoming.clientType || "http");
    const typed = HC.clients ? HC.clients.preset(clientType) : {};
    const tab = Object.assign(emptyRequest(), typed, { section: (typed && typed.section) || "headers" }, incoming, { clientType });
    if (!Array.isArray(tab.pathParams)) tab.pathParams = [];
    if (!Array.isArray(tab.cookies)) tab.cookies = [];
    if (!Array.isArray(tab.examples)) tab.examples = [];
    if (!Array.isArray(tab.cases)) tab.cases = [];
    if (!tab.stream) tab.stream = { sessionId: "", connected: false, log: [], draft: "" };
    tab.response = null;
    tab.sending = false;
    tab.savedRequestId = incoming.savedRequestId || "";
    tab.collectionId = incoming.collectionId || "";
    tab.folderId = incoming.folderId || "";
    tab.dirty = false;
    state.tabs.push(tab);
    state.activeTabId = tab.id;
    persist();
    emit("tabs");
    return tab;
  }

  function createClientTab(clientType) {
    return createTab({ clientType: clientType || "http" });
  }

  function activeTab() {
    return state.tabs.find((tab) => tab.id === state.activeTabId) || state.tabs[0] || null;
  }

  function setActiveTab(id) {
    if (!state.tabs.some((tab) => tab.id === id)) return;
    state.activeTabId = id;
    persist();
    emit("tabs");
  }

  function closeTab(id) {
    const index = state.tabs.findIndex((tab) => tab.id === id);
    if (index < 0) return;
    state.tabs.splice(index, 1);
    if (!state.tabs.length) createTab();
    else if (state.activeTabId === id) state.activeTabId = state.tabs[Math.max(0, index - 1)].id;
    persist();
    emit("tabs");
  }

  /* Closes every tab except the ones whose id survives `keep`, in a single
     persist/emit pass. Used by the tab-strip context menu (close others /
     left / right / all). Always leaves at least one tab open. */
  function closeTabs(keep) {
    const survivors = state.tabs.filter((tab) => keep.indexOf(tab.id) >= 0);
    if (!survivors.length) {
      if (state.tabs.some((tab) => tab.id === state.activeTabId)) {
        state.tabs = state.tabs.filter((tab) => tab.id === state.activeTabId);
      } else {
        state.tabs = state.tabs.slice(0, 1);
      }
      state.activeTabId = state.tabs[0] ? state.tabs[0].id : "";
      if (!state.tabs.length) { createTab(); return; }
    } else {
      state.tabs = survivors;
      if (!survivors.some((tab) => tab.id === state.activeTabId)) {
        const index = keep.indexOf(state.activeTabId);
        state.activeTabId = (survivors[index >= 0 ? Math.min(index, survivors.length - 1) : survivors.length - 1]).id;
      }
    }
    persist();
    emit("tabs");
  }

  function closeTabsToSide(id, side) {
    const index = state.tabs.findIndex((tab) => tab.id === id);
    if (index < 0) return;
    const keep = state.tabs.filter((tab, position) => (side === "left" ? position >= index : position <= index)).map((tab) => tab.id);
    if (keep.length === state.tabs.length) return;
    closeTabs(keep);
  }

  function duplicateTab(id) {
    const source = state.tabs.find((tab) => tab.id === id);
    if (!source) return null;
    const clone = JSON.parse(JSON.stringify(source));
    clone.id = util.uid("req");
    clone.name = t("tab.copySuffix", { name: source.name || t("tab.untitled") });
    // Detach from saved identity — this is an untitled working copy.
    clone.savedRequestId = "";
    clone.collectionId = "";
    clone.folderId = "";
    clone.response = null;
    clone.fullBody = null;
    clone.scriptResults = null;
    clone.stream = null;
    clone.progress = null;
    clone.requestId = "";
    clone.sending = false;
    clone.dirty = true;
    state.tabs.push(clone);
    state.activeTabId = clone.id;
    persist();
    emit("tabs");
    return clone;
  }

  function retargetTreeIds(node) {
    if (!node) return;
    if (node.kind === "folder") {
      node.id = util.uid("folder");
      (node.items || []).forEach(retargetTreeIds);
      return;
    }
    node.id = util.uid("saved");
  }

  /** Tree selection: collection / folder / request. Third arg clears request when "". */
  function setTreeFocus(collectionId, folderId, requestId) {
    state.settings.focusCollectionId = collectionId || "";
    state.settings.focusFolderId = folderId || "";
    if (arguments.length >= 3) state.settings.focusRequestId = requestId || "";
    else state.settings.focusRequestId = "";
    schedulePersist();
  }

  function treeFocus() {
    let collectionId = state.settings.focusCollectionId || "";
    let folderId = state.settings.focusFolderId || "";
    let requestId = state.settings.focusRequestId || "";
    if (requestId) {
      const located = locate(requestId);
      if (!located || located.item.kind !== "request") requestId = "";
      else {
        collectionId = located.collection.id;
        folderId = located.parent ? located.parent.id : "";
      }
    }
    if (collectionId && !state.collections.some((item) => item.id === collectionId)) {
      collectionId = "";
      folderId = "";
      requestId = "";
    }
    if (folderId) {
      const located = locate(folderId);
      if (!located || located.item.kind !== "folder") folderId = "";
      else collectionId = located.collection.id;
    }
    if (!collectionId && state.collections[0]) collectionId = state.collections[0].id;
    return { collectionId, folderId, requestId };
  }

  function syncTreeFocusFromTab(tab) {
    if (!tab) return;
    if (tab.savedRequestId) {
      const located = locate(tab.savedRequestId);
      if (located) {
        setTreeFocus(
          located.collection.id,
          located.parent ? located.parent.id : "",
          tab.savedRequestId
        );
        return;
      }
    }
    if (tab.collectionId) {
      setTreeFocus(tab.collectionId, tab.folderId || "", "");
    }
  }

  function cloneSavedRequest(requestId) {
    const located = locate(requestId);
    if (!located || located.item.kind !== "request") return null;
    const clone = JSON.parse(JSON.stringify(located.item));
    clone.id = util.uid("saved");
    clone.name = t("tab.copySuffix", { name: located.item.name || t("tab.untitled") });
    located.list.splice(located.index + 1, 0, clone);
    setTreeFocus(located.collection.id, located.parent ? located.parent.id : "");
    persist();
    emit("sidebar");
    openSavedRequest(located.collection.id, clone.id);
    return clone;
  }

  /** Clone a folder (and nested items) as the next sibling. */
  function cloneFolder(folderId) {
    const located = locate(folderId);
    if (!located || located.item.kind !== "folder") return null;
    const clone = JSON.parse(JSON.stringify(located.item));
    retargetTreeIds(clone);
    clone.name = t("tab.copySuffix", { name: located.item.name || t("misc.untitledFolder") });
    clone.collapsed = false;
    located.list.splice(located.index + 1, 0, clone);
    persist();
    emit("sidebar");
    return clone;
  }

  function markDirty(tab) {
    if (tab) tab.dirty = true;
    schedulePersist();
    emit("tab-dirty", tab);
  }

  /* ------------------------------------------------------------ collections */

  /* A collection is a tree. `items` holds requests and folders; folders nest
     the same way. Documents saved before 0.1.2 used a flat `requests` array
     (and, if present, a `folders` array). migrateCollection folds both into
     `items` so existing workbenches keep every saved request. */

  function migrateCollections(collections) {
    return (collections || []).map(migrateCollection).filter(Boolean);
  }

  function migrateCollection(collection) {
    if (!collection || typeof collection !== "object" || Array.isArray(collection)) return null;
    const node = {
      id: collection.id || util.uid("col"),
      name: collection.name || t("misc.untitledCollection"),
      collapsed: !!collection.collapsed,
      source: collection.source || "",
      projectKey: collection.projectKey || "",
      auth: Object.assign({ type: "none" }, collection.auth || {}),
      headers: Array.isArray(collection.headers) ? collection.headers : [],
      params: Array.isArray(collection.params) ? collection.params : [],
      cookies: Array.isArray(collection.cookies) ? collection.cookies : [],
      items: []
    };
    if (Array.isArray(collection.items)) {
      collection.items.forEach((item) => {
        const migrated = migrateNode(item);
        if (migrated) node.items.push(migrated);
      });
      return node;
    }
    (collection.folders || []).forEach((folder) => {
      const migrated = migrateNode(Object.assign({ kind: "folder" }, folder));
      if (migrated) node.items.push(migrated);
    });
    (collection.requests || []).forEach((request) => {
      const migrated = migrateNode(Object.assign({ kind: "request" }, request));
      if (migrated) node.items.push(migrated);
    });
    return node;
  }

  function migrateNode(node) {
    if (!node || typeof node !== "object" || Array.isArray(node)) return null;
    const explicit = node.kind === "folder" || node.kind === "request" ? node.kind : "";
    const looksFolder = explicit === "folder" || (
      !explicit && !node.method && node.url === undefined &&
      (Array.isArray(node.items) || Array.isArray(node.folders) || Array.isArray(node.requests))
    );
    if (looksFolder) {
      const folder = {
        kind: "folder",
        id: node.id || util.uid("folder"),
        name: node.name || t("misc.untitledFolder"),
        collapsed: !!node.collapsed,
        auth: Object.assign({ type: "none" }, node.auth || {}),
        headers: Array.isArray(node.headers) ? node.headers : [],
        params: Array.isArray(node.params) ? node.params : [],
        cookies: Array.isArray(node.cookies) ? node.cookies : [],
        items: []
      };
      if (Array.isArray(node.items)) {
        node.items.forEach((child) => {
          const migrated = migrateNode(child);
          if (migrated) folder.items.push(migrated);
        });
      } else {
        (node.folders || []).forEach((child) => {
          const migrated = migrateNode(Object.assign({ kind: "folder" }, child));
          if (migrated) folder.items.push(migrated);
        });
        (node.requests || []).forEach((child) => {
          const migrated = migrateNode(Object.assign({ kind: "request" }, child));
          if (migrated) folder.items.push(migrated);
        });
      }
      return folder;
    }
    return {
      kind: "request",
      id: node.id || util.uid("saved"),
      name: node.name || t("tab.untitled"),
      method: node.method || "GET",
      url: node.url || "",
      headers: node.headers || [],
      params: node.params || [],
      pathParams: node.pathParams || [],
      cookies: node.cookies || [],
      examples: node.examples || [],
      body: node.body || { mode: "none", raw: "", fields: [] },
      auth: node.auth || { type: "none" },
      scripts: Object.assign({ pre: "", post: "" }, node.scripts || {}),
      runPolicy: node.runPolicy === "once" ? "once" : "each",
      options: node.options || {}
    };
  }

  function eachNode(items, visitor, parent) {
    const list = items || [];
    for (let index = 0; index < list.length; index += 1) {
      const item = list[index];
      if (!item) continue;
      if (visitor(item, list, index, parent || null)) return true;
      if (item.kind === "folder" && eachNode(item.items, visitor, item)) return true;
    }
    return false;
  }

  function locate(itemId) {
    if (!itemId) return null;
    for (let index = 0; index < state.collections.length; index += 1) {
      const collection = state.collections[index];
      let found = null;
      eachNode(collection.items, (item, list, itemIndex, parent) => {
        if (item.id === itemId) {
          found = { collection, list, index: itemIndex, item, parent };
          return true;
        }
        return false;
      });
      if (found) return found;
    }
    return null;
  }

  function folderItems(collection, folderId) {
    if (!collection) return null;
    if (!folderId) return collection.items;
    const located = locate(folderId);
    if (!located || located.item.kind !== "folder" || located.collection.id !== collection.id) return null;
    if (!Array.isArray(located.item.items)) located.item.items = [];
    return located.item.items;
  }

  function containsId(item, id) {
    if (!item || item.kind !== "folder" || !id) return false;
    let yes = false;
    eachNode(item.items, (child) => {
      if (child.id === id) { yes = true; return true; }
      return false;
    });
    return yes;
  }

  function folderContains(ancestorFolderId, nodeId) {
    const located = locate(ancestorFolderId);
    if (!located || located.item.kind !== "folder") return false;
    return containsId(located.item, nodeId);
  }

  function countRequests(items) {
    return countTree(items).requests;
  }

  function countTree(items) {
    const counts = { folders: 0, requests: 0 };
    eachNode(items, (item) => {
      if (item.kind === "folder") counts.folders += 1;
      else if (item.kind === "request") counts.requests += 1;
      return false;
    });
    return counts;
  }

  function requestIdsUnder(item) {
    const ids = [];
    if (!item) return ids;
    if (item.kind === "request") {
      ids.push(item.id);
      return ids;
    }
    eachNode(item.items || item, (child) => {
      if (child.kind === "request") ids.push(child.id);
      return false;
    });
    return ids;
  }

  function detachTabs(ids) {
    const set = {};
    (ids || []).forEach((id) => { set[id] = true; });
    state.tabs.forEach((tab) => {
      if (set[tab.savedRequestId]) {
        tab.savedRequestId = "";
        tab.collectionId = "";
        tab.folderId = "";
        tab.dirty = true;
      }
    });
  }

  function listFolders(collectionId) {
    const collection = state.collections.find((item) => item.id === collectionId);
    if (!collection) return [];
    const out = [];
    const walk = (items, prefix) => {
      (items || []).forEach((item) => {
        if (item.kind !== "folder") return;
        const path = prefix ? `${prefix} / ${item.name}` : item.name;
        out.push({ id: item.id, name: item.name, path });
        walk(item.items, path);
      });
    };
    walk(collection.items, "");
    return out;
  }

  function createCollection(name) {
    const collection = {
      id: util.uid("col"),
      name: name || t("misc.untitledCollection"),
      collapsed: false,
      auth: { type: "none", username: "", password: "", token: "", key: "", value: "", in: "header" },
      headers: [],
      params: [],
      cookies: [],
      items: []
    };
    state.collections.push(collection);
    persist();
    emit("sidebar");
    return collection;
  }

  function createFolder(collectionId, parentId, name) {
    const collection = state.collections.find((item) => item.id === collectionId);
    if (!collection) return null;
    const items = folderItems(collection, parentId);
    if (!items) return null;
    const folder = {
      kind: "folder",
      id: util.uid("folder"),
      name: name || t("misc.untitledFolder"),
      collapsed: false,
      auth: { type: "none", username: "", password: "", token: "", key: "", value: "", in: "header" },
      headers: [],
      params: [],
      cookies: [],
      items: []
    };
    items.push(folder);
    collection.collapsed = false;
    if (parentId) {
      const parent = locate(parentId);
      if (parent && parent.item.kind === "folder") parent.item.collapsed = false;
    }
    persist();
    emit("sidebar");
    return folder;
  }

  function toggleCollapsed(id) {
    const collection = state.collections.find((item) => item.id === id);
    if (collection) collection.collapsed = !collection.collapsed;
    else {
      const located = locate(id);
      if (!located || located.item.kind !== "folder") return;
      located.item.collapsed = !located.item.collapsed;
    }
    persist();
    emit("sidebar");
  }

  function requestTitle(tab) {
    if (tab.name && tab.name !== t("tab.untitled")) return tab.name;
    if (!tab.url) return t("tab.untitled");
    try {
      const parsed = new URL(tab.url);
      return `${parsed.pathname}${parsed.search}` || parsed.host;
    } catch (error) {
      return tab.url.slice(0, 40);
    }
  }

  function saveRequestTo(collectionId, tab, name, folderId) {
    let collection = state.collections.find((item) => item.id === collectionId);
    if (!collection) collection = createCollection(t("misc.untitledCollection"));
    if (!Array.isArray(collection.items)) collection.items = [];
    const targetFolderId = folderId === undefined ? (tab.folderId || "") : (folderId || "");
    const snapshot = snapshotRequest(tab, name);
    snapshot.kind = "request";
    let items = folderItems(collection, targetFolderId);
    let resolvedFolder = targetFolderId;
    if (!items) {
      items = collection.items;
      resolvedFolder = "";
    }
    const existing = tab.savedRequestId ? locate(tab.savedRequestId) : null;
    const samePlace = existing && existing.item.kind === "request" &&
      existing.collection.id === collection.id &&
      ((existing.parent && existing.parent.id) || "") === resolvedFolder;
    if (samePlace) existing.list[existing.index] = snapshot;
    else {
      if (existing && existing.item.kind === "request") existing.list.splice(existing.index, 1);
      items.push(snapshot);
    }
    tab.collectionId = collection.id;
    tab.folderId = resolvedFolder;
    tab.savedRequestId = snapshot.id;
    tab.name = snapshot.name;
    tab.dirty = false;
    persist();
    emit("sidebar");
    emit("tabs");
    return snapshot;
  }

  function snapshotRequest(tab, name) {
    return {
      id: tab.savedRequestId || util.uid("saved"),
      name: name || requestTitle(tab),
      clientType: tab.clientType || "http",
      method: tab.method,
      url: tab.url,
      headers: JSON.parse(JSON.stringify(tab.headers || [])),
      params: JSON.parse(JSON.stringify(tab.params || [])),
      pathParams: JSON.parse(JSON.stringify(tab.pathParams || [])),
      cookies: JSON.parse(JSON.stringify(tab.cookies || [])),
      examples: JSON.parse(JSON.stringify(tab.examples || [])),
      body: JSON.parse(JSON.stringify(tab.body || {})),
      auth: JSON.parse(JSON.stringify(tab.auth || {})),
      scripts: JSON.parse(JSON.stringify(tab.scripts || { pre: "", post: "" })),
      runPolicy: tab.runPolicy === "once" ? "once" : "each",
      options: JSON.parse(JSON.stringify(tab.options || {})),
      graphql: JSON.parse(JSON.stringify(tab.graphql || { query: "", variables: "{}" }))
    };
  }

  function saveResponseExample(tab, result, bodyText) {
    if (!tab || !result) return null;
    if (!Array.isArray(tab.examples)) tab.examples = [];
    const example = {
      id: util.uid("ex"),
      name: t("examples.defaultName", { status: result.status || 0 }),
      status: result.status || 0,
      statusText: result.statusText || "",
      contentType: result.contentType || "",
      body: String(bodyText || "").slice(0, 200000),
      headers: (result.headers || []).slice(0, 40).map((row) => ({
        key: row.key, value: row.value
      })),
      at: Date.now()
    };
    tab.examples.unshift(example);
    if (tab.examples.length > 10) tab.examples.length = 10;
    tab.dirty = true;
    if (tab.savedRequestId) {
      saveRequestTo(tab.collectionId, tab, requestTitle(tab), tab.folderId || "");
    } else {
      persist();
      emit("tabs");
    }
    return example;
  }

  function parseSetCookie(raw, requestUrl) {
    const text = String(raw || "").trim();
    if (!text) return null;
    const parts = text.split(";").map((part) => part.trim()).filter(Boolean);
    if (!parts.length) return null;
    const [nameValue, ...attrs] = parts;
    const eq = nameValue.indexOf("=");
    if (eq <= 0) return null;
    const name = nameValue.slice(0, eq).trim();
    const value = nameValue.slice(eq + 1).trim();
    let domain = "";
    let path = "/";
    let expires = "";
    attrs.forEach((attr) => {
      const lower = attr.toLowerCase();
      if (lower.startsWith("domain=")) domain = attr.slice(7).trim();
      else if (lower.startsWith("path=")) path = attr.slice(5).trim() || "/";
      else if (lower.startsWith("expires=")) expires = attr.slice(8).trim();
      else if (lower.startsWith("max-age=")) {
        const seconds = Number(attr.slice(8).trim());
        if (Number.isFinite(seconds)) expires = new Date(Date.now() + seconds * 1000).toISOString();
      }
    });
    if (!domain) {
      try { domain = new URL(requestUrl).hostname; } catch (error) { domain = ""; }
    }
    domain = String(domain || "").replace(/^\./, "").toLowerCase();
    return {
      id: util.uid("ck"),
      domain,
      path: path || "/",
      name,
      value,
      expires,
      enabled: true,
      raw: text
    };
  }

  function hostMatchesCookie(hostname, domain) {
    const host = String(hostname || "").toLowerCase();
    const dom = String(domain || "").toLowerCase().replace(/^\./, "");
    if (!host || !dom) return false;
    return host === dom || host.endsWith(`.${dom}`);
  }

  function ingestSetCookies(requestUrl, setCookies) {
    (setCookies || []).forEach((raw) => {
      const cookie = parseSetCookie(raw, requestUrl);
      if (!cookie) return;
      const existing = state.cookieJar.find((row) => (
        row.domain === cookie.domain
        && row.path === cookie.path
        && row.name === cookie.name
      ));
      if (existing) Object.assign(existing, cookie, { id: existing.id });
      else state.cookieJar.push(cookie);
    });
    if (state.cookieJar.length > 300) state.cookieJar = state.cookieJar.slice(-300);
    persist();
    emit("cookies");
  }

  function cookiesForUrl(requestUrl) {
    let hostname = "";
    let pathname = "/";
    try {
      const parsed = new URL(requestUrl);
      hostname = parsed.hostname;
      pathname = parsed.pathname || "/";
    } catch (error) {
      return [];
    }
    const now = Date.now();
    return state.cookieJar.filter((row) => {
      if (!row || row.enabled === false) return false;
      if (!hostMatchesCookie(hostname, row.domain)) return false;
      const path = row.path || "/";
      if (!(pathname === path || pathname.startsWith(path.endsWith("/") ? path : `${path}/`) || path === "/")) {
        if (!pathname.startsWith(path)) return false;
      }
      if (row.expires) {
        const at = Date.parse(row.expires);
        if (Number.isFinite(at) && at < now) return false;
      }
      return true;
    });
  }

  function clearCookieJar(domain) {
    if (!domain) state.cookieJar = [];
    else {
      const needle = String(domain).toLowerCase().replace(/^\./, "");
      state.cookieJar = state.cookieJar.filter((row) => row.domain !== needle);
    }
    persist();
    emit("cookies");
  }

  function deleteCookie(id) {
    state.cookieJar = state.cookieJar.filter((row) => row.id !== id);
    persist();
    emit("cookies");
  }

  /** Insert or update a jar entry from the Cookie manager dialog. */
  function upsertCookie(row) {
    if (!row || !String(row.name || "").trim()) return null;
    const entry = {
      id: row.id || util.uid("ck"),
      domain: String(row.domain || "").replace(/^\./, "").toLowerCase(),
      path: String(row.path || "/") || "/",
      name: String(row.name).trim(),
      value: String(row.value == null ? "" : row.value),
      expires: String(row.expires || ""),
      enabled: row.enabled !== false
    };
    const existing = state.cookieJar.find((item) => item.id === entry.id);
    if (existing) Object.assign(existing, entry);
    else state.cookieJar.push(entry);
    persist();
    emit("cookies");
    return entry;
  }

  function openSavedRequest(collectionId, requestId) {
    let located = null;
    const hinted = state.collections.find((item) => item.id === collectionId);
    if (hinted) {
      eachNode(hinted.items, (item, list, index, parent) => {
        if (item.kind === "request" && item.id === requestId) {
          located = { collection: hinted, item, parent };
          return true;
        }
        return false;
      });
    }
    if (!located) {
      const found = locate(requestId);
      if (found && found.item.kind === "request") located = found;
    }
    if (!located) return;
    const saved = located.item;
    const existing = state.tabs.find((tab) => tab.savedRequestId === saved.id);
    if (existing) { setActiveTab(existing.id); return; }
    const tab = createTab({
      name: saved.name,
      clientType: HC.clients ? HC.clients.normalizeClientType(saved) : (saved.clientType || "http"),
      method: saved.method,
      url: saved.url,
      headers: JSON.parse(JSON.stringify(saved.headers || [])),
      params: JSON.parse(JSON.stringify(saved.params || [])),
      pathParams: JSON.parse(JSON.stringify(saved.pathParams || [])),
      cookies: JSON.parse(JSON.stringify(saved.cookies || [])),
      examples: JSON.parse(JSON.stringify(saved.examples || [])),
      body: Object.assign({ mode: "none", raw: "", fields: [] }, JSON.parse(JSON.stringify(saved.body || {}))),
      auth: Object.assign({ type: "none" }, JSON.parse(JSON.stringify(saved.auth || {}))),
      scripts: Object.assign({ pre: "", post: "" }, JSON.parse(JSON.stringify(saved.scripts || {}))),
      runPolicy: saved.runPolicy === "once" ? "once" : "each",
      options: Object.assign(emptyRequest().options, saved.options || {}),
      graphql: Object.assign({ query: "", variables: "{}" }, JSON.parse(JSON.stringify(saved.graphql || {}))),
      collectionId: located.collection.id,
      folderId: located.parent ? located.parent.id : "",
      savedRequestId: saved.id
    });
    tab.dirty = false;
    emit("request");
  }

  function deleteSavedRequest(collectionId, requestId) {
    const located = locate(requestId);
    if (!located || located.item.kind !== "request") return;
    if (collectionId && located.collection.id !== collectionId) return;
    located.list.splice(located.index, 1);
    detachTabs([requestId]);
    persist();
    emit("sidebar");
    emit("tabs");
  }

  function deleteFolder(folderId) {
    const located = locate(folderId);
    if (!located || located.item.kind !== "folder") return;
    const ids = requestIdsUnder(located.item);
    located.list.splice(located.index, 1);
    detachTabs(ids);
    persist();
    emit("sidebar");
    emit("tabs");
  }

  function deleteCollection(collectionId) {
    const collection = state.collections.find((item) => item.id === collectionId);
    if (!collection) return;
    const ids = requestIdsUnder({ kind: "folder", items: collection.items });
    state.collections = state.collections.filter((item) => item.id !== collectionId);
    detachTabs(ids);
    persist();
    emit("sidebar");
    emit("tabs");
  }

  function renameCollection(collectionId, name) {
    const collection = state.collections.find((item) => item.id === collectionId);
    if (!collection) return;
    collection.name = name;
    persist();
    emit("sidebar");
  }

  function renameFolder(folderId, name) {
    const located = locate(folderId);
    if (!located || located.item.kind !== "folder") return;
    located.item.name = name;
    persist();
    emit("sidebar");
  }

  function moveItem(itemId, targetCollectionId, targetFolderId, beforeItemId) {
    const located = locate(itemId);
    const target = state.collections.find((item) => item.id === targetCollectionId);
    if (!located || !target || located.item.kind === undefined) return false;
    const folderId = targetFolderId || "";
    if (located.item.kind === "folder") {
      if (folderId === located.item.id || (folderId && containsId(located.item, folderId))) return false;
    }
    if (beforeItemId && beforeItemId === itemId) return false;
    const dest = folderItems(target, folderId);
    if (!dest) return false;
    const item = located.item;
    located.list.splice(located.index, 1);
    // Re-resolve insert index after splice (same-list moves shift later siblings).
    let insertAt = dest.length;
    if (beforeItemId) {
      const idx = dest.findIndex((entry) => entry.id === beforeItemId);
      if (idx >= 0) insertAt = idx;
    }
    dest.splice(insertAt, 0, item);
    if (item.kind === "request") {
      state.tabs.forEach((tab) => {
        if (tab.savedRequestId === item.id) {
          tab.collectionId = target.id;
          tab.folderId = folderId;
        }
      });
    } else {
      const ids = {};
      requestIdsUnder(item).forEach((id) => { ids[id] = true; });
      state.tabs.forEach((tab) => {
        if (ids[tab.savedRequestId]) {
          tab.collectionId = target.id;
          // Keep existing folderId for nested requests; only collection changes when moving a folder across collections.
        }
      });
    }
    target.collapsed = false;
    if (folderId) {
      const parent = locate(folderId);
      if (parent && parent.item.kind === "folder") parent.item.collapsed = false;
    }
    persist();
    emit("sidebar");
    emit("tabs");
    return true;
  }

  function rekeyItems(items) {
    (items || []).forEach((item) => {
      item.id = util.uid(item.kind === "folder" ? "folder" : "saved");
      if (item.kind === "folder") rekeyItems(item.items);
    });
  }

  function importCollection(raw) {
    const migrated = migrateCollection(raw);
    if (!migrated) return null;
    migrated.id = util.uid("col");
    if (raw && raw.source) migrated.source = raw.source;
    if (raw && raw.projectKey) migrated.projectKey = raw.projectKey;
    rekeyItems(migrated.items);
    state.collections.push(migrated);
    return migrated;
  }

  function removeCollectionsByProject(projectKey) {
    if (!projectKey) return 0;
    const before = state.collections.length;
    const removedIds = [];
    state.collections = state.collections.filter((collection) => {
      const match = collection.source === "apipost" && collection.projectKey === projectKey;
      if (match) removedIds.push(collection.id);
      return !match;
    });
    // Also drop legacy duplicate imports that share the same display name.
    state.collections = state.collections.filter((collection) => {
      if (removedIds.indexOf(collection.id) >= 0) return false;
      if (collection.name === projectKey && collection.source === "apipost") {
        removedIds.push(collection.id);
        return false;
      }
      if ((collection.name === "ApiPost 导入" || collection.name === projectKey) && !collection.items.length) {
        removedIds.push(collection.id);
        return false;
      }
      return true;
    });
    return before - state.collections.length;
  }

  /* --------------------------------------------------------------- history -- */

  function pushHistory(tab, result) {
    if (!tab.url) return;
    const templateUrl = tab.url;
    const resolvedUrl = (result && (result.finalUrl || result.url))
      || resolve(templateUrl)
      || templateUrl;
    state.history.unshift({
      id: util.uid("hist"),
      at: new Date().toISOString(),
      method: tab.method,
      url: templateUrl,
      resolvedUrl,
      status: result && result.status ? result.status : 0,
      ok: !!(result && result.ok),
      durationMs: (result && result.durationMs) || 0,
      snapshot: snapshotRequest(tab, requestTitle(tab))
    });
    trimHistory();
    persist();
    emit("sidebar");
  }

  /** Prefer the URL that was actually sent; fall back to resolving templates with the current env. */
  function historyResolvedUrl(entry) {
    if (!entry) return "";
    const stored = entry.resolvedUrl && String(entry.resolvedUrl).trim();
    if (stored) return stored;
    const template = entry.url && String(entry.url).trim();
    if (!template) return "";
    return resolve(template) || template;
  }

  function historyLimit() {
    const n = Number(state.settings && state.settings.historyLimit);
    if (!Number.isFinite(n)) return DEFAULT_HISTORY_LIMIT;
    return Math.min(MAX_HISTORY_LIMIT, Math.max(MIN_HISTORY_LIMIT, Math.round(n)));
  }

  function setHistoryLimit(value) {
    const raw = Number(value);
    const clamped = !Number.isFinite(raw)
      ? DEFAULT_HISTORY_LIMIT
      : Math.min(MAX_HISTORY_LIMIT, Math.max(MIN_HISTORY_LIMIT, Math.round(raw)));
    state.settings.historyLimit = clamped;
    trimHistory();
    persist();
    emit("sidebar");
    return clamped;
  }

  function trimHistory() {
    const limit = historyLimit();
    if (state.history.length > limit) state.history.length = limit;
  }

  function clearHistory() {
    state.history = [];
    persist();
    emit("sidebar");
  }

  function openHistoryEntry(id) {
    const entry = state.history.find((item) => item.id === id);
    if (!entry) return;
    const saved = entry.snapshot;
    createTab({
      name: requestTitle(saved), method: saved.method, url: saved.url,
      headers: JSON.parse(JSON.stringify(saved.headers || [])),
      params: JSON.parse(JSON.stringify(saved.params || [])),
      pathParams: JSON.parse(JSON.stringify(saved.pathParams || [])),
      cookies: JSON.parse(JSON.stringify(saved.cookies || [])),
      body: JSON.parse(JSON.stringify(saved.body || {})),
      auth: JSON.parse(JSON.stringify(saved.auth || {})),
      scripts: Object.assign({ pre: "", post: "" }, JSON.parse(JSON.stringify(saved.scripts || {}))),
      options: Object.assign(emptyRequest().options, saved.options || {})
    });
    emit("request");
  }

  /* ---------------------------------------------------------- environments -- */

  function createEnvironment(name) {
    const environment = { id: util.uid("env"), name: name || t("misc.environment"), variables: [util.emptyRow()] };
    state.environments.push(environment);
    if (!state.activeEnvironmentId) state.activeEnvironmentId = environment.id;
    persist();
    emit("environments");
    return environment;
  }

  function deleteEnvironment(id) {
    state.environments = state.environments.filter((item) => item.id !== id);
    if (state.activeEnvironmentId === id) state.activeEnvironmentId = (state.environments[0] || {}).id || "";
    persist();
    emit("environments");
  }

  function moveEnvironmentBy(id, delta) {
    const list = state.environments.slice();
    const from = list.findIndex((item) => item.id === id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= list.length) return false;
    const tmp = list[from];
    list[from] = list[to];
    list[to] = tmp;
    state.environments = list;
    persist();
    emit("environments");
    return true;
  }

  /** Place `id` before `beforeId` (empty beforeId = append to end). */
  function reorderEnvironment(id, beforeId) {
    if (id && beforeId && id === beforeId) return false;
    const list = state.environments.slice();
    const from = list.findIndex((item) => item.id === id);
    if (from < 0) return false;
    const [env] = list.splice(from, 1);
    if (!beforeId) list.push(env);
    else {
      const to = list.findIndex((item) => item.id === beforeId);
      if (to < 0) list.push(env);
      else list.splice(to, 0, env);
    }
    state.environments = list;
    persist();
    emit("environments");
    return true;
  }

  function activeEnvironment() {
    return state.environments.find((item) => item.id === state.activeEnvironmentId) || null;
  }

  function setActiveEnvironment(id) {
    state.activeEnvironmentId = id;
    persist();
    emit("environments");
    emit("request");
  }

  /* ------------------------------------------------------------ variables -- */

  function variableMap() {
    const map = {};
    // Globals first so the active environment can override any shared key.
    (state.globals || []).forEach((row) => {
      if (!row || row.enabled === false || !row.key) return;
      map[row.key] = row.value;
    });
    const environment = activeEnvironment();
    if (environment) {
      (environment.variables || []).forEach((row) => {
        if (row.enabled === false || !row.key) return;
        map[row.key] = row.value;
      });
    }
    return map;
  }

  /* Built-in {{$…}} tokens resolved at send time (and for hover previews).
     Keep names Postman-compatible where it matters; extras use the same $ prefix. */
  const DYNAMIC_VARIABLES = [
    { name: "$uuid", group: "id" },
    { name: "$guid", group: "id" },
    { name: "$timestamp", group: "time" },
    { name: "$timestampMs", group: "time" },
    { name: "$isoTimestamp", group: "time" },
    { name: "$date", group: "time" },
    { name: "$time", group: "time" },
    { name: "$datetime", group: "time" },
    { name: "$year", group: "time" },
    { name: "$month", group: "time" },
    { name: "$day", group: "time" },
    { name: "$randomInt", group: "random" },
    { name: "$randomFloat", group: "random" },
    { name: "$randomBoolean", group: "random" },
    { name: "$randomString", group: "random" },
    { name: "$randomAlphaNumeric", group: "random" },
    { name: "$randomHex", group: "random" },
    { name: "$randomEmail", group: "random" },
    { name: "$randomIpv4", group: "random" }
  ];

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function randomHex(length) {
    let out = "";
    for (let index = 0; index < length; index += 1) {
      out += Math.floor(Math.random() * 16).toString(16);
    }
    return out;
  }

  function randomAlphaNumeric(length) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let out = "";
    for (let index = 0; index < length; index += 1) {
      out += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    }
    return out;
  }

  function newUuid() {
    return crypto.randomUUID ? crypto.randomUUID() : util.uid("uuid");
  }

  function dynamicVariable(name) {
    const now = new Date();
    switch (name) {
      case "$uuid":
      case "$guid":
        return newUuid();
      case "$timestamp":
        return String(Math.floor(now.getTime() / 1000));
      case "$timestampMs":
        return String(now.getTime());
      case "$isoTimestamp":
        return now.toISOString();
      case "$date":
        return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
      case "$time":
        return `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
      case "$datetime":
        return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
      case "$year":
        return String(now.getFullYear());
      case "$month":
        return pad2(now.getMonth() + 1);
      case "$day":
        return pad2(now.getDate());
      case "$randomInt":
        return String(Math.floor(Math.random() * 1000));
      case "$randomFloat":
        return (Math.random() * 1000).toFixed(6);
      case "$randomBoolean":
        return Math.random() > 0.5 ? "true" : "false";
      case "$randomString":
        return Math.random().toString(36).slice(2, 12);
      case "$randomAlphaNumeric":
        return randomAlphaNumeric(10);
      case "$randomHex":
        return randomHex(8);
      case "$randomEmail":
        return `user_${randomAlphaNumeric(8).toLowerCase()}@example.com`;
      case "$randomIpv4":
        return `${1 + Math.floor(Math.random() * 223)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;
      default:
        return null;
    }
  }

  function isDynamicVariable(name) {
    const key = String(name || "").trim();
    if (!key.startsWith("$")) return false;
    return DYNAMIC_VARIABLES.some((item) => item.name === key);
  }

  function listDynamicVariables() {
    return DYNAMIC_VARIABLES.slice();
  }

  function resolve(text, vars) {
    if (!text) return text;
    const table = vars || variableMap();
    return String(text).replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, rawName) => {
      const name = rawName.trim();
      if (name.startsWith("$")) {
        const value = dynamicVariable(name);
        return value === null ? match : value;
      }
      return Object.prototype.hasOwnProperty.call(table, name) ? table[name] : match;
    });
  }

  function unresolvedVariables(text, vars) {
    if (!text) return [];
    const table = vars || variableMap();
    const missing = [];
    String(text).replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, rawName) => {
      const name = rawName.trim();
      if (name.startsWith("$")) return match;
      if (!Object.prototype.hasOwnProperty.call(table, name) && missing.indexOf(name) < 0) missing.push(name);
      return match;
    });
    return missing;
  }

  function activeRows(rows) {
    return (rows || []).filter((row) => row && row.enabled !== false && String(row.key || "").trim() !== "");
  }

  function folderPath(collection, folderId) {
    if (!collection || !folderId) return [];
    const path = [];
    const walk = (items, trail) => {
      const list = items || [];
      for (let i = 0; i < list.length; i += 1) {
        const item = list[i];
        if (!item || item.kind !== "folder") continue;
        const next = trail.concat(item);
        if (item.id === folderId) {
          path.push(...next);
          return true;
        }
        if (walk(item.items, next)) return true;
      }
      return false;
    };
    walk(collection.items, []);
    return path;
  }

  /** Collection → nested folders. Request-level values override inherited ones. */
  function resolveInherited(tab) {
    const collection = state.collections.find((item) => item.id === (tab && tab.collectionId));
    const chain = [];
    if (collection) {
      chain.push(collection);
      folderPath(collection, tab && tab.folderId).forEach((folder) => chain.push(folder));
    }
    const mergeRows = (map, rows) => {
      (rows || []).forEach((row) => {
        if (!row || row.enabled === false || !String(row.key || "").trim()) return;
        map.set(String(row.key).toLowerCase(), {
          key: row.key,
          value: row.value || "",
          enabled: true,
          description: row.description || ""
        });
      });
    };
    const headerMap = new Map();
    const paramMap = new Map();
    const cookieMap = new Map();
    let auth = { type: "none", username: "", password: "", token: "", key: "", value: "", in: "header" };
    chain.forEach((node) => {
      mergeRows(headerMap, node.headers);
      mergeRows(paramMap, node.params);
      mergeRows(cookieMap, node.cookies);
      if (node.auth && node.auth.type && node.auth.type !== "none") {
        auth = Object.assign({
          type: "none", username: "", password: "", token: "", key: "", value: "", in: "header"
        }, node.auth);
      }
    });
    mergeRows(headerMap, tab && tab.headers);
    mergeRows(paramMap, tab && tab.params);
    mergeRows(cookieMap, tab && tab.cookies);
    const tabAuth = tab && tab.auth;
    if (tabAuth && tabAuth.type && tabAuth.type !== "none" && tabAuth.type !== "inherit") {
      auth = Object.assign({}, tabAuth);
    }
    return {
      auth,
      headers: Array.from(headerMap.values()),
      params: Array.from(paramMap.values()),
      cookies: Array.from(cookieMap.values()),
      inheritedAuth: !(tabAuth && tabAuth.type && tabAuth.type !== "none" && tabAuth.type !== "inherit")
        && auth.type !== "none"
    };
  }

  /* Builds the RPC payload for the sidecar with every variable resolved. */
  function buildSpec(tab, requestId, varsOverride) {
    if (tab && tab.clientType === "graphql" && HC.clients) HC.clients.syncGraphqlBody(tab);
    const vars = varsOverride || variableMap();
    const resolveText = (value) => resolve(value, vars);
    let url = resolveText(tab.url).trim();
    (tab.pathParams || []).forEach((row) => {
      if (!row || !row.key || row.enabled === false) return;
      const value = resolveText(row.value == null ? "" : String(row.value));
      if (!value) return;
      const colon = `:${row.key}`;
      const brace = `{${row.key}}`;
      if (url.indexOf(colon) >= 0) url = url.split(colon).join(encodeURIComponent(value));
      else if (url.indexOf(brace) >= 0) url = url.split(brace).join(encodeURIComponent(value));
    });
    const inherited = resolveInherited(tab);
    // Folder/collection-level query params are appended only when the key is
    // not already in the URL. tab.params are synced into tab.url by
    // view-request before send, so this never duplicates them; workflow steps
    // (which skip that sync) still get their params.
    if (inherited.params.length) {
      const hashAt = url.indexOf("#");
      const beforeHash = hashAt >= 0 ? url.slice(0, hashAt) : url;
      const hashPart = hashAt >= 0 ? url.slice(hashAt) : "";
      const qAt = beforeHash.indexOf("?");
      const present = new Set();
      if (qAt >= 0) {
        beforeHash.slice(qAt + 1).split("&").forEach((part) => {
          const raw = part.split("=")[0];
          if (!raw) return;
          try { present.add(decodeURIComponent(raw).toLowerCase()); }
          catch (error) { present.add(raw.toLowerCase()); }
        });
      }
      const extra = [];
      activeRows(inherited.params).forEach((row) => {
        const key = resolveText(row.key);
        if (!key || present.has(key.toLowerCase())) return;
        present.add(key.toLowerCase());
        extra.push(`${encodeURIComponent(key)}=${encodeURIComponent(resolveText(row.value || ""))}`);
      });
      if (extra.length) url = beforeHash + (qAt >= 0 ? "&" : "?") + extra.join("&") + hashPart;
    }
    const headers = activeRows(inherited.headers).map((row) => ({
      key: resolveText(row.key),
      value: resolveText(row.value),
      enabled: true
    }));
    const cookieMap = new Map();
    const addCookies = (rows) => activeRows(rows).forEach((row) => {
      const key = resolveText(row.key);
      if (key) cookieMap.set(key, resolveText(row.value == null ? "" : String(row.value)));
    });
    addCookies(inherited.cookies);
    addCookies(tab.cookies);
    const cookieParts = Array.from(cookieMap.entries())
      .map(([key, value]) => `${key}=${value}`)
      .filter((part) => part && part !== "=");
    if (state.settings.sendCookieJar !== false) {
      cookiesForUrl(url).forEach((row) => {
        if (!row.name) return;
        cookieParts.push(`${row.name}=${row.value || ""}`);
      });
    }
    if (cookieParts.length) {
      const existing = headers.find((row) => String(row.key).toLowerCase() === "cookie");
      const joined = cookieParts.join("; ");
      if (existing) {
        existing.value = existing.value ? `${existing.value}; ${joined}` : joined;
      } else {
        headers.push({ key: "Cookie", value: joined, enabled: true });
      }
    }
    const auth = inherited.auth || tab.auth || { type: "none" };
    const spec = {
      requestId,
      method: tab.method,
      url,
      headers,
      body: { mode: tab.body.mode, raw: "", contentType: "", fields: [] },
      auth: {
        type: auth.type === "inherit" ? "none" : auth.type,
        username: resolveText(auth.username),
        password: resolveText(auth.password),
        token: resolveText(auth.token),
        key: resolveText(auth.key),
        value: resolveText(auth.value),
        in: auth.in
      },
      options: {
        timeoutMs: Number(tab.options.timeoutMs) || 30000,
        followRedirects: tab.options.followRedirects !== false,
        maxRedirects: Number(tab.options.maxRedirects) || 10,
        verifyTls: tab.options.verifyTls !== false,
        maxBodyBytes: Number(tab.options.maxBodyBytes) || 33554432,
        progressEvents: true,
        proxyMode: tab.options.proxyMode || "environment",
        proxyUrl: resolveText(tab.options.proxyUrl)
      }
    };
    if (tab.body.mode === "raw") {
      let raw = resolveText(tab.body.raw);
      const contentType = tab.body.contentType || "";
      // JSONC: keep // and /* */ in the editor; strip before wire so APIs get strict JSON.
      if (util.isJsonContentType(contentType) && raw) {
        raw = util.stripJsonComments(raw);
      }
      spec.body.raw = raw;
      spec.body.contentType = contentType;
    } else if (tab.body.mode === "urlencoded" || tab.body.mode === "formdata") {
      spec.body.fields = activeRows(tab.body.fields).map((row) => ({
        key: resolveText(row.key),
        value: row.kind === "file" ? "" : resolveText(row.value),
        kind: row.kind === "file" ? "file" : "text",
        fileName: row.fileName || "",
        contentType: row.kind === "file" ? (row.contentType || "") : "",
        dataBase64: row.dataBase64 || ""
      }));
    }
    return spec;
  }

  function collectMissingVariables(tab) {
    const vars = variableMap();
    const parts = [tab.url];
    const pushRows = (rows) => {
      (rows || []).forEach((row) => {
        if (!row || row.enabled === false) return;
        parts.push(row.key, row.value);
      });
    };
    pushRows(tab.headers);
    pushRows(tab.params);
    pushRows(tab.pathParams);
    pushRows(tab.cookies);
    if (tab.body && tab.body.mode === "raw") parts.push(tab.body.raw);
    if (tab.body) pushRows(tab.body.fields);
    if (tab.auth) {
      ["username", "password", "token", "key", "value"].forEach((key) => parts.push(tab.auth[key]));
    }
    if (tab.options) parts.push(tab.options.proxyUrl);
    const missing = new Set();
    parts.forEach((part) => unresolvedVariables(part, vars).forEach((name) => missing.add(name)));
    return Array.from(missing);
  }

  /* ----------------------------------------------------------- persistence -- */

  const SENSITIVE_KEY = /(token|secret|password|passwd|api[_-]?key|authorization|cookie|credential)/i;

  /** Deep copy with credentials masked, for export/share dialogs. */
  function redactForExport(data) {
    const out = JSON.parse(JSON.stringify(data || {}));
    const redactAuth = (auth) => {
      if (!auth || typeof auth !== "object") return;
      ["password", "token", "value"].forEach((key) => {
        if (auth[key]) auth[key] = "{{REDACTED}}";
      });
    };
    const redactHeaders = (headers) => {
      (headers || []).forEach((header) => {
        if (header && SENSITIVE_KEY.test(header.key || "") && header.value) {
          header.value = "{{REDACTED}}";
        }
      });
    };
    const walk = (items) => {
      (items || []).forEach((item) => {
        redactAuth(item.auth);
        redactHeaders(item.headers);
        if (item.body && item.body.fields) redactHeaders(item.body.fields);
        if (item.items) walk(item.items);
      });
    };
    (out.collections || []).forEach((collection) => walk(collection.items));
    const redactRows = (rows) => (rows || []).forEach((row) => {
      if (row && (row.secret || SENSITIVE_KEY.test(row.key || "")) && row.value) row.value = "{{REDACTED}}";
    });
    (out.environments || []).forEach((environment) => redactRows(environment.variables));
    redactRows(out.globals);
    (out.tabs || []).forEach((tab) => { redactAuth(tab.auth); redactHeaders(tab.headers); });
    out.cookieJar = [];
    return out;
  }

  function serializable() {
    return {
      version: 2,
      collections: state.collections,
      environments: state.environments,
      globals: state.globals,
      activeEnvironmentId: state.activeEnvironmentId,
      history: state.history,
      cookieJar: state.cookieJar,
      settings: state.settings,
      tabs: state.tabs.map((tab) => ({
        name: tab.name,
        clientType: tab.clientType || "http",
        method: tab.method,
        url: tab.url,
        headers: tab.headers,
        params: tab.params,
        pathParams: tab.pathParams || [],
        cookies: tab.cookies || [],
        examples: tab.examples || [],
        body: tab.body,
        auth: tab.auth,
        scripts: tab.scripts || { pre: "", post: "" },
        options: tab.options,
        cases: tab.cases || [],
        activeCaseId: tab.activeCaseId || "",
        graphql: tab.graphql || { query: "", variables: "{}" },
        collectionId: tab.collectionId,
        folderId: tab.folderId || "",
        savedRequestId: tab.savedRequestId,
        section: tab.section
      }))
    };
  }

  function hydrate(document) {
    if (!document || typeof document !== "object") return;
    if (Array.isArray(document.collections)) state.collections = migrateCollections(document.collections);
    if (Array.isArray(document.environments)) state.environments = document.environments;
    if (Array.isArray(document.globals)) state.globals = document.globals;
    if (Array.isArray(document.history)) {
      state.history = document.history;
      trimHistory();
    }
    if (Array.isArray(document.cookieJar)) state.cookieJar = document.cookieJar;
    if (document.activeEnvironmentId) state.activeEnvironmentId = document.activeEnvironmentId;
    if (document.settings) {
      Object.assign(state.settings, document.settings);
      state.settings.historyLimit = historyLimit();
    }
    if (document.storePath) state.storePath = document.storePath;
    if (Array.isArray(document.tabs) && document.tabs.length) {
      document.tabs.forEach((saved) => {
        const clientType = HC.clients ? HC.clients.normalizeClientType(saved) : (saved.clientType || "http");
        const typed = HC.clients ? HC.clients.preset(clientType) : {};
        const tab = Object.assign(emptyRequest(), typed, saved, { clientType });
        tab.id = util.uid("req");
        tab.response = null;
        tab.sending = false;
        tab.dirty = false;
        tab.section = saved.section || typed.section || "params";
        tab.folderId = saved.folderId || "";
        if (!tab.stream) tab.stream = { sessionId: "", connected: false, log: [], draft: "" };
        state.tabs.push(tab);
      });
      state.activeTabId = state.tabs[0].id;
    }
  }

  function writeLocalCache() {
    // Sidecar store/save is the source of truth (up to 4 MiB). Opaque-origin
    // frames shim localStorage → host UI storage, which is a small prefs
    // cache — never dump the full collections/history document there.
    if (HC.bridge.backendReady) return;
    try {
      const raw = JSON.stringify(serializable());
      // Soft cap: stay under the host UI-storage per-value limit so a cold
      // open without sidecar still gets a usable prefs/tabs snapshot.
      if (raw.length > 200 * 1024) return;
      window.localStorage.setItem(STORAGE_KEY, raw);
    } catch (error) { /* opaque origin or quota exceeded */ }
  }

  function readLocalCache() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function schedulePersist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(persist, 700);
  }

  let memoryNoticeActive = false;
  function setMemoryOnly(active, reason) {
    if (state.memoryOnly !== active || (active && !memoryNoticeActive)) {
      state.memoryOnly = active;
      memoryNoticeActive = active;
      emit(active ? "memory-only" : "memory-ok", active ? reason : "");
    }
  }

  async function persist() {
    clearTimeout(persistTimer);
    const document = serializable();
    writeLocalCache();
    if (!HC.bridge.backendReady) {
      setMemoryOnly(true, "backend");
      return;
    }
    try {
      // The sidecar owns the authoritative store path; sending the configured
      // directory along lets a change made elsewhere stick on the next save.
      const result = await HC.bridge.saveStore(document, state.storeDir && state.dirConfigured ? state.storeDir : "");
      setMemoryOnly(false);
      state.storePath = result.path || state.storePath;
      if (result.dir) state.storeDir = result.dir;
      if (result.configured !== undefined) state.dirConfigured = !!result.configured;
    } catch (error) {
      // Silent failure here used to leave users editing without persistence.
      setMemoryOnly(true, (error && error.message) || "save failed");
    }
  }

  /* Points the sidecar at a new storage directory and immediately writes the
     current snapshot there, so switching directories never loses the session. */
  async function setStoreDir(dir) {
    const result = await HC.bridge.setStoreDir(String(dir || "").trim());
    if (result && result.dir) {
      state.storeDir = result.dir;
      state.storePath = result.path || state.storePath;
      state.dirConfigured = !!result.configured;
    }
    await persist();
    emit("settings");
    return result;
  }

  async function init() {
    const cached = readLocalCache();
    let sawDocument = !!cached;
    hydrate(cached);
    if (HC.bridge.backendReady) {
      try {
        const result = await HC.bridge.loadStore();
        state.storePath = result.path || "";
        if (result.dir) state.storeDir = result.dir;
        state.dirConfigured = !!result.configured;
        state.memoryOnly = false;
        if (result && result.exists) sawDocument = true;
        if (result.store) {
          state.tabs = [];
          state.collections = [];
          state.environments = [];
          state.history = [];
          state.activeEnvironmentId = "";
          hydrate(result.store);
          sawDocument = true;
        }
      } catch (error) {
        state.memoryOnly = true;
      }
      // A directory carried by the connection form is authoritative for this
      // session: push it to the sidecar so both sides agree on one location.
      const contextDir = HC.bridge.contextDir;
      if (contextDir) {
        try {
          const applied = await HC.bridge.setStoreDir(contextDir);
          if (applied && applied.dir) {
            state.storeDir = applied.dir;
            state.storePath = applied.path || state.storePath;
            state.dirConfigured = !!applied.configured;
            if (state.storeDir !== contextDir) {
              // The sidecar normalised (or already used) a different path.
            }
          }
          const reloaded = await HC.bridge.loadStore();
          if (reloaded && reloaded.store) {
            state.tabs = [];
            state.collections = [];
            state.environments = [];
            state.history = [];
            state.activeEnvironmentId = "";
            hydrate(reloaded.store);
            sawDocument = true;
          } else if (reloaded && reloaded.exists) {
            sawDocument = true;
          }
        } catch (error) {
          // Keep the already-loaded document; the sidecar still persists.
        }
      }
    } else {
      state.memoryOnly = true;
    }
    // A brand-new profile gets one empty collection. A store that already
    // exists — even with an empty collection list — is left alone, so deleting
    // the last collection stays deleted.
    if (!state.collections.length && !sawDocument) {
      createCollection(t("misc.untitledCollection"));
    }
    if (!state.tabs.length) createTab();
    state.loaded = true;
    emit("loaded");
    emit("tabs");
    emit("sidebar");
    emit("environments");
  }

  window.HC.store = {
    state, METHODS, subscribe, emit, init, persist, schedulePersist, setStoreDir,
    createTab, createClientTab, activeTab, setActiveTab, closeTab, closeTabs, closeTabsToSide, duplicateTab, markDirty,
    emptyRequest, snapshotRequest, requestTitle,
    resolveInherited, syncTreeFocusFromTab,
    createCollection, renameCollection, deleteCollection,
    createFolder, renameFolder, deleteFolder, toggleCollapsed,
    saveRequestTo, openSavedRequest, deleteSavedRequest, cloneSavedRequest, cloneFolder,
    setTreeFocus, treeFocus,
    moveItem, listFolders, countRequests, countTree, locate, folderContains,
    importCollection, removeCollectionsByProject, migrateCollection,
    DEFAULT_HISTORY_LIMIT, MIN_HISTORY_LIMIT, MAX_HISTORY_LIMIT,
    historyLimit, setHistoryLimit, historyResolvedUrl, pushHistory, clearHistory, openHistoryEntry,
    createEnvironment, deleteEnvironment, moveEnvironmentBy, reorderEnvironment,
    activeEnvironment, setActiveEnvironment,
    variableMap, resolve, unresolvedVariables, collectMissingVariables, buildSpec,
    saveResponseExample, ingestSetCookies, cookiesForUrl, clearCookieJar, deleteCookie, upsertCookie, parseSetCookie,
    DYNAMIC_VARIABLES, listDynamicVariables, isDynamicVariable, dynamicVariable,
    serializable, redactForExport, hydrate
  };
})();
