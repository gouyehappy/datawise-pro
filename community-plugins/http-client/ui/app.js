/* Workbench shell: tab strip, toolbars, splitters, shortcuts and the boot
   sequence. */

(function () {
  const util = HC.util;
  const store = HC.store;
  const bridge = HC.bridge;
  const t = (key, params) => HC.i18n.t(key, params);
  const el = util.el;

  const VERSION = "0.1.0";

  function staticLabels() {
    document.documentElement.lang = HC.i18n.locale;
    document.title = t("brand");
    util.$("#brand-name").textContent = t("brand");
    util.$("#btn-toggle-sidebar").title = t("side.toggle");
    util.$("#btn-import-curl").textContent = t("action.importCurl");
    const dynBtn = util.$("#btn-dynamic-vars");
    if (dynBtn) dynBtn.textContent = t("action.dynamicVars");
    util.$("#btn-settings").textContent = t("action.settings");
    util.$("#btn-send").textContent = t("action.send");
    util.$("#btn-cancel").textContent = t("action.cancel");
    util.$("#btn-save").title = t("action.save");
    util.$("#btn-copy-curl").title = t("action.copyCurl");
    const titleInput = util.$("#request-title");
    if (titleInput) titleInput.placeholder = t("request.namePlaceholder");
    util.$$(".hc-side-tab").forEach((button) => {
      button.textContent = t(`side.${button.dataset.sideView}`);
      button.classList.toggle("is-active", button.dataset.sideView === store.state.sideView);
    });
    renderEnvironmentSelect();
  }

  /* ------------------------------------------------------------ tab strip -- */

  async function confirmCloseTab(tab) {
    if (!tab || !tab.dirty) return true;
    return util.confirmDialog({
      title: t("tab.closeDirtyTitle"),
      message: t("tab.closeDirtyMessage", { name: store.requestTitle(tab) }),
      confirmLabel: t("action.close"),
      kind: "danger"
    });
  }

  async function confirmCloseMany(tabs) {
    const dirty = (tabs || []).filter((tab) => tab && tab.dirty);
    if (!dirty.length) return true;
    return util.confirmDialog({
      title: t("tab.closeDirtyTitle"),
      message: t("tab.closeDirtyMany", { count: dirty.length }),
      confirmLabel: t("action.close"),
      kind: "danger"
    });
  }

  function renderTabs() {
    if (store.state.sideView === "environments") {
      if (HC.viewEnv) HC.viewEnv.renderTabs();
      return;
    }
    const host = util.clear(util.$("#tabstrip"));
    store.state.tabs.forEach((tab) => {
      const active = tab.id === store.state.activeTabId;
      const node = el("div", {
        class: `hc-tab${active ? " is-active" : ""}${tab.sending ? " is-sending" : ""}${(tab.stream && tab.stream.connected) ? " is-live" : ""}`,
        title: store.requestTitle(tab)
      }, [
        el("span", {
          class: `hc-tag m-${(tab.clientType && tab.clientType !== "http") ? tab.clientType : tab.method}`,
          text: (HC.clients && HC.clients.CLIENT_META[tab.clientType] && tab.clientType !== "http")
            ? HC.clients.CLIENT_META[tab.clientType].tag
            : tab.method
        }),
        el("span", { class: "hc-tab-label", text: store.requestTitle(tab) }),
        tab.sending ? el("span", { class: "hc-tab-spinner", "aria-hidden": "true" }) : null,
        tab.dirty && !tab.sending ? el("span", { class: "hc-tab-dot", title: t("tab.unsaved") }) : null,
        el("button", {
          class: "hc-tab-close", type: "button", text: "✕", title: t("action.close"),
          on: {
            click: async (event) => {
              event.stopPropagation();
              if (await confirmCloseTab(tab)) store.closeTab(tab.id);
            }
          }
        })
      ]);
      node.addEventListener("click", () => {
        store.setActiveTab(tab.id);
        HC.viewRequest.render();
        HC.viewResponse.render();
      });
      node.addEventListener("contextmenu", (event) => openTabMenu(event, tab));
      node.addEventListener("auxclick", async (event) => {
        if (event.button !== 1) return;
        if (await confirmCloseTab(tab)) store.closeTab(tab.id);
      });
      host.append(node);
    });
    host.append(buildAddButton());
  }

  let addMenuNode = null;

  function closeAddMenu() {
    if (addMenuNode) {
      addMenuNode.remove();
      addMenuNode = null;
    }
  }

  function buildAddButton() {
    return el("button", {
      class: "hc-tab-add",
      type: "button",
      title: t("action.newRequest"),
      text: "+",
      on: {
        click: (event) => {
          event.stopPropagation();
          createHttpRequest();
        }
      }
    });
  }

  function addMenuItem(opts) {
    const item = el("button", {
      type: "button",
      class: `hc-add-item${opts.wide ? " is-wide" : ""}${opts.disabled ? " is-disabled" : ""}`,
      role: "menuitem",
      disabled: opts.disabled ? "true" : undefined
    });
    const icon = el("span", {
      class: `hc-add-icon ${opts.iconClass || ""}`,
      "aria-hidden": "true"
    });
    icon.textContent = opts.icon || "";
    item.append(icon);
    item.append(el("span", { class: "hc-add-label", text: opts.label }));
    if (opts.badge) item.append(el("span", { class: "hc-add-badge", text: opts.badge }));
    item.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (opts.disabled) return;
      closeAddMenu();
      if (opts.onClick) await opts.onClick();
    });
    return item;
  }

  function addMenuSection(menu, title, items, grid) {
    menu.append(el("div", { class: "hc-add-section-title", text: title }));
    const list = el("div", { class: grid ? "hc-add-grid" : "hc-add-list" });
    items.forEach((opts) => list.append(addMenuItem(opts)));
    menu.append(list);
  }

  function comingSoon(feature) {
    util.toast(t("toast.comingSoon", { name: feature }));
  }

  async function createFolderQuick() {
    let collectionId = (store.activeTab() && store.activeTab().collectionId) || (store.state.collections[0] && store.state.collections[0].id) || "";
    if (!collectionId) {
      const name = await util.promptDialog({ title: t("dialog.newCollectionTitle"), label: t("dialog.name") });
      if (!name) return;
      const created = store.createCollection(name);
      collectionId = created.id;
    }
    const folderName = await util.promptDialog({ title: t("dialog.newFolderTitle"), label: t("dialog.name") });
    if (!folderName) return;
    store.createFolder(collectionId, "", folderName);
    store.state.sideView = "collections";
    HC.viewSidebar.render();
    util.toast(t("toast.saved"), "success");
  }

  function createHttpRequest() {
    store.createClientTab("http");
    HC.viewRequest.render();
    HC.viewResponse.render();
    renderTabs();
    renderToolbarState();
  }

  function createTypedRequest(clientType) {
    store.createClientTab(clientType);
    applyLayout();
    HC.viewRequest.render();
    HC.viewResponse.render();
    renderTabs();
    renderToolbarState();
  }

  function openOpenApiExtract() {
    const textarea = el("textarea", {
      class: "hc-textarea",
      placeholder: t("dialog.openapiHint"),
      spellcheck: "false"
    });
    util.openModal({
      title: t("action.addImportAi"),
      render: (body) => {
        body.append(el("div", { class: "hc-hint", text: t("dialog.openapiHint") }));
        body.append(textarea);
      },
      actions: [
        { label: t("action.cancel2"), onClick: (api) => api.close() },
        {
          label: t("action.importAll"), kind: "primary",
          onClick: (api) => {
            const result = HC.clients.tryExtractApiDoc(textarea.value);
            if (result.error === "empty") {
              util.toast(t("toast.importEmpty"), "error");
              return;
            }
            if (result.error) {
              util.toast(t("toast.openapiFailed"), "error");
              return;
            }
            store.importCollection(result.collection);
            store.persist();
            store.emit("sidebar");
            HC.viewSidebar.render();
            util.toast(t("toast.imported", { count: result.count }), "success");
            api.close();
          }
        }
      ]
    });
  }

  function openAddMenu(anchor) {
    closeAddMenu();
    closeTabMenu();
    const menu = el("div", { class: "hc-add-menu", role: "menu" });

    addMenuSection(menu, t("action.addNew"), [
      { label: "HTTP", icon: "H", iconClass: "is-http", onClick: () => createTypedRequest("http") },
      { label: t("action.addSse"), icon: "S", iconClass: "is-sse", onClick: () => createTypedRequest("sse") },
      { label: "WebSocket", icon: "W", iconClass: "is-ws", onClick: () => createTypedRequest("websocket") },
      { label: "Socket.IO", icon: "O", iconClass: "is-sio", onClick: () => createTypedRequest("socketio") },
      { label: "gRPC", icon: "R", iconClass: "is-grpc", badge: "Beta", onClick: () => createTypedRequest("grpc") },
      { label: "GraphQL", icon: "G", iconClass: "is-gql", badge: "Beta", onClick: () => createTypedRequest("graphql") },
      { label: "TCP", icon: "T", iconClass: "is-tcp", onClick: () => createTypedRequest("tcp") },
      { label: "Markdown", icon: "M", iconClass: "is-md", onClick: () => createTypedRequest("markdown") },
      { label: t("action.addDirectory"), icon: "📂", iconClass: "is-folder", wide: true, onClick: createFolderQuick }
    ], true);

    addMenuSection(menu, t("action.addImport"), [
      { label: t("action.addImportAi"), icon: "☰", iconClass: "is-ai", onClick: () => openOpenApiExtract() },
      { label: t("action.addImportCurl"), icon: "$", iconClass: "is-curl", onClick: () => openCurlImport() },
      {
        label: t("action.addImportPaste"),
        icon: "⎘",
        iconClass: "is-paste",
        onClick: () => { if (HC.viewSidebar && HC.viewSidebar.openImportDialog) HC.viewSidebar.openImportDialog(); }
      },
      {
        label: t("action.addImportFile"),
        icon: "↓",
        iconClass: "is-import",
        wide: true,
        onClick: () => { if (HC.viewSidebar && HC.viewSidebar.openImportDialog) HC.viewSidebar.openImportDialog(); }
      }
    ], true);

    document.body.append(menu);
    addMenuNode = menu;
    if (anchor && anchor.setAttribute) anchor.setAttribute("aria-expanded", "true");
    const rect = anchor.getBoundingClientRect();
    const width = 340;
    let left = rect.left;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    let top = rect.bottom + 4;
    const menuH = Math.min(menu.offsetHeight || 420, window.innerHeight - 16);
    if (top + menuH > window.innerHeight - 8) top = Math.max(8, rect.top - menuH - 4);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.width = `${width}px`;

    wireMenuKeys(menu, {
      itemSelector: ".hc-add-item:not(.is-disabled)",
      onEscape: () => {
        closeAddMenu();
        if (anchor && anchor.focus) anchor.focus();
      }
    });
    setTimeout(() => {
      const onDoc = (event) => {
        if (menu.contains(event.target) || (anchor && anchor.contains && anchor.contains(event.target))) return;
        closeAddMenu();
        document.removeEventListener("mousedown", onDoc);
      };
      document.addEventListener("mousedown", onDoc);
    }, 0);
    requestAnimationFrame(() => {
      const first = menu.querySelector(".hc-add-item:not(.is-disabled)");
      if (first) first.focus();
    });
  }

  window.HC.app = Object.assign(window.HC.app || {}, {
    openAddMenu,
    closeAddMenu,
    createHttpRequest,
    createTypedRequest,
    sendStreamMessage,
    applyLayout
  });

  /* ---------------------------------------------------- listbox keyboard -- */

  function wireMenuKeys(menu, options) {
    const itemSelector = options.itemSelector || "[role=option]";
    menu.addEventListener("keydown", (event) => {
      const items = Array.prototype.slice.call(menu.querySelectorAll(itemSelector))
        .filter((node) => !node.disabled && node.offsetParent !== null);
      if (!items.length) {
        if (event.key === "Escape" && options.onEscape) {
          event.preventDefault();
          options.onEscape();
        }
        return;
      }
      const active = document.activeElement;
      let index = items.indexOf(active);
      if (event.key === "ArrowDown") {
        event.preventDefault();
        index = index < 0 ? 0 : (index + 1) % items.length;
        items[index].focus();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        index = index < 0 ? items.length - 1 : (index - 1 + items.length) % items.length;
        items[index].focus();
      } else if (event.key === "Home") {
        event.preventDefault();
        items[0].focus();
      } else if (event.key === "End") {
        event.preventDefault();
        items[items.length - 1].focus();
      } else if (event.key === "Enter" && index >= 0) {
        event.preventDefault();
        if (options.onEnter) options.onEnter(items[index]);
        else items[index].click();
      } else if (event.key === "Escape" && options.onEscape) {
        event.preventDefault();
        options.onEscape();
      }
    });
  }

  /* ---------------------------------------------------- tab context menu -- */

  let tabMenuNode = null;

  function closeTabMenu() {
    if (tabMenuNode) { tabMenuNode.remove(); tabMenuNode = null; }
    closeAddMenu();
  }

  function openTabMenu(event, tab) {
    event.preventDefault();
    event.stopPropagation();
    closeTabMenu();
    const index = store.state.tabs.findIndex((item) => item.id === tab.id);
    const last = store.state.tabs.length - 1;
    const items = [
      { label: t("action.duplicate"), onClick: () => {
        if (store.duplicateTab) store.duplicateTab(tab.id);
        else {
          const snap = store.snapshotRequest(tab);
          store.createTab(Object.assign({}, snap, { name: t("tab.copySuffix", { name: store.requestTitle(tab) }) }));
        }
      } },
      { separator: true },
      { label: t("tab.close"), onClick: async () => { if (await confirmCloseTab(tab)) store.closeTab(tab.id); } },
      { label: t("tab.closeLeft"), disabled: index <= 0, onClick: async () => {
        const targets = store.state.tabs.slice(0, index);
        if (await confirmCloseMany(targets)) store.closeTabsToSide(tab.id, "left");
      } },
      { label: t("tab.closeRight"), disabled: index >= last, onClick: async () => {
        const targets = store.state.tabs.slice(index + 1);
        if (await confirmCloseMany(targets)) store.closeTabsToSide(tab.id, "right");
      } },
      { label: t("tab.closeOthers"), disabled: store.state.tabs.length <= 1, onClick: async () => {
        const targets = store.state.tabs.filter((item) => item.id !== tab.id);
        if (await confirmCloseMany(targets)) store.closeTabs([tab.id]);
      } },
      { label: t("tab.closeAll"), onClick: async () => {
        if (await confirmCloseMany(store.state.tabs)) store.closeTabs([]);
      } }
    ];
    const menu = el("div", { class: "hc-context-menu", id: "hc-tab-menu" });
    items.forEach((item) => {
      if (item.separator) {
        menu.append(el("div", { class: "hc-context-sep" }));
        return;
      }
      const button = el("button", {
        type: "button",
        class: "hc-context-item",
        text: item.label,
        disabled: item.disabled,
        on: {
          click: async (clickEvent) => {
            clickEvent.stopPropagation();
            closeTabMenu();
            if (item.disabled) return;
            await item.onClick();
            HC.viewRequest.render();
            HC.viewResponse.render();
          }
        }
      });
      menu.append(button);
    });
    document.body.append(menu);
    const width = 168;
    const left = Math.max(8, Math.min(event.clientX, window.innerWidth - width - 8));
    const top = Math.max(8, Math.min(event.clientY, window.innerHeight - (items.length * 32 + 12)));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    tabMenuNode = menu;
  }

  document.addEventListener("click", () => closeTabMenu());
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeTabMenu(); });

  /* --------------------------------------------------------- environment --- */

  let envMenuNode = null;
  let envFilter = "";

  function closeEnvMenu() {
    if (envMenuNode) {
      envMenuNode.remove();
      envMenuNode = null;
    }
    const trigger = util.$("#env-picker-trigger");
    if (trigger) trigger.setAttribute("aria-expanded", "false");
  }

  function renderEnvironmentSelect() {
    const label = util.$("#env-picker-label");
    if (!label) return;
    const active = store.activeEnvironment();
    label.textContent = active ? active.name : t("env.none");
    const trigger = util.$("#env-picker-trigger");
    if (trigger) trigger.classList.toggle("has-env", !!active);
    if (envMenuNode) openEnvMenu(true);
  }

  function openEnvMenu(rebuildOnly) {
    const picker = util.$("#env-picker");
    const trigger = util.$("#env-picker-trigger");
    if (!picker || !trigger) return;
    if (!rebuildOnly) {
      closeEnvMenu();
      envFilter = "";
    } else if (!envMenuNode) return;
    else envMenuNode.remove();

    const menu = el("div", { class: "hc-env-menu", id: "hc-env-menu", role: "listbox" });
    const search = el("input", {
      class: "hc-env-menu-search",
      type: "search",
      placeholder: t("env.search"),
      value: envFilter,
      spellcheck: "false"
    });
    search.addEventListener("input", () => {
      envFilter = search.value || "";
      openEnvMenu(true);
      const next = util.$(".hc-env-menu-search");
      if (next) {
        next.focus();
        const len = next.value.length;
        next.setSelectionRange(len, len);
      }
    });
    search.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { event.preventDefault(); closeEnvMenu(); return; }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const items = Array.from(menu.querySelectorAll(".hc-env-menu-item"));
        if (!items.length) return;
        const next = event.key === "ArrowDown" ? items[0] : items[items.length - 1];
        next.focus();
      }
    });
    menu.append(search);

    const list = el("div", { class: "hc-env-menu-list" });
    const needle = String(envFilter || "").trim().toLowerCase();
    const none = el("button", {
      type: "button",
      class: `hc-env-menu-item${!store.state.activeEnvironmentId ? " is-active" : ""}`,
      role: "option",
      text: t("env.none"),
      on: {
        click: (event) => {
          event.stopPropagation();
          store.setActiveEnvironment("");
          closeEnvMenu();
        }
      }
    });
    if (!needle || t("env.none").toLowerCase().includes(needle)) list.append(none);

    store.state.environments.forEach((environment) => {
      if (needle && !String(environment.name || "").toLowerCase().includes(needle)) return;
      const active = environment.id === store.state.activeEnvironmentId;
      const row = el("button", {
        type: "button",
        class: `hc-env-menu-item${active ? " is-active" : ""}`,
        role: "option",
        title: environment.name
      });
      row.append(el("span", { class: "hc-env-menu-name", text: environment.name }));
      const actions = el("span", { class: "hc-env-menu-actions" });
      actions.append(el("button", {
        type: "button", class: "hc-env-menu-icon", text: "✎", title: t("action.rename"),
        on: {
          click: async (event) => {
            event.stopPropagation();
            const name = await util.promptDialog({ title: t("dialog.renameTitle"), value: environment.name });
            if (!name) return;
            environment.name = name;
            store.persist();
            store.emit("environments");
          }
        }
      }));
      actions.append(el("button", {
        type: "button", class: "hc-env-menu-icon", text: "✕", title: t("action.delete"),
        on: {
          click: async (event) => {
            event.stopPropagation();
            if (!(await util.confirmDialog({
              title: t("dialog.deleteTitle"),
              message: t("dialog.deleteMessage", { name: environment.name })
            }))) return;
            store.deleteEnvironment(environment.id);
            closeEnvMenu();
          }
        }
      }));
      row.append(actions);
      row.addEventListener("click", (event) => {
        if (event.target.closest(".hc-env-menu-actions")) return;
        store.setActiveEnvironment(environment.id);
        closeEnvMenu();
      });
      list.append(row);
    });
    menu.append(list);
    menu.append(el("button", {
      type: "button",
      class: "hc-env-menu-add",
      text: `+ ${t("env.new")}`,
      on: {
        click: async (event) => {
          event.stopPropagation();
          const name = await util.promptDialog({ title: t("env.new"), label: t("dialog.name") });
          if (!name) return;
          const created = store.createEnvironment(name);
          store.setActiveEnvironment(created.id);
          closeEnvMenu();
          if (store.state.sideView === "environments" && HC.viewEnv && HC.viewEnv.openEnvironment) {
            HC.viewEnv.openEnvironment(created.id);
          }
        }
      }
    }));

    wireMenuKeys(menu, {
      itemSelector: ".hc-env-menu-item",
      onEscape: closeEnvMenu,
      onEnter: (item) => item.click()
    });

    document.body.append(menu);
    const rect = trigger.getBoundingClientRect();
    const width = Math.max(220, rect.width);
    let left = rect.right - width;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    let top = rect.bottom + 4;
    const approxHeight = Math.min(360, 48 + (store.state.environments.length + 2) * 34);
    if (top + approxHeight > window.innerHeight - 8) top = Math.max(8, rect.top - approxHeight - 4);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.width = `${width}px`;
    envMenuNode = menu;
    trigger.setAttribute("aria-expanded", "true");
    if (!rebuildOnly) {
      requestAnimationFrame(() => {
        const input = util.$(".hc-env-menu-search");
        if (input) input.focus();
      });
    }
  }

  function wireEnvPicker() {
    const trigger = util.$("#env-picker-trigger");
    if (!trigger) return;
    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      if (envMenuNode) closeEnvMenu();
      else openEnvMenu(false);
    });
    document.addEventListener("click", (event) => {
      if (!envMenuNode) return;
      if (event.target.closest("#hc-env-menu") || event.target.closest("#env-picker")) return;
      closeEnvMenu();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeEnvMenu();
    });
  }

  /* -------------------------------------------------------------- toolbar -- */

  function renderToolbarState() {
    const tab = store.activeTab();
    const send = util.$("#btn-send");
    const cancel = util.$("#btn-cancel");
    const save = util.$("#btn-save");
    if (!tab) return;
    const stream = HC.clients && HC.clients.isStreamClient(tab.clientType);
    const markdown = tab.clientType === "markdown";
    if (markdown) {
      send.hidden = true;
      cancel.hidden = true;
    } else if (stream) {
      const connected = !!(tab.stream && tab.stream.connected);
      send.hidden = false;
      cancel.hidden = true;
      send.disabled = !bridge.backendReady;
      send.textContent = connected ? t("action.disconnect") : t("action.connect");
      send.title = bridge.backendReady ? send.textContent : t("err.backendHint");
      send.classList.toggle("hc-btn-danger", connected);
      send.classList.toggle("hc-btn-send", !connected);
    } else {
      send.hidden = !!tab.sending;
      cancel.hidden = !tab.sending;
      send.disabled = !bridge.backendReady;
      send.textContent = t("action.send");
      send.title = bridge.backendReady ? t("action.send") : t("err.backendHint");
      send.classList.add("hc-btn-send");
      send.classList.remove("hc-btn-danger");
    }
    save.textContent = tab.savedRequestId ? (tab.dirty ? "★" : "✦") : "☆";
    save.title = t("action.save");
  }

  /* -------------------------------------------------------------- sending -- */

  async function send() {
    const tab = store.activeTab();
    if (!tab) return;
    if (tab.clientType === "markdown") return;
    if (HC.clients && HC.clients.isStreamClient(tab.clientType)) {
      await toggleStream(tab);
      return;
    }
    if (!bridge.backendReady) {
      util.toast(t("err.backendHint"), "error");
      return;
    }
    if (!String(tab.url || "").trim()) {
      util.toast(t("toast.urlRequired"), "error");
      util.$("#url-input").focus();
      return;
    }
    const missing = store.collectMissingVariables(tab);
    if (missing.length) {
      util.toast(t("toast.missingVars", { names: missing.join(", ") }), "error");
      if (HC.viewRequest && HC.viewRequest.updateUrlHighlight) HC.viewRequest.updateUrlHighlight(tab);
      return;
    }

    const tabId = tab.id;
    const requestId = util.uid("run");
    tab.response = null;
    tab.fullBody = null;
    tab.scriptResults = { pre: null, post: null };
    HC.viewResponse.setSending(tab, true, requestId);
    renderTabs();
    renderToolbarState();
    HC.viewResponse.render();

    const started = performance.now();
    const stillThisRun = () => {
      const current = store.state.tabs.find((item) => item.id === tabId);
      return current && current.requestId === requestId;
    };
    const refreshIfActive = () => {
      if (store.state.activeTabId === tabId) {
        renderToolbarState();
        HC.viewResponse.render();
      } else {
        renderTabs();
      }
    };
    try {
      if (HC.viewRequest && HC.viewRequest.syncUrlFromParams) HC.viewRequest.syncUrlFromParams(tab);
      const vars = Object.assign({}, store.variableMap());
      const preCode = tab.scripts && tab.scripts.pre;
      if (preCode && String(preCode).trim()) {
        const preCtx = { vars, dirty: false, method: tab.method, url: tab.url };
        const preResult = HC.scripts.run(preCode, preCtx);
        tab.scriptResults.pre = preResult;
        if (preCtx.dirty) HC.scripts.applyVarsToEnvironment(preCtx.vars, store, preCtx);
        if (preResult.error) {
          util.toast(t("scripts.preFailed", { message: preResult.error }), "error");
          return;
        }
      }

      const spec = store.buildSpec(tab, requestId, vars);
      const result = await bridge.send(spec);
      if (!stillThisRun()) return;
      tab.response = result;
      store.pushHistory(tab, result);

      const postCode = tab.scripts && tab.scripts.post;
      if (postCode && String(postCode).trim()) {
        let bodyText = "";
        try {
          if (result.bodyPreviewBase64) bodyText = util.decodeText(result.bodyPreviewBase64);
        } catch (error) { bodyText = ""; }
        const headerMap = {};
        (result.headers || []).forEach((header) => {
          if (header && header.key) headerMap[header.key.toLowerCase()] = header.value;
        });
        const postVars = Object.assign({}, store.variableMap());
        const postCtx = {
          vars: postVars,
          dirty: false,
          method: tab.method,
          url: result.finalUrl || result.url || tab.url,
          status: result.status || 0,
          statusText: result.statusText || "",
          durationMs: result.durationMs || 0,
          headers: headerMap,
          bodyText
        };
        const postResult = HC.scripts.run(postCode, postCtx);
        tab.scriptResults.post = postResult;
        if (postCtx.dirty) HC.scripts.applyVarsToEnvironment(postCtx.vars, store, postCtx);
        if (postResult.error) util.toast(t("scripts.postFailed", { message: postResult.error }), "error");
        else if (postResult.tests.length && !postResult.ok) util.toast(t("scripts.testsFailed"), "error");
        else if (postResult.tests.length) util.toast(t("scripts.testsPassed"), "success");
      }
    } catch (error) {
      if (!stillThisRun()) return;
      tab.response = {
        ok: false,
        error: { kind: "network", message: t("err.invoke", { message: (error && error.message) || String(error) }) },
        durationMs: Math.round(performance.now() - started),
        method: tab.method,
        url: tab.url,
        requestId
      };
    } finally {
      if (stillThisRun()) HC.viewResponse.setSending(tab, false);
      refreshIfActive();
      renderTabs();
    }
  }

  async function toggleStream(tab) {
    if (!bridge.backendReady) {
      util.toast(t("err.backendHint"), "error");
      return;
    }
    if (!tab.stream) tab.stream = { sessionId: "", connected: false, log: [], draft: "" };
    if (tab.stream.connected) {
      const sessionId = tab.stream.sessionId;
      tab.stream.connected = false;
      tab.stream.sessionId = "";
      renderToolbarState();
      renderTabs();
      HC.viewResponse.render();
      await bridge.streamClose({ sessionId });
      HC.clients.pushStreamLog(tab, { dir: "sys", text: t("stream.disconnected") });
      HC.viewResponse.render();
      return;
    }
    if (!String(tab.url || "").trim()) {
      util.toast(tab.clientType === "tcp" ? t("toast.tcpRequired") : t("toast.urlRequired"), "error");
      util.$("#url-input").focus();
      return;
    }
    const missing = store.collectMissingVariables(tab);
    if (missing.length) {
      util.toast(t("toast.missingVars", { names: missing.join(", ") }), "error");
      if (HC.viewRequest && HC.viewRequest.updateUrlHighlight) HC.viewRequest.updateUrlHighlight(tab);
      return;
    }
    const sessionId = util.uid("stream");
    tab.stream.sessionId = sessionId;
    tab.sending = true;
    tab.scriptResults = { pre: null, post: null };
    renderToolbarState();
    renderTabs();
    try {
      const vars = Object.assign({}, store.variableMap());
      const preCode = tab.scripts && tab.scripts.pre;
      if (preCode && String(preCode).trim()) {
        const preCtx = { vars, dirty: false, method: tab.method, url: tab.url };
        const preResult = HC.scripts.run(preCode, preCtx);
        tab.scriptResults.pre = preResult;
        if (preCtx.dirty) HC.scripts.applyVarsToEnvironment(preCtx.vars, store, preCtx);
        if (preResult.error) {
          util.toast(t("scripts.preFailed", { message: preResult.error }), "error");
          tab.stream.sessionId = "";
          tab.sending = false;
          renderToolbarState();
          renderTabs();
          HC.viewResponse.render();
          return;
        }
      }
      const headers = {};
      (tab.headers || []).forEach((row) => {
        if (row && row.enabled !== false && row.key) {
          headers[store.resolve(row.key, vars)] = store.resolve(row.value || "", vars);
        }
      });
      const kind = tab.clientType === "tcp" ? "tcp"
        : tab.clientType === "socketio" ? "socketio" : "websocket";
      await bridge.streamOpen({
        sessionId,
        kind,
        url: store.resolve(tab.url, vars).trim(),
        headers,
        timeoutMs: Number(tab.options && tab.options.timeoutMs) || 15000,
        verifyTls: !(tab.options && tab.options.verifyTls === false)
      });
      tab.stream.connected = true;
      tab.sending = false;
      HC.clients.pushStreamLog(tab, { dir: "sys", text: t("stream.connected") });
    } catch (error) {
      tab.stream.connected = false;
      tab.stream.sessionId = "";
      tab.sending = false;
      util.toast(t("err.invoke", { message: (error && error.message) || String(error) }), "error");
      HC.clients.pushStreamLog(tab, { dir: "err", text: (error && error.message) || String(error) });
    }
    renderToolbarState();
    renderTabs();
    HC.viewResponse.render();
  }

  async function sendStreamMessage() {
    const tab = store.activeTab();
    if (!tab || !tab.stream || !tab.stream.connected) return;
    const text = tab.stream.draft || "";
    if (!String(text).length) return;
    try {
      await bridge.streamSend({ sessionId: tab.stream.sessionId, data: text });
      HC.clients.pushStreamLog(tab, { dir: "out", text });
      tab.stream.draft = "";
      store.markDirty(tab);
      HC.viewRequest.render();
      HC.viewResponse.render();
    } catch (error) {
      util.toast(t("err.invoke", { message: (error && error.message) || String(error) }), "error");
    }
  }

  async function cancel() {
    const tab = store.activeTab();
    if (!tab || !tab.requestId) return;
    await bridge.cancel(tab.requestId);
  }

  function finishSave(tab) {
    util.toast(t("toast.saved"), "success");
    renderTabs();
    HC.viewSidebar.render();
    renderToolbarState();
  }

  async function saveRequest(options) {
    const tab = store.activeTab();
    if (!tab) return;
    const forceDialog = !!(options && options.forceDialog);
    // Already in a collection: Ctrl+S / 保存按钮直接覆盖，不再弹「另存为」对话框。
    if (!forceDialog && tab.savedRequestId) {
      const collectionId = tab.collectionId
        || (store.state.collections[0] && store.state.collections[0].id)
        || store.createCollection(t("misc.untitledCollection")).id;
      store.saveRequestTo(collectionId, tab, store.requestTitle(tab), tab.folderId || "");
      finishSave(tab);
      return;
    }
    const nameInput = el("input", { class: "hc-input", type: "text", value: store.requestTitle(tab) });
    const collectionSelect = el("select", { class: "hc-select hc-select-flat" });
    const folderSelect = el("select", { class: "hc-select hc-select-flat" });
    const fillCollections = () => {
      util.clear(collectionSelect);
      store.state.collections.forEach((collection) => collectionSelect.append(el("option", { value: collection.id, text: collection.name })));
      collectionSelect.value = tab.collectionId || (store.state.collections[0] || {}).id || "";
    };
    const fillFolders = () => {
      util.clear(folderSelect);
      folderSelect.append(el("option", { value: "", text: t("dialog.collectionRoot") }));
      store.listFolders(collectionSelect.value).forEach((folder) => {
        folderSelect.append(el("option", { value: folder.id, text: folder.path }));
      });
      if (tab.folderId) folderSelect.value = tab.folderId;
    };
    fillCollections();
    fillFolders();
    collectionSelect.addEventListener("change", fillFolders);
    util.openModal({
      title: t("dialog.saveTitle"),
      render: (body) => {
        body.append(el("label", { class: "hc-field" }, [el("span", { class: "hc-field-label", text: t("dialog.name") }), nameInput]));
        body.append(el("label", { class: "hc-field" }, [el("span", { class: "hc-field-label", text: t("dialog.collection") }), collectionSelect]));
        body.append(el("label", { class: "hc-field" }, [el("span", { class: "hc-field-label", text: t("dialog.folder") }), folderSelect]));
        body.append(el("div", { class: "hc-hint", text: `${tab.method} ${tab.url}` }));
      },
      actions: [
        { label: t("action.cancel2"), onClick: (api) => api.close() },
        {
          label: t("action.save2"), kind: "primary",
          onClick: (api) => {
            const name = nameInput.value.trim() || store.requestTitle(tab);
            let collectionId = collectionSelect.value;
            if (!collectionId) collectionId = store.createCollection(t("misc.untitledCollection")).id;
            store.saveRequestTo(collectionId, tab, name, folderSelect.value);
            finishSave(tab);
            api.close();
          }
        }
      ]
    });
  }

  async function copyCurl() {
    const tab = store.activeTab();
    if (!tab) return;
    const command = HC.curl.generateCurl(tab, { resolve: (value) => store.resolve(value) });
    const ok = await bridge.copy(command);
    util.toast(ok ? t("toast.copied") : t("toast.copyFailed"), ok ? "success" : "error");
  }

  function openCurlImport() {
    const textarea = el("textarea", {
      class: "hc-textarea", spellcheck: "false",
      placeholder: "curl -X POST 'https://api.example.com/users' \\\n  -H 'Content-Type: application/json' \\\n  -d '{\"name\":\"demo\"}'"
    });
    util.openModal({
      title: t("dialog.importCurlTitle"),
      render: (body) => {
        body.append(el("div", { class: "hc-hint", text: t("dialog.importCurlHint") }));
        body.append(textarea);
      },
      actions: [
        { label: t("action.cancel2"), onClick: (api) => api.close() },
        {
          label: t("action.import"), kind: "primary",
          onClick: (api) => {
            const parsed = HC.curl.parseCurl(textarea.value);
            if (!parsed) { util.toast(t("toast.importCurlFailed"), "error"); return; }
            store.createTab(Object.assign(parsed.request, { name: parsed.request.name }));
            HC.viewRequest.render();
            HC.viewResponse.render();
            api.close();
          }
        }
      ]
    });
  }

  /* Lets the user repoint the store at a custom directory from Settings, so the
     data survives a Docker container rebuild even when no connection form was
     used. The sidecar probes the path before switching. */
  function renderStorageDirField() {
    const wrap = el("div", { class: "hc-field hc-field-block" });
    const label = el("span", { class: "hc-field-label", text: t("settings.storageDir") });
    const input = el("input", {
      class: "hc-input", type: "text", spellcheck: "false",
      value: store.state.dirConfigured ? (store.state.storeDir || "") : "",
      placeholder: t("settings.storageDirPlaceholder")
    });
    const apply = el("button", {
      class: "hc-btn hc-btn-sm hc-btn-primary", type: "button", text: t("settings.applyDir"),
      disabled: !bridge.backendReady
    });
    const row = el("div", { class: "hc-body-toolbar" }, [input, apply]);
    wrap.append(label, row);
    wrap.append(el("div", {
      class: "hc-hint",
      text: t("settings.storageDirHint") + " " + (t("settings.storageDirDefault") + "：" + (store.state.storePath || "—"))
    }));
    apply.addEventListener("click", async () => {
      const dir = input.value.trim();
      if (!dir) { util.toast(t("settings.dirFailed", { message: "empty" }), "error"); return; }
      apply.disabled = true;
      try {
        await store.setStoreDir(dir);
        util.toast(t("settings.dirSaved"), "success");
      } catch (error) {
        util.toast(t("settings.dirFailed", { message: (error && error.message) || error }), "error");
      } finally {
        apply.disabled = false;
      }
    });
    return wrap;
  }

  function renderHistoryLimitField() {
    const wrap = el("div", { class: "hc-field hc-field-block" });
    wrap.append(el("span", { class: "hc-field-label", text: t("settings.historyLimit") }));
    const input = el("input", {
      class: "hc-input",
      type: "number",
      min: String(store.MIN_HISTORY_LIMIT),
      max: String(store.MAX_HISTORY_LIMIT),
      step: "1",
      value: String(store.historyLimit()),
      spellcheck: "false"
    });
    input.style.maxWidth = "120px";
    const apply = el("button", {
      class: "hc-btn hc-btn-sm hc-btn-primary",
      type: "button",
      text: t("settings.applyHistoryLimit")
    });
    const row = el("div", { class: "hc-body-toolbar" }, [input, apply]);
    wrap.append(row);
    wrap.append(el("div", {
      class: "hc-hint",
      text: t("settings.historyLimitHint", {
        min: store.MIN_HISTORY_LIMIT,
        max: store.MAX_HISTORY_LIMIT
      })
    }));
    const commit = () => {
      const next = store.setHistoryLimit(input.value);
      input.value = String(next);
      util.toast(t("settings.historyLimitSaved", { count: next }), "success");
    };
    apply.addEventListener("click", commit);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commit();
      }
    });
    return wrap;
  }

  function openSettings() {
    util.openModal({
      title: t("dialog.settingsTitle"),
      render: (body) => {
        const grid = el("div", { class: "hc-form-grid" });
        const row = (label, value) => {
          grid.append(el("span", { class: "hc-field-label", text: label }));
          grid.append(el("span", { text: value }));
        };
        row(t("settings.backend"), bridge.backendReady ? t("settings.backendReady") : t("settings.backendMissing"));
        row(t("settings.storage"), store.state.memoryOnly ? t("dialog.memoryOnly") : (store.state.storePath || "—"));
        row(t("settings.language"), HC.i18n.locale);
        row(t("settings.version"), VERSION);
        body.append(grid);
        body.append(el("div", { class: "hc-body-toolbar" }, [
          el("button", {
            class: "hc-btn hc-btn-sm hc-btn-ghost",
            type: "button",
            text: t("action.dynamicVars"),
            on: { click: () => util.openDynamicVarsDialog() }
          })
        ]));
        body.append(util.renderDynamicVarCatalog());
        body.append(renderHistoryLimitField());
        body.append(renderStorageDirField());
        body.append(el("div", { class: "hc-hint", text: t("settings.dataHint") }));
        const actions = el("div", { class: "hc-body-toolbar" }, [
          el("button", {
            class: "hc-btn hc-btn-sm hc-btn-ghost", type: "button", text: t("settings.exportAll"),
            on: {
              click: async () => {
                const ok = await bridge.copy(JSON.stringify(store.serializable(), null, 2));
                util.toast(ok ? t("toast.copied") : t("toast.copyFailed"), ok ? "success" : "error");
              }
            }
          }),
          el("button", {
            class: "hc-btn hc-btn-sm hc-btn-danger", type: "button", text: t("settings.clearAll"),
            on: {
              click: async () => {
                if (!await util.confirmDialog({ title: t("settings.clearAll"), message: t("dialog.deleteMessage", { name: t("brand") }) })) return;
                store.state.collections = [];
                store.state.environments = [];
                store.state.history = [];
                store.state.activeEnvironmentId = "";
                store.createCollection(t("misc.untitledCollection"));
                store.emit("sidebar");
                store.emit("environments");
                store.persist();
                util.closeModal();
                util.toast(t("toast.deleted"));
              }
            }
          })
        ]);
        body.append(actions);
      },
      actions: [{ label: t("action.close"), kind: "primary", onClick: (api) => api.close() }]
    });
  }

  /* ------------------------------------------------------------- splitters */

  function applyLayout() {
    const sidebar = util.$("#sidebar");
    const requestPane = util.$("#request-pane");
    const responsePane = util.$("#response-pane");
    const paneSplitter = util.$("#pane-splitter");
    const tab = store.activeTab();
    const markdown = tab && tab.clientType === "markdown";
    sidebar.style.width = `${store.state.settings.sidebarWidth}px`;
    sidebar.classList.toggle("is-collapsed", !!store.state.settings.sidebarCollapsed);
    util.$("#sidebar-splitter").hidden = !!store.state.settings.sidebarCollapsed;
    if (markdown) {
      requestPane.classList.add("is-markdown");
      requestPane.style.flex = "1 1 auto";
      if (responsePane) responsePane.hidden = true;
      if (paneSplitter) paneSplitter.hidden = true;
    } else {
      requestPane.classList.remove("is-markdown");
      requestPane.style.flex = `0 0 ${store.state.settings.requestPercent}%`;
      if (responsePane) responsePane.hidden = false;
      if (paneSplitter) paneSplitter.hidden = false;
    }
  }

  function wireSplitters() {
    const wire = (element, onMove) => {
      element.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        element.setPointerCapture(event.pointerId);
        const move = (moveEvent) => onMove(moveEvent);
        const up = () => {
          element.releasePointerCapture(event.pointerId);
          element.removeEventListener("pointermove", move);
          element.removeEventListener("pointerup", up);
          store.persist();
        };
        element.addEventListener("pointermove", move);
        element.addEventListener("pointerup", up);
      });
    };
    wire(util.$("#sidebar-splitter"), (event) => {
      const width = Math.min(Math.max(event.clientX, 180), window.innerWidth - 360);
      store.state.settings.sidebarWidth = width;
      applyLayout();
    });
    wire(util.$("#pane-splitter"), (event) => {
      const main = util.$(".hc-main").getBoundingClientRect();
      const percent = ((event.clientY - main.top) / main.height) * 100;
      store.state.settings.requestPercent = Math.min(Math.max(percent, 20), 80);
      applyLayout();
    });
  }

  /* ------------------------------------------------------------------ wire */

  function wire() {
    util.$("#btn-send").addEventListener("click", send);
    util.$("#btn-cancel").addEventListener("click", cancel);
    util.$("#btn-save").addEventListener("click", saveRequest);
    util.$("#btn-copy-curl").addEventListener("click", copyCurl);
    util.$("#btn-import-curl").addEventListener("click", openCurlImport);
    const dynVarsBtn = util.$("#btn-dynamic-vars");
    if (dynVarsBtn) dynVarsBtn.addEventListener("click", () => util.openDynamicVarsDialog());
    util.$("#btn-settings").addEventListener("click", openSettings);
    util.$("#btn-toggle-sidebar").addEventListener("click", () => {
      store.state.settings.sidebarCollapsed = !store.state.settings.sidebarCollapsed;
      applyLayout();
      store.persist();
    });

    bridge.onStream((method, params) => {
      const sessionId = params && params.sessionId;
      if (!sessionId) return;
      const tab = store.state.tabs.find((item) => item.stream && item.stream.sessionId === sessionId);
      if (!tab) return;
      if (method === "stream/message") {
        HC.clients.pushStreamLog(tab, { dir: "in", text: params.data || "", binary: !!params.binary });
      } else if (method === "stream/close") {
        tab.stream.connected = false;
        tab.stream.sessionId = "";
        HC.clients.pushStreamLog(tab, { dir: "sys", text: t("stream.disconnected") });
        renderToolbarState();
        renderTabs();
      } else if (method === "stream/error") {
        HC.clients.pushStreamLog(tab, { dir: "err", text: params.message || "error" });
      }
      if (store.state.activeTabId === tab.id) HC.viewResponse.render();
    });

    const methodSelect = util.$("#method-select");
    const methodTrigger = util.$("#method-trigger");
    const methodLabel = util.$("#method-label");
    let methodMenuNode = null;

    function syncMethodChrome(method) {
      const next = String(method || "GET").toUpperCase();
      if (methodSelect && methodSelect.value !== next) methodSelect.value = next;
      if (methodSelect) methodSelect.dataset.method = next;
      if (methodLabel) methodLabel.textContent = next;
      const urlRow = util.$(".hc-url-row");
      if (urlRow) urlRow.dataset.method = next;
      if (methodTrigger) methodTrigger.dataset.method = next;
    }

    function closeMethodMenu() {
      if (methodMenuNode) {
        methodMenuNode.remove();
        methodMenuNode = null;
      }
      if (methodTrigger) methodTrigger.setAttribute("aria-expanded", "false");
    }

    function openMethodMenu() {
      const picker = util.$("#method-picker");
      if (!picker || !methodTrigger) return;
      closeMethodMenu();
      const menu = el("div", { class: "hc-method-menu", role: "listbox", tabindex: "0" });
      const current = String((methodSelect && methodSelect.value) || (methodLabel && methodLabel.textContent) || "GET").toUpperCase();
      let activeBtn = null;
      store.METHODS.forEach((method) => {
        const selected = method === current;
        const btn = el("button", {
          type: "button",
          class: `hc-method-menu-item m-${method}${selected ? " is-active" : ""}`,
          role: "option",
          "aria-selected": selected ? "true" : "false",
          text: method,
          on: {
            mousedown: (event) => {
              event.preventDefault();
              event.stopPropagation();
              syncMethodChrome(method);
              if (methodSelect) methodSelect.dispatchEvent(new Event("change", { bubbles: true }));
              closeMethodMenu();
            }
          }
        });
        if (selected) activeBtn = btn;
        menu.append(btn);
      });
      document.body.append(menu);
      const rect = methodTrigger.getBoundingClientRect();
      const width = Math.max(112, rect.width);
      let left = rect.left;
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
      let top = rect.bottom + 4;
      const approxHeight = store.METHODS.length * 30 + 12;
      if (top + approxHeight > window.innerHeight - 8) {
        top = Math.max(8, rect.top - approxHeight - 4);
      }
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
      menu.style.minWidth = `${width}px`;
      methodMenuNode = menu;
      methodTrigger.setAttribute("aria-expanded", "true");
      wireMenuKeys(menu, {
        itemSelector: ".hc-method-menu-item",
        onEscape: () => {
          closeMethodMenu();
          if (methodTrigger) methodTrigger.focus();
        },
        onEnter: (item) => {
          item.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
        }
      });
      requestAnimationFrame(() => {
        (activeBtn || menu.querySelector(".hc-method-menu-item") || menu).focus();
      });
    }

    store.METHODS.forEach((method) => methodSelect.append(el("option", { value: method, text: method })));
    syncMethodChrome(methodSelect.value || "GET");
    if (methodTrigger) {
      methodTrigger.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (methodMenuNode) closeMethodMenu();
        else openMethodMenu();
      });
    }
    document.addEventListener("mousedown", (event) => {
      if (!methodMenuNode) return;
      if (methodMenuNode.contains(event.target)) return;
      if (methodTrigger && methodTrigger.contains(event.target)) return;
      closeMethodMenu();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeMethodMenu();
    });
    methodSelect.addEventListener("change", () => {
      const tab = store.activeTab();
      if (!tab) return;
      syncMethodChrome(methodSelect.value);
      tab.method = methodSelect.value;
      store.markDirty(tab);
      renderTabs();
    });

    const titleInput = util.$("#request-title");
    if (titleInput) {
      titleInput.addEventListener("input", () => {
        const tab = store.activeTab();
        if (!tab) return;
        tab.name = titleInput.value;
        store.markDirty(tab);
        renderTabs();
      });
      titleInput.addEventListener("change", () => {
        const tab = store.activeTab();
        if (!tab) return;
        tab.name = titleInput.value.trim() || t("tab.untitled");
        titleInput.value = tab.name;
        store.markDirty(tab);
        renderTabs();
      });
    }

    const urlInput = util.$("#url-input");
    urlInput.addEventListener("input", () => {
      const tab = store.activeTab();
      tab.url = urlInput.value;
      store.markDirty(tab);
      HC.viewRequest.updateUrlHighlight(tab);
    });
    urlInput.addEventListener("change", () => {
      const tab = store.activeTab();
      tab.url = urlInput.value;
      store.markDirty(tab);
      HC.viewRequest.syncParamsFromUrl(tab);
      HC.viewRequest.render();
    });
    urlInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); send(); }
    });

    wireEnvPicker();

    document.addEventListener("keydown", async (event) => {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod || event.key.toLowerCase() !== "w") return;
      if (event.target && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
      if (store.state.sideView === "environments") return;
      const tab = store.activeTab();
      if (!tab) return;
      event.preventDefault();
      if (await confirmCloseTab(tab)) {
        store.closeTab(tab.id);
        HC.viewRequest.render();
        HC.viewResponse.render();
      }
    });

    util.$$(".hc-side-tab").forEach((button) => {
      button.addEventListener("click", () => {
        store.state.sideView = button.dataset.sideView;
        util.$$(".hc-side-tab").forEach((item) => item.classList.toggle("is-active", item === button));
        if (HC.viewSidebar && HC.viewSidebar.clearFilter) HC.viewSidebar.clearFilter();
        HC.viewSidebar.render();
        if (HC.viewEnv) HC.viewEnv.syncLayout();
        renderTabs();
      });
    });

    store.subscribe((reason) => {
      if (reason === "loaded" || reason === "tabs" || reason === "tab-dirty") {
        renderTabs();
        renderToolbarState();
      }
      // Closing / switching tabs only emits "tabs"; without a request/response
      // re-render the pane keeps showing the previous tab's URL/headers/body.
      if (reason === "tabs" || reason === "loaded") {
        HC.viewRequest.render();
        HC.viewResponse.render();
        if (HC.app && HC.app.applyLayout) HC.app.applyLayout();
      }
      if (reason === "sidebar") HC.viewSidebar.render();
      if (reason === "environments") {
        renderEnvironmentSelect();
        HC.viewSidebar.render();
        if (HC.viewEnv) HC.viewEnv.syncLayout();
        renderTabs();
      }
      if (reason === "loaded") {
        if (HC.viewEnv) HC.viewEnv.syncLayout();
      }
    });

    document.addEventListener("keydown", (event) => {
      const primary = event.metaKey || event.ctrlKey;
      if (!primary) return;
      if (event.key === "Enter") { event.preventDefault(); send(); }
      else if (event.key.toLowerCase() === "s") { event.preventDefault(); saveRequest(); }
      else if (event.key.toLowerCase() === "t") { event.preventDefault(); store.createTab(); HC.viewRequest.render(); HC.viewResponse.render(); }
      else if (event.key.toLowerCase() === "k") { event.preventDefault(); util.$("#url-input").focus(); }
    });

    window.addEventListener("beforeunload", () => { store.persist(); });
    bridge.onEnv(({ locale }) => {
      HC.i18n.setLocale(locale);
      staticLabels();
      renderTabs();
      renderEnvironmentSelect();
      HC.viewSidebar.render();
      HC.viewRequest.render();
      HC.viewResponse.render();
      if (HC.viewEnv) HC.viewEnv.syncLayout();
      renderToolbarState();
    });
  }

  function renderAll() {
    applyLayout();
    renderTabs();
    renderEnvironmentSelect();
    renderToolbarState();
    HC.viewSidebar.render();
    HC.viewRequest.render();
    HC.viewResponse.render();
    if (HC.viewEnv) HC.viewEnv.syncLayout();
  }

  async function boot() {
    HC.i18n.setLocale(bridge.locale);
    staticLabels();
    wire();
    applyLayout();
    wireSplitters();

    // Never block the UI forever when the page is opened outside DataWise.
    const settled = await Promise.race([
      bridge.ready.then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), 4000))
    ]);
    HC.i18n.setLocale(bridge.locale);
    staticLabels();
    await store.init();
    renderAll();
    if (settled) {
      if (!bridge.backendReady) util.toast(t("err.backendHint"), "error");
      return;
    }
    // The handshake was still in flight when the guard fired. Refresh the toolbar
    // once it lands, otherwise the send button stays disabled for the whole session.
    bridge.ready.then(() => {
      renderToolbarState();
      if (!bridge.backendReady) util.toast(t("err.backendHint"), "error");
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
