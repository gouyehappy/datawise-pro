/* Workbench shell: tab strip, toolbars, splitters, shortcuts and the boot
   sequence. */

(function () {
  const util = HC.util;
  const store = HC.store;
  const bridge = HC.bridge;
  const t = (key, params) => HC.i18n.t(key, params);
  const el = util.el;

  const VERSION = "0.2.22";

  function staticLabels() {
    document.title = t("brand");
    HC.i18n.applyStaticLabels();
    util.$$(".hc-side-tab").forEach((button) => {
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

  // Typing only needs to update the dirty dot / label of one tab. Rebuilding
  // the whole tabstrip on every keystroke was the main input-lag source.
  function patchTab(tab) {
    if (!tab) return;
    const host = util.$("#tabstrip");
    if (!host) return;
    let target = null;
    for (const node of host.children) {
      if (node.dataset && node.dataset.tabId === tab.id) { target = node; break; }
    }
    if (!target) return;
    const title = store.requestTitle(tab);
    target.title = title;
    const label = target.querySelector(".hc-tab-label");
    if (label && label.textContent !== title) label.textContent = title;
    const dot = target.querySelector(".hc-tab-dot");
    if (tab.dirty && !tab.sending && !dot) {
      const node = el("span", { class: "hc-tab-dot", title: t("tab.unsaved") });
      const close = target.querySelector(".hc-tab-close");
      if (close) target.insertBefore(node, close);
      else target.appendChild(node);
    } else if ((!tab.dirty || tab.sending) && dot) {
      dot.remove();
    }
  }

  function renderTabs() {
    const tabstrip = util.$("#tabstrip");
    if (tabstrip) tabstrip.setAttribute("role", "tablist");
    if (store.state.sideView === "environments") {
      if (HC.viewEnv) HC.viewEnv.renderTabs();
      syncTabAddButton();
      updateTabstripOverflow();
      return;
    }
    const host = util.clear(tabstrip);
    store.state.tabs.forEach((tab) => {
      const active = tab.id === store.state.activeTabId;
      const node = el("div", {
        class: `hc-tab${active ? " is-active" : ""}${tab.sending ? " is-sending" : ""}${(tab.stream && tab.stream.connected) ? " is-live" : ""}`,
        title: store.requestTitle(tab),
        role: "tab",
        tabindex: active ? "0" : "-1",
        "aria-selected": active ? "true" : "false"
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
      node.dataset.tabId = tab.id;
      host.append(node);
    });
    syncTabAddButton();
    requestAnimationFrame(() => {
      updateTabstripOverflow();
      scrollActiveTabIntoView();
    });
  }

  let addMenuNode = null;
  let tabstripWired = false;

  let addMenuDocCloser = null;
  function closeAddMenu() {
    if (addMenuDocCloser) {
      document.removeEventListener("mousedown", addMenuDocCloser);
      addMenuDocCloser = null;
    }
    if (addMenuNode) {
      addMenuNode.remove();
      addMenuNode = null;
    }
  }

  function syncTabAddButton() {
    const btn = util.$("#tab-add");
    if (!btn) return;
    btn.hidden = false;
    if (store.state.sideView === "environments") {
      btn.title = t("env.new");
      btn.onclick = async (event) => {
        event.stopPropagation();
        const name = await util.promptDialog({ title: t("env.new"), label: t("dialog.name") });
        if (!name) return;
        const created = store.createEnvironment(name);
        if (HC.viewEnv && HC.viewEnv.openEnvironment) HC.viewEnv.openEnvironment(created.id);
      };
      return;
    }
    btn.title = t("action.newRequest");
    btn.onclick = (event) => {
      event.stopPropagation();
      createHttpRequest();
    };
  }

  function updateTabstripOverflow() {
    const wrap = util.$("#tabstrip-wrap");
    const scroller = util.$("#tabstrip");
    const prev = util.$("#tabstrip-prev");
    const next = util.$("#tabstrip-next");
    if (!wrap || !scroller) return;
    const max = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    const overflow = max > 2;
    const left = scroller.scrollLeft > 2;
    const right = scroller.scrollLeft < max - 2;
    wrap.classList.toggle("is-overflow-left", left);
    wrap.classList.toggle("is-overflow-right", right);
    if (prev) {
      prev.hidden = !overflow;
      prev.disabled = !left;
    }
    if (next) {
      next.hidden = !overflow;
      next.disabled = !right;
    }
  }

  function scrollActiveTabIntoView() {
    const scroller = util.$("#tabstrip");
    if (!scroller) return;
    const active = scroller.querySelector(".hc-tab.is-active");
    if (!active || typeof active.scrollIntoView !== "function") return;
    try {
      active.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
    } catch (_) {
      active.scrollIntoView();
    }
    updateTabstripOverflow();
  }

  function wireTabstrip() {
    if (tabstripWired) return;
    const scroller = util.$("#tabstrip");
    const prev = util.$("#tabstrip-prev");
    const next = util.$("#tabstrip-next");
    if (!scroller) return;
    tabstripWired = true;
    // Roving tabindex inside the tablist. Keep Ctrl/Cmd/Alt combos (including
    // Ctrl+Tab and Ctrl+Alt+←/→) for the global shortcut handler.
    scroller.addEventListener("keydown", (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const tabs = Array.prototype.slice.call(scroller.querySelectorAll(".hc-tab"));
      if (!tabs.length) return;
      const from = event.target && event.target.closest ? event.target.closest(".hc-tab") : null;
      const found = from ? tabs.indexOf(from) : -1;
      const current = found >= 0 ? found : tabs.findIndex((node) => node.classList.contains("is-active"));
      if (current < 0) return;
      const next = event.key === "ArrowRight"
        ? (current + 1) % tabs.length
        : (current - 1 + tabs.length) % tabs.length;
      event.preventDefault();
      const tabId = tabs[next].dataset.tabId;
      store.setActiveTab(tabId);
      HC.viewRequest.render();
      HC.viewResponse.render();
      const refreshed = Array.prototype.slice.call(scroller.querySelectorAll(".hc-tab"));
      const target = refreshed.find((node) => node.dataset.tabId === tabId);
      if (target) target.focus();
    });
    scroller.addEventListener("scroll", () => updateTabstripOverflow(), { passive: true });
    scroller.addEventListener("wheel", (event) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      if (scroller.scrollWidth <= scroller.clientWidth + 2) return;
      event.preventDefault();
      scroller.scrollLeft += event.deltaY;
      updateTabstripOverflow();
    }, { passive: false });
    const nudge = (dir) => {
      scroller.scrollBy({ left: dir * Math.max(120, scroller.clientWidth * 0.6), behavior: "smooth" });
      setTimeout(updateTabstripOverflow, 180);
    };
    if (prev) prev.addEventListener("click", () => nudge(-1));
    if (next) next.addEventListener("click", () => nudge(1));
    window.addEventListener("resize", () => updateTabstripOverflow());
    syncTabAddButton();
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

  function createFolderQuick() {
    let collectionId = (store.activeTab() && store.activeTab().collectionId)
      || (store.state.collections[0] && store.state.collections[0].id)
      || "";
    if (!collectionId) {
      const created = store.createCollection(t("misc.untitledCollection"));
      collectionId = created.id;
    }
    store.state.sideView = "collections";
    if (HC.viewSidebar && HC.viewSidebar.startInlineFolder) {
      HC.viewSidebar.startInlineFolder(collectionId, "");
    }
  }

  function refreshEditor(opts) {
    HC.viewRequest.render();
    HC.viewResponse.render();
    renderTabs();
    if (!opts || opts.toolbar !== false) renderToolbarState();
  }

  /** Prefer creating into the last focused collection/folder (ApiPost-like quick add). */
  function createHttpRequest() {
    const focus = store.treeFocus ? store.treeFocus() : { collectionId: "", folderId: "" };
    if (focus.collectionId && HC.viewSidebar && HC.viewSidebar.createRequestQuick) {
      HC.viewSidebar.createRequestQuick(focus.collectionId, focus.folderId || "");
      renderTabs();
      renderToolbarState();
      return;
    }
    store.createClientTab("http");
    refreshEditor();
  }

  function createTypedRequest(clientType) {
    if (clientType === "http") {
      createHttpRequest();
      applyLayout();
      return;
    }
    store.createClientTab(clientType);
    applyLayout();
    refreshEditor();
  }

  function duplicateActiveTab() {
    const tab = store.activeTab();
    if (!tab || !store.duplicateTab) return;
    store.duplicateTab(tab.id);
    refreshEditor({ toolbar: false });
    util.toast(t("toast.duplicated"));
  }

  /** Clone saved request as tree sibling; otherwise duplicate as untitled tab. */
  function cloneActiveRequest() {
    const tab = store.activeTab();
    if (!tab) return;
    if (tab.savedRequestId && store.cloneSavedRequest) {
      const clone = store.cloneSavedRequest(tab.savedRequestId);
      if (clone && HC.viewSidebar && HC.viewSidebar.startInlineRenameRequest) {
        HC.viewSidebar.startInlineRenameRequest(clone.id);
      }
      refreshEditor({ toolbar: false });
      util.toast(t("toast.cloned"));
      return;
    }
    duplicateActiveTab();
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

  function openPostmanImport() {
    const textarea = el("textarea", {
      class: "hc-textarea",
      placeholder: t("dialog.postmanHint"),
      spellcheck: "false"
    });
    util.openModal({
      title: t("action.addImportPostman"),
      render: (body) => {
        body.append(el("div", { class: "hc-hint", text: t("dialog.postmanHint") }));
        body.append(textarea);
      },
      actions: [
        { label: t("action.cancel2"), onClick: (api) => api.close() },
        {
          label: t("action.importAll"), kind: "primary",
          onClick: (api) => {
            const result = HC.postman && HC.postman.importCollection(textarea.value);
            if (!result || result.error || !result.collection) {
              util.toast(t("toast.postmanFailed"), "error");
              return;
            }
            store.importCollection(result.collection);
            store.persist();
            store.emit("sidebar");
            HC.viewSidebar.render();
            util.toast(t("toast.imported", { count: result.count || 0 }), "success");
            api.close();
          }
        }
      ]
    });
  }

  function openHarImport() {
    const textarea = el("textarea", {
      class: "hc-textarea", spellcheck: "false",
      placeholder: '{ "log": { "entries": [ … ] } }'
    });
    const fileInput = el("input", {
      type: "file", accept: ".har,.json,application/json,text/json",
      style: { display: "none" }
    });
    const fileName = el("span", { class: "hc-hint hc-import-file-name", text: "" });
    const fileRow = el("div", { class: "hc-import-file-row" }, [
      el("button", {
        class: "hc-btn hc-btn-sm", type: "button", text: t("side.importPickFile"),
        on: { click: () => fileInput.click() }
      }),
      fileName
    ]);
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      try {
        textarea.value = await file.text();
        fileName.textContent = file.name;
      } catch (error) {
        util.toast(t("toast.harFailed"), "error");
      }
    });
    util.openModal({
      title: t("action.addImportHar"),
      render: (body) => {
        body.append(el("div", { class: "hc-hint", text: t("dialog.harHint") }));
        body.append(fileRow, fileInput, textarea);
      },
      actions: [
        { label: t("action.cancel2"), onClick: (api) => api.close() },
        {
          label: t("action.importAll"), kind: "primary",
          onClick: (api) => {
            const result = HC.har && HC.har.importCollection(textarea.value);
            if (!result || result.error || !result.collection) {
              util.toast(t("toast.harFailed"), "error");
              return;
            }
            store.importCollection(result.collection);
            store.persist();
            store.emit("sidebar");
            HC.viewSidebar.render();
            util.toast(t("toast.imported", { count: result.count || 0 }), "success");
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

    const active = store.activeTab();
    const quick = [
      { label: t("action.newRequest"), icon: "+", iconClass: "is-http", onClick: () => createHttpRequest() },
      { label: t("action.pasteCreate"), icon: "⎘", iconClass: "is-paste", onClick: () => createFromClipboard() }
    ];
    if (active) {
      quick.push({ label: t("action.duplicate"), icon: "⧉", iconClass: "is-curl", onClick: () => duplicateActiveTab() });
      if (active.savedRequestId) {
        quick.push({ label: t("action.clone"), icon: "⎇", iconClass: "is-folder", onClick: () => cloneActiveRequest() });
      }
    }
    addMenuSection(menu, t("action.addQuick"), quick, true);

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
      { label: t("action.addImportPostman"), icon: "P", iconClass: "is-postman", onClick: () => openPostmanImport() },
      { label: t("action.addImportHar"), icon: "H", iconClass: "is-import", onClick: () => openHarImport() },
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
    // Bind synchronously so closeAddMenu() always owns (and removes) the
    // listener; a deferred registration could survive an Escape/re-render.
    addMenuDocCloser = (event) => {
      if (menu.contains(event.target) || (anchor && anchor.contains && anchor.contains(event.target))) return;
      closeAddMenu();
    };
    document.addEventListener("mousedown", addMenuDocCloser);
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
    createFromClipboard,
    cloneActiveRequest,
    duplicateActiveTab,
    copyCurl,
    openCurlImport,
    openPostmanImport,
    openHarImport,
    openOpenApiExtract,
    openSettings,
    openCookieManager,
    openGlobalsDialog,
    openCasesDialog,
    sendStreamMessage,
    applyLayout,
    setPaneLayout,
    openPaneLayoutMenu,
    updateTabstripOverflow,
    syncTabAddButton
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

  function closeTabMenu() {
    if (util.closeContextMenu) util.closeContextMenu();
    closeAddMenu();
  }

  function openTabMenu(event, tab) {
    closeTabMenu();
    const index = store.state.tabs.findIndex((item) => item.id === tab.id);
    const last = store.state.tabs.length - 1;
    const after = async (fn) => {
      await fn();
      HC.viewRequest.render();
      HC.viewResponse.render();
    };
    const sk = (HC.shortcuts && HC.shortcuts.keys) || {};
    const items = [
      {
        label: t("tab.close"),
        shortcut: sk.closeTab,
        onClick: () => after(async () => {
          if (await confirmCloseTab(tab)) store.closeTab(tab.id);
        })
      },
      { label: t("tab.closeOthers"), disabled: store.state.tabs.length <= 1, onClick: () => after(async () => {
        const targets = store.state.tabs.filter((item) => item.id !== tab.id);
        if (await confirmCloseMany(targets)) store.closeTabs([tab.id]);
      }) },
      { separator: true },
      {
        label: t("action.duplicate"),
        shortcut: sk.duplicateTab,
        onClick: () => {
          store.setActiveTab(tab.id);
          duplicateActiveTab();
        }
      }
    ];
    if (tab.savedRequestId) {
      items.push({
        label: t("action.clone"),
        shortcut: sk.cloneRequest,
        onClick: () => {
          store.setActiveTab(tab.id);
          cloneActiveRequest();
        }
      });
    }
    items.push({
      label: t("action.more"),
      children: [
        { label: t("tab.closeLeft"), disabled: index <= 0, onClick: () => after(async () => {
          const targets = store.state.tabs.slice(0, index);
          if (await confirmCloseMany(targets)) store.closeTabsToSide(tab.id, "left");
        }) },
        { label: t("tab.closeRight"), disabled: index >= last, onClick: () => after(async () => {
          const targets = store.state.tabs.slice(index + 1);
          if (await confirmCloseMany(targets)) store.closeTabsToSide(tab.id, "right");
        }) },
        { label: t("tab.closeAll"), onClick: () => after(async () => {
          if (await confirmCloseMany(store.state.tabs)) store.closeTabs([]);
        }) }
      ]
    });
    util.openContextMenu(event, items, { id: "hc-tab-menu", minWidth: 200 });
  }

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

  function syncMemoryBadge() {
    const badge = util.$("#memory-badge");
    if (!badge) return;
    badge.hidden = !store.state.memoryOnly;
    badge.onclick = async () => {
      await store.persist();
      syncMemoryBadge();
    };
  }

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
      let sendTab = tab;
      const preCode = tab.scripts && tab.scripts.pre;
      if (preCode && String(preCode).trim()) {
        const preCtx = {
          vars,
          dirty: false,
          method: tab.method,
          url: tab.url,
          bodyMode: (tab.body && tab.body.mode) || "raw",
          bodyRaw: (tab.body && tab.body.raw) || "",
          bodyContentType: (tab.body && tab.body.contentType) || "application/json",
          headersList: (tab.headers || []).map((row) => ({
            key: row.key || "",
            value: row.value || "",
            enabled: row.enabled !== false
          })),
          // Let pm.request.auth read/modify the current auth. The goja
          // sandbox round-trips the whole authConfig, so the mutated copy
          // below is always a complete object.
          auth: Object.assign({}, tab.auth || { type: "none" })
        };
        const preResult = await HC.scripts.run(preCode, preCtx);
        tab.scriptResults.pre = preResult;
        if (preCtx.dirty) HC.scripts.applyVarsToEnvironment(preCtx.vars, store, preCtx);
        if (preResult.error) {
          util.toast(t("scripts.preFailed", { message: preResult.error }), "error");
          return;
        }
        if (preCtx.reqDirty && preCtx.req) {
          const mutated = preCtx.req;
          // A script-supplied URL is authoritative: keep params/pathParams
          // from re-appending or rewriting it in buildSpec (mirrors the
          // workflow side's URLDirty handling).
          const urlChanged = mutated.url != null && mutated.url !== tab.url;
          sendTab = Object.assign({}, tab, {
            method: mutated.method || tab.method,
            url: mutated.url != null ? mutated.url : tab.url,
            headers: Array.isArray(mutated.headers) ? mutated.headers : tab.headers,
            auth: mutated.auth ? Object.assign({}, tab.auth || {}, mutated.auth) : tab.auth,
            params: urlChanged ? [] : tab.params,
            pathParams: urlChanged ? [] : tab.pathParams,
            body: Object.assign({}, tab.body || {}, {
              mode: mutated.bodyMode || (tab.body && tab.body.mode) || "raw",
              raw: mutated.bodyRaw != null ? mutated.bodyRaw : ((tab.body && tab.body.raw) || ""),
              contentType: mutated.bodyContentType
                || (tab.body && tab.body.contentType)
                || "application/json"
            })
          });
        }
      }

      const spec = store.buildSpec(sendTab, requestId, vars);
      const result = await bridge.send(spec);
      if (!stillThisRun()) return;
      tab.response = result;
      if (store.ingestSetCookies) {
        store.ingestSetCookies(result.finalUrl || result.url || tab.url, result.setCookies || []);
      }
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
        const postResult = await HC.scripts.run(postCode, postCtx);
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
        const preResult = await HC.scripts.run(preCode, preCtx);
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
    const folderDd = util.createSelect({
      className: "hc-dd-block",
      items: [{ value: "", label: t("dialog.collectionRoot") }],
      value: tab.folderId || ""
    });
    const collectionDd = util.createSelect({
      className: "hc-dd-block",
      items: store.state.collections.map((collection) => ({ value: collection.id, label: collection.name })),
      value: tab.collectionId || (store.state.collections[0] || {}).id || "",
      onChange: () => fillFolders()
    });
    function fillFolders() {
      const items = [{ value: "", label: t("dialog.collectionRoot") }];
      store.listFolders(collectionDd.value).forEach((folder) => {
        items.push({ value: folder.id, label: folder.path });
      });
      folderDd.setOptions(items, true);
      if (tab.folderId) folderDd.value = tab.folderId;
    }
    fillFolders();
    util.openModal({
      title: t("dialog.saveTitle"),
      render: (body) => {
        body.append(el("label", { class: "hc-field" }, [el("span", { class: "hc-field-label", text: t("dialog.name") }), nameInput]));
        body.append(el("label", { class: "hc-field" }, [el("span", { class: "hc-field-label", text: t("dialog.collection") }), collectionDd.root]));
        body.append(el("label", { class: "hc-field" }, [el("span", { class: "hc-field-label", text: t("dialog.folder") }), folderDd.root]));
        body.append(el("div", { class: "hc-hint", text: `${tab.method} ${tab.url}` }));
      },
      actions: [
        { label: t("action.cancel2"), onClick: (api) => api.close() },
        {
          label: t("action.save2"), kind: "primary",
          onClick: (api) => {
            const name = nameInput.value.trim() || store.requestTitle(tab);
            let collectionId = collectionDd.value;
            if (!collectionId) collectionId = store.createCollection(t("misc.untitledCollection")).id;
            store.saveRequestTo(collectionId, tab, name, folderDd.value);
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

  function applyParsedRequest(parsed) {
    if (!parsed || !parsed.request) return false;
    store.createTab(Object.assign(parsed.request, { name: parsed.request.name }));
    HC.viewRequest.render();
    HC.viewResponse.render();
    renderTabs();
    return true;
  }

  async function createFromClipboard() {
    let text = "";
    try {
      text = await navigator.clipboard.readText();
    } catch (error) {
      util.toast(t("toast.clipboardDenied"), "error");
      openCurlImport();
      return;
    }
    const raw = String(text || "").trim();
    if (!raw) {
      util.toast(t("toast.clipboardEmpty"), "error");
      return;
    }
    if (/^\s*curl\b/i.test(raw) || /\s-X\s|\s--request\s|\s-H\s|\s--header\s/i.test(raw)) {
      const parsed = HC.curl.parseCurl(raw);
      if (!parsed) {
        util.toast(t("toast.importCurlFailed"), "error");
        return;
      }
      applyParsedRequest(parsed);
      util.toast(t("toast.pasteCurl"), "success");
      return;
    }
    if (/^https?:\/\//i.test(raw) || /^\{\{[^{}]+\}\}\S*/.test(raw)) {
      const first = raw.split(/\s+/)[0];
      store.createTab({ name: t("tab.untitled"), method: "GET", url: first });
      HC.viewRequest.render();
      HC.viewResponse.render();
      renderTabs();
      util.toast(t("toast.pasteUrl"), "success");
      return;
    }
    util.toast(t("toast.pasteUnrecognized"), "error");
    openCurlImport(raw);
  }

  function openCurlImport(preset) {
    const textarea = el("textarea", {
      class: "hc-textarea", spellcheck: "false",
      placeholder: "curl -X POST 'https://api.example.com/users' \\\n  -H 'Content-Type: application/json' \\\n  -d '{\"name\":\"demo\"}'",
      value: preset || ""
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
            applyParsedRequest(parsed);
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

  function openCookieManager() {
    let filter = "";
    const search = el("input", {
      class: "hc-input", type: "text", spellcheck: "false",
      placeholder: t("cookie.filterPlaceholder")
    });
    const tableHost = el("div", { class: "hc-cookie-table" });
    const summary = el("div", { class: "hc-hint", text: "" });
    /* Inline confirmation: openModal() is single-instance, so a nested
       confirmDialog() would silently close the Cookie manager underneath it. */
    const clearBar = el("div", { class: "hc-cookie-confirm", hidden: true }, [
      el("span", { text: t("cookie.clearConfirm") }),
      el("button", {
        class: "hc-btn hc-btn-sm hc-btn-danger", type: "button", text: t("action.delete"),
        on: { click: () => { store.clearCookieJar(); clearBar.hidden = true; draw(); } }
      }),
      el("button", {
        class: "hc-btn hc-btn-sm hc-btn-ghost", type: "button", text: t("action.cancel2"),
        on: { click: () => { clearBar.hidden = true; } }
      })
    ]);

    const headCell = (key) => el("span", { class: "hc-cookie-cell is-head", text: t(key) });

    function draw() {
      util.clear(tableHost);
      const needle = filter.trim().toLowerCase();
      const rows = (store.state.cookieJar || []).filter((row) => (
        !needle || String(row.domain || "").toLowerCase().includes(needle)
        || String(row.name || "").toLowerCase().includes(needle)
      ));
      tableHost.append(el("div", { class: "hc-cookie-row is-head" }, [
        headCell("cookie.domain"), headCell("cookie.name"), headCell("cookie.value"),
        headCell("cookie.path"), headCell("cookie.enabled"), el("span", {})
      ]));

      if (!rows.length) {
        tableHost.append(el("div", {
          class: "hc-cookie-empty", text: t("cookie.empty")
        }));
      }

      rows.forEach((row) => {
        const valueInput = el("input", {
          class: "hc-input hc-cookie-input", type: "text", value: row.value || "",
          title: row.expires ? `${t("cookie.expires")}: ${row.expires}` : ""
        });
        valueInput.addEventListener("change", () => {
          store.upsertCookie(Object.assign({}, row, { value: valueInput.value }));
          util.toast(t("cookie.saved"), "success");
        });
        const enabledInput = el("input", { type: "checkbox", checked: row.enabled !== false });
        enabledInput.addEventListener("change", () => {
          store.upsertCookie(Object.assign({}, row, { enabled: enabledInput.checked }));
        });
        tableHost.append(el("div", { class: "hc-cookie-row" }, [
          el("span", { class: "hc-cookie-cell", text: row.domain || "", title: row.domain || "" }),
          el("span", { class: "hc-cookie-cell", text: row.name || "", title: row.name || "" }),
          valueInput,
          el("span", { class: "hc-cookie-cell", text: row.path || "/", title: row.path || "/" }),
          enabledInput,
          el("button", {
            class: "hc-icon-btn hc-cookie-del", type: "button", text: "×",
            title: t("action.delete"), "aria-label": t("action.delete"),
            on: { click: () => { store.deleteCookie(row.id); draw(); } }
          })
        ]));
      });

      const addDomain = el("input", { class: "hc-input", type: "text", placeholder: t("cookie.domain") });
      const addName = el("input", { class: "hc-input", type: "text", placeholder: t("cookie.name") });
      const addValue = el("input", { class: "hc-input", type: "text", placeholder: t("cookie.value") });
      const addPath = el("input", { class: "hc-input", type: "text", placeholder: "/", value: "/" });
      const addRow = el("div", { class: "hc-cookie-add-row" }, [
        addDomain, addName, addValue, addPath,
        el("button", {
          class: "hc-btn hc-btn-sm", type: "button", text: t("cookie.add"),
          on: {
            click: () => {
              if (!addName.value.trim()) { addName.focus(); return; }
              store.upsertCookie({
                domain: addDomain.value.trim(), name: addName.value.trim(),
                value: addValue.value, path: addPath.value.trim() || "/"
              });
              addName.value = ""; addValue.value = "";
              util.toast(t("cookie.added"), "success");
              draw();
            }
          }
        })
      ]);
      tableHost.append(addRow);
      const total = (store.state.cookieJar || []).length;
      summary.textContent = `${total} · ${rows.length}`;
    }

    search.addEventListener("input", () => { filter = search.value; draw(); });
    util.openModal({
      title: t("dialog.cookieTitle"),
      className: "hc-cookie-modal",
      render: (body, api) => {
        if (api && api.modal) api.modal.classList.add("hc-cookie-modal");
        body.append(search, tableHost, summary, clearBar);
      },
      actions: [
        {
          label: t("cookie.clearAll"),
          onClick: () => { clearBar.hidden = false; }
        },
        { label: t("action.close"), kind: "primary", onClick: (api) => api.close() }
      ]
    });
    draw();
  }

  /* ------------------------------------------------ global variables ----- */

  function openGlobalsDialog() {
    const draft = JSON.parse(JSON.stringify(store.state.globals || []));
    if (!draft.length || draft.every((row) => row && row.key)) draft.push(util.emptyRow());
    const counter = el("span", { class: "hc-env-count" });
    const updateCount = () => {
      const enabled = draft.filter((row) => row && row.enabled !== false && String(row.key || "").trim()).length;
      counter.textContent = t("globals.varCount", { count: enabled });
    };
    util.openModal({
      title: t("globals.title"),
      render: (body) => {
        body.append(el("div", { class: "hc-hint", text: t("globals.hint") }));
        body.append(el("div", { class: "hc-env-head-row" }, [
          el("span", { class: "hc-field-label", text: t("globals.subtitle") }),
          el("span", { class: "hc-grow" }), counter
        ]));
        const kvScroll = el("div", { class: "hc-env-kv" });
        const kvHost = el("div");
        kvScroll.append(kvHost);
        body.append(kvScroll);
        util.createKVEditor(kvHost, {
          rows: draft,
          keyLabel: t("kv.keyName"),
          valueLabel: t("kv.valueName"),
          descriptionLabel: t("kv.description"),
          keyPlaceholder: t("kv.keyPlaceholder"),
          valuePlaceholder: t("kv.valuePlaceholder"),
          descriptionPlaceholder: t("kv.descriptionPlaceholder"),
          onChange: updateCount
        });
        updateCount();
        body.append(el("div", { class: "hc-hint", text: t("globals.precedence") }));
      },
      actions: [
        { label: t("action.cancel2"), onClick: (api) => api.close() },
        {
          label: t("action.save2"), kind: "primary",
          onClick: (api) => {
            store.state.globals = draft.filter((row) => row && (row.key || row.value));
            store.persist();
            store.emit("environments");
            if (HC.viewRequest && store.activeTab()) HC.viewRequest.updateUrlHighlight(store.activeTab());
            util.toast(t("globals.saved"), "success");
            api.close();
          }
        }
      ]
    });
  }

  /* --------------------------------------------------------- cases ------- */

  const CASE_FIELDS = [
    "clientType", "method", "url", "headers", "params", "pathParams", "cookies",
    "body", "auth", "scripts", "options", "graphql"
  ];

  function openCasesDialog() {
    const tab = store.activeTab();
    if (!tab) { util.toast(t("cases.noTab"), "error"); return; }
    if (!Array.isArray(tab.cases)) tab.cases = [];
    const listHost = el("div", { class: "hc-case-list" });
    const summary = el("div", { class: "hc-hint hc-case-summary" });
    const nameInput = el("input", {
      class: "hc-input", type: "text", spellcheck: "false",
      placeholder: t("cases.namePlaceholder")
    });
    const snapshotFor = () => {
      const snap = store.snapshotRequest(tab, tab.name);
      ["id", "name", "runPolicy", "examples"].forEach((key) => { delete snap[key]; });
      return snap;
    };
    const applyCase = (item) => {
      CASE_FIELDS.forEach((key) => {
        if (item.snapshot[key] !== undefined) tab[key] = JSON.parse(JSON.stringify(item.snapshot[key]));
      });
      tab.activeCaseId = item.id;
      store.markDirty(tab);
      store.persist();
      HC.viewRequest.render();
      if (HC.viewRequest.updateUrlHighlight) HC.viewRequest.updateUrlHighlight(tab);
      renderToolbarState();
      renderTabs();
    };
    const draw = () => {
      util.clear(listHost);
      if (!tab.cases.length) {
        listHost.append(el("div", { class: "hc-hint", text: t("cases.empty") }));
        return;
      }
      tab.cases.forEach((item) => {
        listHost.append(el("div", {
          class: `hc-case-row${item.id === tab.activeCaseId ? " is-active" : ""}`
        }, [
          el("span", { class: "hc-case-name", text: item.name }),
          el("span", {
            class: "hc-case-meta",
            text: `${(item.snapshot && item.snapshot.method) || "GET"} ${(item.snapshot && item.snapshot.url) || ""}`
          }),
          el("div", { class: "hc-case-actions" }, [
            el("button", {
              class: "hc-btn hc-btn-sm hc-btn-ghost", type: "button", text: t("cases.apply"),
              on: { click: () => {
                applyCase(item);
                util.toast(t("cases.applied", { name: item.name }), "success");
                draw();
              } }
            }),
            el("button", {
              class: "hc-btn hc-btn-sm hc-btn-ghost", type: "button", text: t("action.delete"),
              on: { click: () => {
                tab.cases = tab.cases.filter((row) => row.id !== item.id);
                if (tab.activeCaseId === item.id) tab.activeCaseId = "";
                store.persist();
                draw();
              } }
            })
          ])
        ]));
      });
    };
    const saveCurrent = () => {
      const name = String(nameInput.value || "").trim()
        || t("cases.defaultName", { index: tab.cases.length + 1 });
      const item = { id: util.uid("case"), name, snapshot: snapshotFor() };
      tab.cases.push(item);
      tab.activeCaseId = item.id;
      nameInput.value = "";
      store.persist();
      draw();
      util.toast(t("cases.saved", { name }), "success");
    };
    const runAll = async () => {
      if (!tab.cases.length) return;
      const lines = [];
      for (const item of tab.cases.slice()) {
        applyCase(item);
        // send() resolves after the response (and post-script) is attached.
        await send();
        const result = tab.response || {};
        const label = result.error
          ? (result.error.message || "error")
          : `${result.status || 0} ${result.ok ? "OK" : "FAIL"}`;
        lines.push(`${item.name}: ${label} (${result.durationMs || 0} ms)`);
      }
      summary.textContent = `${t("cases.runSummary", { count: lines.length })}\n${lines.join("\n")}`;
      util.toast(t("cases.runDone", { count: lines.length }), "success");
    };
    draw();
    nameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); saveCurrent(); }
    });
    util.openModal({
      title: t("cases.title"),
      render: (body) => {
        body.append(el("div", { class: "hc-hint", text: t("cases.hint") }));
        body.append(el("div", { class: "hc-case-add-row" }, [
          nameInput,
          el("button", {
            class: "hc-btn hc-btn-sm hc-btn-primary", type: "button",
            text: t("cases.saveCurrent"), on: { click: saveCurrent }
          })
        ]));
        body.append(listHost);
        body.append(summary);
      },
      actions: [
        { label: t("action.close"), onClick: (api) => api.close() },
        { label: t("cases.runAll"), onClick: () => { runAll(); } }
      ]
    });
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
          }),
          el("button", {
            class: "hc-btn hc-btn-sm hc-btn-ghost",
            type: "button",
            text: t("action.cookieManager"),
            on: { click: () => openCookieManager() }
          })
        ]));
        body.append(util.renderDynamicVarCatalog());
        body.append(renderHistoryLimitField());
        body.append(renderStorageDirField());
        const cookieJarRow = el("label", { class: "hc-field hc-field-inline" }, [
          el("input", {
            type: "checkbox",
            checked: store.state.settings.sendCookieJar !== false
          }),
          el("span", { text: t("settings.sendCookieJar") })
        ]);
        const cookieJarCheck = cookieJarRow.querySelector("input");
        cookieJarCheck.addEventListener("change", () => {
          store.state.settings.sendCookieJar = !!cookieJarCheck.checked;
          store.persist();
        });
        body.append(cookieJarRow);
        body.append(el("div", { class: "hc-hint", text: t("settings.dataHint") }));
        body.append(el("div", { class: "hc-body-toolbar" }, [
          el("button", {
            class: "hc-btn hc-btn-sm hc-btn-ghost", type: "button", text: t("shortcuts.title"),
            on: { click: () => { if (HC.shortcuts) HC.shortcuts.openHelp(); } }
          })
        ]));
        const actions = el("div", { class: "hc-body-toolbar" }, [
          el("button", {
            class: "hc-btn hc-btn-sm hc-btn-ghost", type: "button", text: t("settings.exportAll"),
            on: {
              click: async () => {
                if (!await util.confirmDialog({
                  title: t("settings.exportAll"),
                  message: t("dialog.exportAllWarning"),
                  confirmLabel: t("action.export"),
                  kind: "danger"
                })) return;
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
    const workflowPane = util.$("#workflow-pane");
    const workflowSplitter = util.$("#workflow-splitter");
    const tab = store.activeTab();
    const markdown = tab && tab.clientType === "markdown";
    const workflowOpen = !!(HC.workflow && HC.workflow.state && HC.workflow.state.open);
    sidebar.style.width = `${store.state.settings.sidebarWidth}px`;
    sidebar.classList.toggle("is-collapsed", !!store.state.settings.sidebarCollapsed);
    util.$("#sidebar-splitter").hidden = !!store.state.settings.sidebarCollapsed;
    if (markdown) {
      requestPane.classList.add("is-markdown");
      requestPane.style.flex = "1 1 auto";
      if (responsePane) responsePane.hidden = true;
      if (paneSplitter) paneSplitter.hidden = true;
    } else {
      const percent = store.state.settings.requestPercent;
      const requestMax = percent >= 99;
      const responseMax = percent <= 1;
      requestPane.classList.remove("is-markdown");
      requestPane.hidden = responseMax;
      requestPane.style.flex = `0 0 ${percent}%`;
      if (responsePane) responsePane.hidden = requestMax;
      if (paneSplitter) paneSplitter.hidden = requestMax || responseMax;
    }
    if (workflowPane) {
      if (workflowOpen) {
        const fullscreen = !!(HC.workflow && HC.workflow.state && HC.workflow.state.fullscreen);
        workflowPane.classList.toggle("is-fullscreen", fullscreen);
        if (fullscreen) {
          workflowPane.style.width = "";
          if (workflowSplitter) workflowSplitter.hidden = true;
        } else {
          let width = Number(store.state.settings.workflowWidth) || 560;
          // Migrate cramped defaults from earlier builds.
          if (width > 0 && width < 480) width = 560;
          width = Math.min(Math.max(width, 420), Math.floor(window.innerWidth * 0.85));
          store.state.settings.workflowWidth = width;
          workflowPane.style.width = `${width}px`;
          if (workflowSplitter) {
            workflowSplitter.hidden = false;
            workflowSplitter.style.right = `${width}px`;
          }
        }
      } else {
        workflowPane.classList.remove("is-fullscreen");
        if (workflowSplitter) workflowSplitter.hidden = true;
      }
    }
  }

  // Pane layout is chosen explicitly instead of cycling through three states:
  // the active state is always visible, and "balanced" is one click away even
  // from an empty response (whose toolbar is not rendered at all).
  const PANE_LAYOUTS = [
    { id: "balanced", percent: 42, label: "pane.layoutBalanced" },
    { id: "request", percent: 100, label: "pane.layoutRequest" },
    { id: "response", percent: 0, label: "pane.layoutResponse" }
  ];

  function setPaneLayout(id) {
    const layout = PANE_LAYOUTS.find((item) => item.id === id) || PANE_LAYOUTS[0];
    store.state.settings.requestPercent = layout.percent;
    applyLayout();
    store.schedulePersist();
  }

  function openPaneLayoutMenu(clickEvent) {
    if (!clickEvent || !util.openContextMenu) return;
    const anchor = clickEvent.currentTarget;
    const rect = anchor ? anchor.getBoundingClientRect() : null;
    // Pass the real event's stopPropagation through: openContextMenu calls it
    // so the document-level "click outside closes menu" listener does not
    // immediately close the menu we just opened. Position below the button.
    const positioned = {
      clientX: rect ? rect.left : clickEvent.clientX,
      clientY: rect ? rect.bottom + 4 : clickEvent.clientY,
      preventDefault: () => clickEvent.preventDefault(),
      stopPropagation: () => clickEvent.stopPropagation()
    };
    const current = Number(store.state.settings.requestPercent) || 42;
    const items = PANE_LAYOUTS.map((layout) => ({
      label: (Math.abs(current - layout.percent) < 1 ? "✓ " : "　 ") + t(layout.label),
      onClick: () => setPaneLayout(layout.id)
    }));
    items.push({ separator: true });
    items.push({ label: t("pane.layoutHint"), disabled: true });
    util.openContextMenu(positioned, items, { minWidth: 220, id: "hc-pane-layout-menu" });
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
      const width = Math.min(Math.max(event.clientX, 200), window.innerWidth - 360);
      store.state.settings.sidebarWidth = width;
      applyLayout();
    });
    const paneSplitter = util.$("#pane-splitter");
    wire(paneSplitter, (event) => {
      const main = util.$(".hc-main").getBoundingClientRect();
      const percent = ((event.clientY - main.top) / main.height) * 100;
      store.state.settings.requestPercent = Math.min(Math.max(percent, 20), 80);
      applyLayout();
    });
    if (paneSplitter) {
      paneSplitter.addEventListener("dblclick", () => {
        store.state.settings.requestPercent = 42;
        applyLayout();
        store.schedulePersist();
      });
      paneSplitter.title = t("pane.splitterHint");
    }
    const workflowSplitter = util.$("#workflow-splitter");
    if (workflowSplitter) {
      workflowSplitter.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        workflowSplitter.classList.add("is-dragging");
        workflowSplitter.setPointerCapture(event.pointerId);
        const move = (moveEvent) => {
          const main = util.$(".hc-main").getBoundingClientRect();
          const width = Math.min(Math.max(main.right - moveEvent.clientX, 420), Math.floor(window.innerWidth * 0.85));
          store.state.settings.workflowWidth = Math.round(width);
          applyLayout();
        };
        const up = () => {
          workflowSplitter.classList.remove("is-dragging");
          workflowSplitter.releasePointerCapture(event.pointerId);
          workflowSplitter.removeEventListener("pointermove", move);
          workflowSplitter.removeEventListener("pointerup", up);
          store.persist();
        };
        workflowSplitter.addEventListener("pointermove", move);
        workflowSplitter.addEventListener("pointerup", up);
      });
    }
  }

  /* ------------------------------------------------------------------ wire */

  function wire() {
    wireTabstrip();
    util.$("#btn-send").addEventListener("click", send);
    util.$("#btn-cancel").addEventListener("click", cancel);
    util.$("#btn-save").addEventListener("click", saveRequest);
    util.$("#btn-copy-curl").addEventListener("click", copyCurl);
    const cyclePane = util.$("#btn-cycle-pane");
    if (cyclePane) cyclePane.addEventListener("click", openPaneLayoutMenu);
    // Topbar entry is never re-rendered and never hidden, so it stays reachable
    // even when the response is empty and the request pane is hidden.
    const topLayout = util.$("#btn-pane-layout");
    if (topLayout) topLayout.addEventListener("click", openPaneLayoutMenu);
    util.$("#btn-import-curl").addEventListener("click", openCurlImport);
    const dynVarsBtn = util.$("#btn-dynamic-vars");
    if (dynVarsBtn) dynVarsBtn.addEventListener("click", () => util.openDynamicVarsDialog());
    const globalsBtn = util.$("#btn-globals");
    if (globalsBtn) globalsBtn.addEventListener("click", openGlobalsDialog);
    const casesBtn = util.$("#btn-cases");
    if (casesBtn) casesBtn.addEventListener("click", openCasesDialog);
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
    const urlWrap = urlInput.closest(".hc-url-wrap") || urlInput.parentElement;
    const urlSuggest = el("div", { class: "hc-url-suggest", hidden: true, role: "listbox" });
    urlWrap.append(urlSuggest);
    let urlSuggestItems = [];
    let urlSuggestIndex = -1;
    let urlSuggestPaused = false;

    function recentUrls(query) {
      const needle = String(query || "").trim().toLowerCase();
      const seen = new Set();
      const out = [];
      (store.state.history || []).forEach((entry) => {
        [entry.url, entry.resolvedUrl].forEach((candidate) => {
          const url = String(candidate || "").trim();
          if (!url || seen.has(url)) return;
          if (needle && !url.toLowerCase().includes(needle)) return;
          seen.add(url);
          out.push({ url, method: entry.method || "GET" });
        });
      });
      return out.slice(0, 8);
    }

    function hideUrlSuggest() {
      urlSuggest.hidden = true;
      urlSuggestIndex = -1;
      urlSuggestItems = [];
    }

    function applyUrlSuggest(item) {
      if (!item) return;
      urlInput.value = item.url;
      hideUrlSuggest();
      const tab = store.activeTab();
      if (tab) {
        tab.url = item.url;
        store.markDirty(tab);
        HC.viewRequest.updateUrlHighlight(tab);
        HC.viewRequest.syncParamsFromUrl(tab);
        HC.viewRequest.render();
      }
    }

    function drawUrlSuggest() {
      urlSuggestItems = recentUrls(urlInput.value);
      urlSuggestIndex = -1;
      util.clear(urlSuggest);
      if (!urlSuggestItems.length) {
        /* Do not pop an empty box over a freshly focused, empty URL field. */
        if (String(urlInput.value || "").trim()) {
          urlSuggest.append(el("div", { class: "hc-url-suggest-head", text: t("url.recentEmpty") }));
          urlSuggest.hidden = false;
        } else {
          hideUrlSuggest();
        }
        return;
      }
      urlSuggest.append(el("div", { class: "hc-url-suggest-head", text: t("url.recentTitle") }));
      urlSuggestItems.forEach((item) => {
        const row = el("button", {
          type: "button", class: "hc-url-suggest-row", role: "option", "aria-selected": "false"
        }, [
          el("span", { class: "hc-url-suggest-method", text: item.method }),
          el("span", { class: "hc-url-suggest-url", text: item.url })
        ]);
        row.addEventListener("mousedown", (event) => event.preventDefault());
        row.addEventListener("click", () => applyUrlSuggest(item));
        urlSuggest.append(row);
      });
      urlSuggest.hidden = false;
    }

    urlInput.addEventListener("paste", (event) => {
      const clipboard = event.clipboardData || window.clipboardData;
      const raw = String((clipboard && clipboard.getData("text")) || "").trim();
      if (!raw) return;
      const looksCurl = /^\s*curl\b/i.test(raw)
        || (/\s(?:-X|--request|-H|--header|-d|--data|-F|--form)\b/.test(raw) && /\bcurl\b/i.test(raw));
      if (looksCurl && HC.curl && typeof HC.curl.parseCurl === "function") {
        const parsed = HC.curl.parseCurl(raw);
        if (parsed) {
          event.preventDefault();
          applyParsedRequest(parsed);
          hideUrlSuggest();
          util.toast(t("toast.pasteCurl"), "success");
          return;
        }
      }
      urlSuggestPaused = true;
    });
    urlInput.addEventListener("focus", drawUrlSuggest);
    urlInput.addEventListener("input", () => {
      const tab = store.activeTab();
      if (!tab) return;
      tab.url = urlInput.value;
      store.markDirty(tab);
      HC.viewRequest.updateUrlHighlight(tab);
      if (urlSuggestPaused) { urlSuggestPaused = false; hideUrlSuggest(); return; }
      drawUrlSuggest();
    });
    urlInput.addEventListener("change", () => {
      const tab = store.activeTab();
      if (!tab) return;
      tab.url = urlInput.value;
      store.markDirty(tab);
      HC.viewRequest.syncParamsFromUrl(tab);
      HC.viewRequest.render();
    });
    urlInput.addEventListener("blur", () => {
      window.setTimeout(() => {
        if (!urlSuggest.contains(document.activeElement)) hideUrlSuggest();
      }, 120);
    });
    urlInput.addEventListener("keydown", (event) => {
      if (!urlSuggest.hidden && urlSuggestItems.length) {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          urlSuggestIndex = (urlSuggestIndex + (event.key === "ArrowDown" ? 1 : -1) + urlSuggestItems.length) % urlSuggestItems.length;
          urlSuggest.querySelectorAll(".hc-url-suggest-row").forEach((node, index) => {
            const active = index === urlSuggestIndex;
            node.classList.toggle("is-selected", active);
            node.setAttribute("aria-selected", active ? "true" : "false");
            if (active) node.scrollIntoView({ block: "nearest" });
          });
          return;
        }
        if (event.key === "Escape") { hideUrlSuggest(); return; }
        if (event.key === "Enter" && urlSuggestIndex >= 0) {
          event.preventDefault();
          applyUrlSuggest(urlSuggestItems[urlSuggestIndex]);
          return;
        }
      }
      if (event.key === "Enter") { event.preventDefault(); send(); }
    });

    wireEnvPicker();

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

    store.subscribe((reason, payload) => {
      if (reason === "loaded" || reason === "tabs") {
        renderTabs();
        renderToolbarState();
      }
      if (reason === "tab-dirty") {
        patchTab(payload);
        renderToolbarState();
      }
      // Closing / switching tabs only emits "tabs"; without a request/response
      // re-render the pane keeps showing the previous tab's URL/headers/body.
      if (reason === "tabs" || reason === "loaded") {
        HC.viewRequest.render();
        HC.viewResponse.render();
        if (HC.app && HC.app.applyLayout) HC.app.applyLayout();
        // Tree selection follows the active tab; sync without full rebuild.
        if (HC.viewSidebar && HC.viewSidebar.syncActive) {
          HC.viewSidebar.syncActive({ fromTab: true });
        }
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
      if (reason === "memory-only") {
        syncMemoryBadge();
        util.toast(t("status.memoryOnly"), "error");
      }
      if (reason === "memory-ok") syncMemoryBadge();
    });

    if (HC.shortcuts && HC.shortcuts.bind) {
      HC.shortcuts.bind({
        send: () => send(),
        save: () => saveRequest(),
        saveAs: () => saveRequest({ forceDialog: true }),
        newTab: () => createHttpRequest(),
        closeTab: async () => {
          const tab = store.activeTab();
          if (!tab) return;
          if (await confirmCloseTab(tab)) {
            store.closeTab(tab.id);
            HC.viewRequest.render();
            HC.viewResponse.render();
          }
        },
        focusUrl: () => {
          const input = util.$("#url-input");
          if (input) { input.focus(); input.select(); }
        },
        openEnv: () => {
          const trigger = util.$("#env-picker-trigger");
          if (trigger) trigger.click();
        },
        duplicate: () => duplicateActiveTab(),
        clone: () => cloneActiveRequest(),
        copyCurl: () => copyCurl(),
        cancel: () => {
          const tab = store.activeTab();
          if (tab && tab.sending) cancel();
        }
      });
    }

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
    syncMemoryBadge();
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
    if (HC.workflow && HC.workflow.init) HC.workflow.init();
    if (settled) {
      if (!bridge.backendReady) util.toast(t("err.backendHint"), "error");
      return;
    }
    // The handshake was still in flight when the guard fired. Refresh the toolbar
    // once it lands, otherwise the send button stays disabled for the whole session.
    bridge.ready.then(() => {
      renderToolbarState();
      if (HC.workflow && HC.workflow.refreshStatus) HC.workflow.refreshStatus();
      if (!bridge.backendReady) util.toast(t("err.backendHint"), "error");
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
