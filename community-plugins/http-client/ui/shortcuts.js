/* Central keyboard shortcuts (ApiPost / Postman-aligned). */

(function () {
  const t = (key, params) => HC.i18n.t(key, params);

  /** Canonical chord labels for menus / help (Ctrl → ⌘ on Mac at render time). */
  const keys = {
    send: "Ctrl+Enter",
    save: "Ctrl+S",
    saveAs: "Ctrl+Shift+S",
    copyCurl: "Ctrl+Shift+C",
    focusUrl: "Ctrl+K",
    newTab: "Ctrl+T",
    closeTab: "Ctrl+W",
    duplicateTab: "Ctrl+D",
    cloneRequest: "Ctrl+Shift+D",
    focusSearch: "Ctrl+F",
    responseSearch: "Ctrl+Shift+F",
    openEnv: "Ctrl+E",
    cycleEnv: "Ctrl+Shift+E",
    rename: "F2",
    help: "Ctrl+Shift+/",
    palette: "Ctrl+P"
  };

  function isEditable(target) {
    if (!target || !target.tagName) return false;
    const tag = String(target.tagName).toUpperCase();
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (target.isContentEditable) return true;
    return false;
  }

  function catalog() {
    return [
      { group: t("shortcuts.group.request"), items: [
        { keys: `${keys.send} / Alt+S`, action: t("shortcuts.send") },
        { keys: keys.save, action: t("shortcuts.save") },
        { keys: keys.saveAs, action: t("shortcuts.saveAs") },
        { keys: keys.copyCurl, action: t("shortcuts.copyCurl") },
        { keys: keys.focusUrl, action: t("shortcuts.focusUrl") },
        { keys: "Esc", action: t("shortcuts.cancel") }
      ] },
      { group: t("shortcuts.group.tabs"), items: [
        { keys: `${keys.newTab} / Ctrl+N`, action: t("shortcuts.newTab") },
        { keys: keys.closeTab, action: t("shortcuts.closeTab") },
        { keys: "Ctrl+Tab / Ctrl+PageDown", action: t("shortcuts.nextTab") },
        { keys: "Ctrl+Shift+Tab / Ctrl+PageUp", action: t("shortcuts.prevTab") },
        { keys: keys.duplicateTab, action: t("shortcuts.duplicateTab") },
        { keys: keys.cloneRequest, action: t("shortcuts.cloneRequest") }
      ] },
      { group: t("shortcuts.group.nav"), items: [
        { keys: keys.focusSearch, action: t("shortcuts.focusSearch") },
        { keys: keys.responseSearch, action: t("shortcuts.responseSearch") },
        { keys: keys.openEnv, action: t("shortcuts.openEnv") },
        { keys: keys.cycleEnv, action: t("shortcuts.cycleEnv") },
        { keys: keys.rename, action: t("shortcuts.rename") },
        { keys: keys.help, action: t("shortcuts.help") },
        { keys: keys.palette, action: t("cmd.title") }
      ] }
    ];
  }

  function openHelp() {
    const util = HC.util;
    util.openModal({
      title: t("shortcuts.title"),
      render: (body, api) => {
        if (api && api.modal) api.modal.classList.add("hc-modal-shortcuts");
        body.append(elHint());
        catalog().forEach((section) => {
          body.append(util.el("div", { class: "hc-shortcuts-group-title", text: section.group }));
          const table = util.el("div", { class: "hc-shortcuts-table" });
          section.items.forEach((row) => {
            table.append(util.el("div", { class: "hc-shortcuts-row" }, [
              util.el("kbd", { class: "hc-shortcuts-keys", text: row.keys }),
              util.el("span", { class: "hc-shortcuts-action", text: row.action })
            ]));
          });
          body.append(table);
        });
      },
      actions: [{ label: t("action.close"), kind: "primary", onClick: (api) => api.close() }]
    });
  }

  function elHint() {
    return HC.util.el("div", {
      class: "hc-hint",
      text: t("shortcuts.hint")
    });
  }

  function switchTab(delta) {
    const store = HC.store;
    const tabs = store.state.tabs || [];
    if (tabs.length < 2) return;
    const activeId = store.state.activeTabId;
    let index = tabs.findIndex((tab) => tab.id === activeId);
    if (index < 0) index = 0;
    const next = (index + delta + tabs.length) % tabs.length;
    store.setActiveTab(tabs[next].id);
    if (HC.viewRequest) HC.viewRequest.render();
    if (HC.viewResponse) HC.viewResponse.render();
  }

  function cycleEnvironment() {
    const store = HC.store;
    const list = store.state.environments || [];
    if (!list.length) return;
    const current = store.state.activeEnvironmentId || "";
    let index = list.findIndex((item) => item.id === current);
    index = (index + 1) % list.length;
    store.state.activeEnvironmentId = list[index].id;
    store.persist();
    store.emit("environments");
    HC.util.toast(t("shortcuts.envSwitched", { name: list[index].name }), "success");
  }

  function focusSidebarSearch() {
    const store = HC.store;
    if (store.state.sideView !== "collections" && store.state.sideView !== "history" && store.state.sideView !== "environments") {
      store.state.sideView = "collections";
    }
    if (HC.viewSidebar) HC.viewSidebar.render();
    requestAnimationFrame(() => {
      const input = HC.util.$(".hc-side-search");
      if (input) {
        input.focus();
        input.select();
      }
    });
  }

  function renameActiveSaved() {
    const tab = HC.store.activeTab();
    if (!tab || !tab.savedRequestId) {
      HC.util.toast(t("shortcuts.renameNeedSaved"), "error");
      return;
    }
    if (HC.viewSidebar && HC.viewSidebar.startInlineRenameRequest) {
      HC.store.state.sideView = "collections";
      HC.viewSidebar.render();
      HC.viewSidebar.startInlineRenameRequest(tab.savedRequestId);
    }
  }

  function bind(handlers) {
    const h = handlers || {};
    document.addEventListener("keydown", (event) => {
      const key = event.key;
      const lower = String(key || "").toLowerCase();
      const mod = event.ctrlKey || event.metaKey;
      const alt = event.altKey;
      const shift = event.shiftKey;
      const editable = isEditable(event.target);

      // Help: Ctrl+Shift+/ or Ctrl+?
      if (mod && shift && (lower === "/" || key === "?")) {
        event.preventDefault();
        openHelp();
        return;
      }

      // Command palette — allowed from inputs too.
      if (mod && !shift && lower === "p") {
        event.preventDefault();
        if (HC.commandPalette) HC.commandPalette.open();
        return;
      }

      // ApiPost-style Alt+S send (works even in inputs)
      if (alt && !mod && lower === "s") {
        event.preventDefault();
        if (h.send) h.send();
        return;
      }

      if (mod && lower === "enter") {
        event.preventDefault();
        if (h.send) h.send();
        return;
      }

      if (mod && lower === "s") {
        event.preventDefault();
        if (shift) {
          if (h.saveAs) h.saveAs();
        } else if (h.save) h.save();
        return;
      }

      if (key === "Escape") {
        if (HC.util.closeContextMenu) HC.util.closeContextMenu();
        if (HC.app && HC.app.closeAddMenu) HC.app.closeAddMenu();
        if (h.cancel) h.cancel();
        return;
      }

      if (key === "F2" && !editable) {
        event.preventDefault();
        renameActiveSaved();
        return;
      }

      if (!mod) return;

      // Tab switching — allow even when focus is in inputs
      if (lower === "tab") {
        event.preventDefault();
        switchTab(shift ? -1 : 1);
        return;
      }
      if (key === "PageDown") {
        event.preventDefault();
        switchTab(1);
        return;
      }
      if (key === "PageUp") {
        event.preventDefault();
        switchTab(-1);
        return;
      }
      // ApiPost: Ctrl+Alt+←/→
      if (alt && (key === "ArrowLeft" || key === "ArrowRight")) {
        event.preventDefault();
        switchTab(key === "ArrowRight" ? 1 : -1);
        return;
      }

      if (editable && !(lower === "s" || lower === "enter")) {
        // Still allow a few globals from inputs
        if (lower === "k" || lower === "f" || lower === "e" || lower === "t" || lower === "n" || lower === "d" || lower === "w") {
          /* fall through */
        } else if (shift && lower === "c") {
          /* fall through */
        } else if (shift && lower === "e") {
          /* fall through */
        } else {
          return;
        }
      }

      if (lower === "t" || lower === "n") {
        event.preventDefault();
        if (h.newTab) h.newTab();
        return;
      }
      if (lower === "w") {
        if (editable) return;
        event.preventDefault();
        if (h.closeTab) h.closeTab();
        return;
      }
      if (lower === "k") {
        event.preventDefault();
        if (h.focusUrl) h.focusUrl();
        return;
      }
      if (lower === "f") {
        event.preventDefault();
        if (shift) {
          if (HC.viewResponse && HC.viewResponse.focusSearch) HC.viewResponse.focusSearch();
        } else if (event.target && event.target.closest && event.target.closest("#response-pane")) {
          if (HC.viewResponse && HC.viewResponse.focusSearch) HC.viewResponse.focusSearch();
          else focusSidebarSearch();
        } else {
          focusSidebarSearch();
        }
        return;
      }
      if (lower === "e") {
        event.preventDefault();
        if (shift) cycleEnvironment();
        else if (h.openEnv) h.openEnv();
        return;
      }
      if (lower === "d") {
        event.preventDefault();
        if (shift) {
          if (h.clone) h.clone();
          else if (h.duplicate) h.duplicate();
        } else if (h.duplicate) {
          h.duplicate();
        }
        return;
      }
      if (shift && lower === "c") {
        event.preventDefault();
        if (h.copyCurl) h.copyCurl();
      }
    });
  }

  window.HC.shortcuts = { bind, openHelp, catalog, keys, switchTab, cycleEnvironment };
})();
