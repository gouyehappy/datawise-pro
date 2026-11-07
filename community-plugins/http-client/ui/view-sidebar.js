/* Sidebar: collections, history and environment/variable management. */

(function () {
  const util = HC.util;
  const store = HC.store;
  const t = (key, params) => HC.i18n.t(key, params);
  const el = util.el;

  let sideFilter = "";

  function render() {
    renderActions();
    const host = util.clear(util.$("#sidebar-body"));
    const view = store.state.sideView;
    if (view === "collections") renderCollections(host);
    else if (view === "history") renderHistory(host);
    else renderEnvironments(host);
  }

  function filterText(value) {
    return String(value || "").toLowerCase();
  }

  function matchesFilter(text) {
    const needle = filterText(sideFilter).trim();
    if (!needle) return true;
    return filterText(text).includes(needle);
  }

  function renderActions() {
    const host = util.clear(util.$("#sidebar-actions"));
    const view = store.state.sideView;
    const toolbar = el("div", { class: "hc-side-toolbar" });
    const search = el("input", {
      class: "hc-side-search",
      type: "search",
      placeholder: view === "environments" ? t("side.searchEnv")
        : view === "history" ? t("side.searchHistory")
          : t("side.searchApis"),
      value: sideFilter,
      spellcheck: "false"
    });
    search.addEventListener("input", () => {
      sideFilter = search.value || "";
      const body = util.$("#sidebar-body");
      if (!body) return;
      util.clear(body);
      if (view === "collections") renderCollections(body);
      else if (view === "history") renderHistory(body);
      else renderEnvironments(body);
    });

    const actions = el("div", { class: "hc-side-toolbar-actions" });
    const iconBtn = (className, title, svg, onClick, disabled) => {
      const btn = el("button", {
        class: className,
        type: "button",
        title,
        "aria-label": title,
        disabled: disabled ? "true" : undefined
      });
      btn.innerHTML = svg;
      if (onClick) btn.addEventListener("click", onClick);
      return btn;
    };
    const plusSvg = "<svg viewBox=\"0 0 16 16\" width=\"14\" height=\"14\" aria-hidden=\"true\"><path fill=\"currentColor\" d=\"M7.25 2.5h1.5v4.75H13.5v1.5H8.75V13.5h-1.5V8.75H2.5v-1.5h4.75V2.5z\"/></svg>";
    const importSvg = "<svg viewBox=\"0 0 16 16\" width=\"14\" height=\"14\" aria-hidden=\"true\"><path fill=\"currentColor\" d=\"M8 1.75a.75.75 0 0 1 .75.75v6.19l1.72-1.72a.75.75 0 1 1 1.06 1.06l-3 3a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 0 1 1.06-1.06l1.72 1.72V2.5A.75.75 0 0 1 8 1.75zm-4.5 9.5h9a.75.75 0 0 1 0 1.5h-9a.75.75 0 0 1 0-1.5z\"/></svg>";
    const clearSvg = "<svg viewBox=\"0 0 16 16\" width=\"14\" height=\"14\" aria-hidden=\"true\"><path fill=\"currentColor\" d=\"M6.5 2.75A.75.75 0 0 1 7.25 2h1.5a.75.75 0 0 1 .75.75V3.5h3a.75.75 0 0 1 0 1.5h-.34l-.55 7.15A1.75 1.75 0 0 1 9.87 13.5H6.13a1.75 1.75 0 0 1-1.74-1.65L3.84 5H3.5a.75.75 0 0 1 0-1.5h3V2.75zM5.35 5l.53 6.9c.03.36.33.6.7.6h3.74c.37 0 .67-.24.7-.6L11.15 5H5.35z\"/></svg>";

    if (view === "collections") {
      const addBtn = iconBtn("hc-side-add", t("action.addMenu"), plusSvg, (event) => {
        event.stopPropagation();
        if (HC.app && HC.app.openAddMenu) HC.app.openAddMenu(addBtn);
      });
      addBtn.setAttribute("aria-haspopup", "menu");
      addBtn.setAttribute("aria-expanded", "false");
      actions.append(addBtn);
    } else if (view === "history") {
      actions.append(iconBtn(
        "hc-side-tool hc-side-tool-icon",
        t("action.clearHistory"),
        clearSvg,
        async () => {
          if (await util.confirmDialog({ title: t("action.clearHistory"), message: t("dialog.deleteMessage", { name: t("side.history") }) })) {
            store.clearHistory();
            util.toast(t("toast.historyCleared"));
          }
        },
        !store.state.history.length
      ));
    } else {
      actions.append(iconBtn("hc-side-add", t("env.new"), plusSvg, async () => {
        const name = await util.promptDialog({ title: t("env.new"), label: t("dialog.name") });
        if (name) {
          const created = store.createEnvironment(name);
          if (HC.viewEnv && HC.viewEnv.openEnvironment) HC.viewEnv.openEnvironment(created.id);
        }
      }));
      actions.append(iconBtn("hc-side-tool hc-side-tool-icon", t("action.importAll"), importSvg, openImportDialog));
    }

    // Search fills left; equal icon buttons on the right.
    toolbar.append(search);
    toolbar.append(actions);
    host.append(toolbar);
  }

  /* ----------------------------------------------------------- collections */

  function itemMatchesFilter(item) {
    if (!item) return false;
    if (matchesFilter(item.name) || matchesFilter(item.url) || matchesFilter(item.method)) return true;
    if (item.kind === "folder" && Array.isArray(item.items)) {
      return item.items.some((child) => itemMatchesFilter(child));
    }
    return false;
  }

  function filterItems(items) {
    const needle = filterText(sideFilter).trim();
    if (!needle) return items || [];
    const out = [];
    (items || []).forEach((item) => {
      if (item.kind === "folder") {
        if (!itemMatchesFilter(item)) return;
        const next = Object.assign({}, item, { items: filterItems(item.items) });
        // Keep folder even if only the folder name matched and children empty.
        if (!next.items.length && !matchesFilter(item.name)) return;
        out.push(next);
      } else if (itemMatchesFilter(item)) {
        out.push(item);
      }
    });
    return out;
  }

  function renderCollections(host) {
    if (!store.state.collections.length) {
      host.append(el("div", { class: "hc-empty", text: t("side.emptyCollections") }));
      return;
    }
    // Prefer ApiPost trees first so the sidebar reads like「全部接口」.
    const ordered = store.state.collections.slice().sort((a, b) => {
      const as = a.source === "apipost" ? 0 : 1;
      const bs = b.source === "apipost" ? 0 : 1;
      if (as !== bs) return as - bs;
      return String(a.name || "").localeCompare(String(b.name || ""), "zh");
    });
    let shown = 0;
    ordered.forEach((collection) => {
      const needle = filterText(sideFilter).trim();
      if (!needle) {
        host.append(renderCollection(collection));
        shown += 1;
        return;
      }
      const filteredItems = filterItems(collection.items);
      const nameHit = matchesFilter(collection.name);
      if (!filteredItems.length && !nameHit) return;
      const clone = Object.assign({}, collection, {
        items: nameHit && !filteredItems.length ? collection.items : filteredItems,
        collapsed: false
      });
      host.append(renderCollection(clone));
      shown += 1;
    });
    if (!shown) host.append(el("div", { class: "hc-empty hc-empty-sm", text: t("side.searchEmpty") }));
  }

  /* --------------------------------------------------------------- drag-drop */

  let dragPayload = null;
  let dragMoved = false;
  let dragGhost = null;
  let dragOverRow = null;

  function clearDropMarks() {
    util.$$(".hc-tree-drop-into, .hc-tree-drop-before, .hc-tree-drop-after").forEach((node) => {
      node.classList.remove("hc-tree-drop-into", "hc-tree-drop-before", "hc-tree-drop-after");
    });
    dragOverRow = null;
  }

  function canDropOn(payload, target) {
    if (!payload || !target) return false;
    if (payload.id === target.id) return false;
    if (payload.kind === "folder" && target.kind === "folder") {
      if (store.folderContains(payload.id, target.id)) return false;
    }
    return true;
  }

  function dropZone(row, clientY) {
    const rect = row.getBoundingClientRect();
    const y = clientY - rect.top;
    const ratio = rect.height ? y / rect.height : 0.5;
    const kind = row.dataset.dropKind || "";
    if (kind === "folder" || kind === "collection") {
      if (ratio < 0.28) return "before";
      if (ratio > 0.72) return "after";
      return "into";
    }
    return ratio < 0.5 ? "before" : "after";
  }

  function applyDropMark(row, zone) {
    clearDropMarks();
    if (!row || !zone) return;
    dragOverRow = row;
    if (zone === "into") row.classList.add("hc-tree-drop-into");
    else if (zone === "before") row.classList.add("hc-tree-drop-before");
    else if (zone === "after") row.classList.add("hc-tree-drop-after");
  }

  function resolveDropTarget(row, zone) {
    const kind = row.dataset.dropKind;
    const collectionId = row.dataset.collectionId;
    const nodeId = row.dataset.nodeId || "";
    if (!collectionId) return null;
    if (kind === "collection") {
      return { collectionId, folderId: "", beforeItemId: "" };
    }
    if (kind === "folder") {
      if (zone === "into") return { collectionId, folderId: nodeId, beforeItemId: "" };
      const located = store.locate(nodeId);
      if (!located) return null;
      const parentFolderId = located.parent && located.parent.kind === "folder" ? located.parent.id : "";
      if (zone === "before") return { collectionId: located.collection.id, folderId: parentFolderId, beforeItemId: nodeId };
      const next = located.list[located.index + 1];
      return {
        collectionId: located.collection.id,
        folderId: parentFolderId,
        beforeItemId: next ? next.id : ""
      };
    }
    if (kind === "request") {
      const located = store.locate(nodeId);
      if (!located) return null;
      const parentFolderId = located.parent && located.parent.kind === "folder" ? located.parent.id : "";
      if (zone === "before") {
        return { collectionId: located.collection.id, folderId: parentFolderId, beforeItemId: nodeId };
      }
      const next = located.list[located.index + 1];
      return {
        collectionId: located.collection.id,
        folderId: parentFolderId,
        beforeItemId: next ? next.id : ""
      };
    }
    return null;
  }

  function findDropRow(clientX, clientY, sourceId) {
    const stack = document.elementsFromPoint(clientX, clientY);
    for (let i = 0; i < stack.length; i += 1) {
      const node = stack[i];
      if (!node || !node.closest) continue;
      const row = node.closest(".hc-tree-row[data-drop-kind]");
      if (!row) continue;
      if (row.classList.contains("hc-tree-drag-ghost")) continue;
      if (row.dataset.nodeId === sourceId) continue;
      return row;
    }
    return null;
  }

  function removeGhost() {
    if (dragGhost) {
      dragGhost.remove();
      dragGhost = null;
    }
  }

  function commitDrop(payload, row, clientY) {
    if (!payload || !row) return;
    const zone = dropZone(row, clientY);
    const target = resolveDropTarget(row, zone);
    clearDropMarks();
    if (!target) return;
    if (payload.kind === "folder") {
      if (target.folderId === payload.id) return;
      if (target.folderId && store.folderContains(payload.id, target.folderId)) return;
    }
    const located = store.locate(payload.id);
    if (located) {
      const currentParent = located.parent && located.parent.kind === "folder" ? located.parent.id : "";
      const currentCollection = located.collection.id;
      if (currentCollection === target.collectionId && currentParent === (target.folderId || "")) {
        if (!target.beforeItemId) {
          if (located.index === located.list.length - 1) return;
        } else if (target.beforeItemId === payload.id) return;
      }
    }
    const ok = store.moveItem(payload.id, target.collectionId, target.folderId, target.beforeItemId || "");
    util.toast(ok ? t("toast.moved") : t("toast.moveFailed"), ok ? "success" : "error");
  }

  function wireDragSource(row, payload) {
    const DRAG_START_PX = 5;
    let startX = 0;
    let startY = 0;
    let pointerId = null;
    let dragging = false;
    let active = false;

    row.draggable = false;
    row.dataset.dragKind = payload.kind;

    function endSession() {
      active = false;
      dragging = false;
      dragPayload = null;
      row.classList.remove("is-drag-ready", "is-dragging");
      removeGhost();
      clearDropMarks();
      document.body.classList.remove("hc-tree-dragging");
      if (pointerId !== null) {
        try { row.releasePointerCapture(pointerId); } catch (error) { /* ignore */ }
        pointerId = null;
      }
    }

    function beginDrag(event) {
      dragging = true;
      dragMoved = true;
      dragPayload = payload;
      row.classList.remove("is-drag-ready");
      row.classList.add("is-dragging");
      document.body.classList.add("hc-tree-dragging");
      removeGhost();
      const ghost = row.cloneNode(true);
      ghost.classList.add("hc-tree-drag-ghost");
      ghost.classList.remove("is-dragging", "is-drag-ready", "hc-tree-drop-into", "hc-tree-drop-before", "hc-tree-drop-after");
      ghost.style.width = `${Math.max(120, row.getBoundingClientRect().width)}px`;
      document.body.append(ghost);
      dragGhost = ghost;
      moveGhost(event.clientX, event.clientY);
    }

    function moveGhost(clientX, clientY) {
      if (!dragGhost) return;
      dragGhost.style.left = `${clientX + 12}px`;
      dragGhost.style.top = `${clientY - 14}px`;
    }

    function updateHover(clientX, clientY) {
      const over = findDropRow(clientX, clientY, payload.id);
      if (!over) {
        clearDropMarks();
        return;
      }
      if (!canDropOn(payload, { id: over.dataset.nodeId || over.dataset.collectionId, kind: over.dataset.dropKind })) {
        clearDropMarks();
        return;
      }
      if (payload.kind === "folder" && over.dataset.dropKind === "folder" && store.folderContains(payload.id, over.dataset.nodeId)) {
        clearDropMarks();
        return;
      }
      applyDropMark(over, dropZone(over, clientY));
    }

    row.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      endSession();
      dragMoved = false;
      active = true;
      startX = event.clientX;
      startY = event.clientY;
      pointerId = event.pointerId;
      row.classList.add("is-drag-ready");
      try { row.setPointerCapture(event.pointerId); } catch (error) { /* ignore */ }
    });

    row.addEventListener("pointermove", (event) => {
      if (!active || (pointerId !== null && event.pointerId !== pointerId)) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      const dist2 = dx * dx + dy * dy;

      if (!dragging && dist2 > (DRAG_START_PX * DRAG_START_PX)) {
        beginDrag(event);
      }
      if (!dragging) return;
      event.preventDefault();
      moveGhost(event.clientX, event.clientY);
      updateHover(event.clientX, event.clientY);
    });

    function finishPointer(event) {
      if (!active || (pointerId !== null && event.pointerId !== pointerId)) return;
      const wasDragging = dragging;
      const over = dragOverRow;
      const y = event.clientY;
      const data = payload;
      endSession();
      if (wasDragging) {
        commitDrop(data, over, y);
        setTimeout(() => { dragMoved = false; }, 0);
      }
    }

    row.addEventListener("pointerup", finishPointer);
    row.addEventListener("pointercancel", (event) => {
      if (!active || (pointerId !== null && event.pointerId !== pointerId)) return;
      endSession();
      setTimeout(() => { dragMoved = false; }, 0);
    });
  }

  function renderCollection(collection) {
    const count = store.countRequests(collection.items);
    const isApipost = collection.source === "apipost";
    const group = el("div", {
      class: `hc-side-group hc-collection${isApipost ? " is-apipost" : ""}`,
      dataset: { nodeId: collection.id, kind: "collection" }
    });
    const head = el("div", {
      class: `hc-tree-row hc-tree-root-row${isApipost ? " is-apipost" : ""}`,
      "aria-expanded": collection.collapsed ? "false" : "true",
      title: collection.name,
      dataset: {
        dropKind: "collection",
        collectionId: collection.id,
        nodeId: collection.id
      }
    }, [
      el("span", {
        class: `hc-tree-twist${collection.collapsed ? "" : " is-open"}`,
        "aria-hidden": "true"
      }),
      el("span", { class: "hc-grow hc-list-title", text: isApipost ? t("side.allApis") : collection.name }),
      el("span", { class: "hc-count", text: count ? `(${count})` : "" })
    ]);
    head.addEventListener("contextmenu", (event) => openContextMenu(event, collectionMenu(collection)));
    head.addEventListener("click", () => store.toggleCollapsed(collection.id));
    group.append(head);
    group.append(renderItemList(collection, collection.items, !!collection.collapsed, 0));
    return group;
  }

  function renderItemList(collection, items, collapsed, depth) {
    const body = el("div", {
      class: `hc-side-group-body${depth > 0 ? " hc-tree-branch" : " hc-tree-root-body"}`,
      hidden: collapsed,
      dataset: { depth: String(depth) }
    });
    if (!items || !items.length) {
      if (depth > 0) body.append(el("div", { class: "hc-hint hc-tree-empty", text: t("side.emptyFolder") }));
      return body;
    }
    const folders = items.filter((item) => item.kind === "folder");
    const requests = items.filter((item) => item.kind !== "folder");
    folders.forEach((item) => body.append(renderFolder(collection, item, depth)));
    requests.forEach((item) => body.append(renderSavedRequest(collection, item, depth)));
    return body;
  }

  function renderFolder(collection, folder, depth) {
    const count = store.countRequests(folder.items);
    const group = el("div", {
      class: "hc-side-group hc-tree-folder",
      dataset: { nodeId: folder.id, kind: "folder", depth: String(depth) }
    });
    const head = el("div", {
      class: "hc-tree-row hc-tree-folder-row",
      "aria-expanded": folder.collapsed ? "false" : "true",
      title: folder.name,
      dataset: {
        dropKind: "folder",
        collectionId: collection.id,
        nodeId: folder.id
      }
    }, [
      el("span", {
        class: `hc-tree-twist${folder.collapsed ? "" : " is-open"}`,
        "aria-hidden": "true"
      }),
      el("span", { class: "hc-folder-icon", "aria-hidden": "true" }),
      el("span", { class: "hc-grow hc-list-title", text: folder.name }),
      el("span", { class: "hc-count", text: count ? `(${count})` : "" })
    ]);
    head.addEventListener("contextmenu", (event) => openContextMenu(event, folderMenu(collection, folder)));
    head.addEventListener("click", () => {
      if (dragMoved) return;
      store.toggleCollapsed(folder.id);
    });
    wireDragSource(head, { id: folder.id, kind: "folder", collectionId: collection.id });
    group.append(head);
    group.append(renderItemList(collection, folder.items, !!folder.collapsed, depth + 1));
    return group;
  }

  function renderSavedRequest(collection, saved, depth) {
    const active = store.activeTab() && store.activeTab().savedRequestId === saved.id;
    const path = requestPath(saved.url);
    const label = path || saved.name || shortMethod(saved.method);
    const item = el("div", {
      class: `hc-tree-row hc-tree-request-row${active ? " is-active" : ""}`,
      title: saved.name && path ? `${saved.name}\n${saved.url || path}` : (saved.url || saved.name || ""),
      dataset: {
        nodeId: saved.id,
        kind: "request",
        depth: String(depth),
        dropKind: "request",
        collectionId: collection.id
      }
    }, [
      el("span", { class: "hc-tree-twist is-leaf", "aria-hidden": "true" }),
      el("span", { class: `hc-method-badge m-${saved.method}`, text: shortMethod(saved.method) }),
      el("span", { class: "hc-grow hc-list-title", text: label })
    ]);
    item.addEventListener("contextmenu", (event) => openContextMenu(event, requestMenu(collection, saved)));
    item.addEventListener("click", () => {
      if (dragMoved) return;
      store.openSavedRequest(collection.id, saved.id);
      HC.viewRequest.render();
      HC.viewResponse.render();
    });
    wireDragSource(item, { id: saved.id, kind: "request", collectionId: collection.id });
    return item;
  }

  function requestPath(url) {
    if (!url) return "";
    let text = String(url).trim();
    text = text.replace(/^\{\{\s*[^}]+\s*\}\}/, "");
    try {
      if (/^https?:\/\//i.test(text)) {
        const parsed = new URL(text);
        return `${parsed.pathname || "/"}${parsed.search || ""}`;
      }
    } catch (error) { /* keep text */ }
    const bare = text.split("?")[0];
    if (!bare) return "";
    return bare.startsWith("/") ? bare : `/${bare}`;
  }

  function shortMethod(method) {
    const text = String(method || "GET").toUpperCase();
    if (text === "DELETE") return "DEL";
    if (text === "OPTIONS") return "OPT";
    return text;
  }

  async function promptFolder(collectionId, parentId) {
    const name = await util.promptDialog({ title: t("dialog.newSubcollectionTitle"), label: t("dialog.name") });
    if (name) store.createFolder(collectionId, parentId, name);
  }

  async function promptNewRequest(collectionId, folderId) {
    const name = await util.promptDialog({
      title: t("action.newRequest"),
      label: t("dialog.name"),
      value: t("tab.untitled")
    });
    if (!name) return;
    const tab = store.createTab({ name, collectionId, folderId: folderId || "" });
    store.saveRequestTo(collectionId, tab, name, folderId || "");
    HC.viewRequest.render();
    HC.viewResponse.render();
  }

  function setCollapsedDeep(items, collapsed) {
    (items || []).forEach((item) => {
      if (item.kind !== "folder") return;
      item.collapsed = collapsed;
      setCollapsedDeep(item.items, collapsed);
    });
  }

  function refreshTree() {
    store.persist();
    store.emit("sidebar");
  }

  function duplicateSavedRequest(collection, saved) {
    store.openSavedRequest(collection.id, saved.id);
    const tab = store.activeTab();
    if (!tab) return;
    tab.savedRequestId = "";
    tab.collectionId = "";
    tab.folderId = "";
    tab.dirty = true;
    HC.viewRequest.render();
    HC.viewResponse.render();
    util.toast(t("toast.duplicated"));
  }

  async function copyText(text, okKey) {
    const value = String(text || "").trim();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      util.toast(t(okKey || "toast.copied"));
    } catch (error) {
      util.toast(String(error && error.message || error));
    }
  }

  function collectionMenu(collection) {
    return [
      { label: t("action.newRequest"), onClick: () => promptNewRequest(collection.id, "") },
      { label: t("action.newFolder"), onClick: () => promptFolder(collection.id, "") },
      { separator: true },
      { label: t("action.expandAll"), onClick: () => {
        collection.collapsed = false;
        setCollapsedDeep(collection.items, false);
        refreshTree();
      } },
      { label: t("action.collapseAll"), onClick: () => {
        collection.collapsed = false;
        setCollapsedDeep(collection.items, true);
        refreshTree();
      } },
      { separator: true },
      { label: t("action.rename"), onClick: async () => {
        const name = await util.promptDialog({ title: t("dialog.renameTitle"), value: collection.name });
        if (name) store.renameCollection(collection.id, name);
      } },
      { label: t("action.export"), onClick: () => openExportDialog(collection) },
      { separator: true },
      { label: t("action.delete"), danger: true, onClick: () => confirmDeleteCollection(collection) }
    ];
  }

  function folderMenu(collection, folder) {
    return [
      { label: t("action.newRequest"), onClick: () => promptNewRequest(collection.id, folder.id) },
      { label: t("action.newFolder"), onClick: () => promptFolder(collection.id, folder.id) },
      { separator: true },
      { label: t("action.expand"), onClick: () => {
        folder.collapsed = false;
        refreshTree();
      } },
      { label: t("action.collapse"), onClick: () => {
        folder.collapsed = true;
        refreshTree();
      } },
      { label: t("action.expandAll"), onClick: () => {
        folder.collapsed = false;
        setCollapsedDeep(folder.items, false);
        refreshTree();
      } },
      { label: t("action.collapseAll"), onClick: () => {
        folder.collapsed = true;
        setCollapsedDeep(folder.items, true);
        refreshTree();
      } },
      { separator: true },
      { label: t("action.rename"), onClick: async () => {
        const name = await util.promptDialog({ title: t("dialog.renameTitle"), value: folder.name });
        if (name) store.renameFolder(folder.id, name);
      } },
      { label: t("action.move"), onClick: () => openMoveDialog(folder, collection.id) },
      { separator: true },
      { label: t("action.delete"), danger: true, onClick: () => confirmDeleteFolder(folder) }
    ];
  }

  function requestMenu(collection, saved) {
    return [
      { label: t("action.open"), onClick: () => {
        store.openSavedRequest(collection.id, saved.id);
        HC.viewRequest.render();
        HC.viewResponse.render();
      } },
      { label: t("action.duplicate"), onClick: () => duplicateSavedRequest(collection, saved) },
      { separator: true },
      { label: t("action.copyPath"), onClick: () => copyText(requestPath(saved.url) || saved.url || saved.name, "toast.copied") },
      { label: t("action.copyCurl"), onClick: () => {
        try {
          const base = store.emptyRequest();
          const draft = Object.assign({}, base, saved, {
            body: Object.assign({}, base.body, saved.body || {}),
            auth: Object.assign({}, base.auth, saved.auth || {}),
            options: Object.assign({}, base.options, saved.options || {}),
            headers: saved.headers || [],
            params: saved.params || []
          });
          const command = HC.curl.generateCurl(draft, { resolve: (value) => store.resolve(value) });
          copyText(command, "toast.copied");
        } catch (error) {
          util.toast(String(error && error.message || error));
        }
      } },
      { separator: true },
      { label: t("action.move"), onClick: () => openMoveDialog(saved, collection.id) },
      { separator: true },
      { label: t("action.delete"), danger: true, onClick: async () => {
        if (await util.confirmDialog({ title: t("dialog.deleteTitle"), message: t("dialog.deleteMessage", { name: saved.name }) })) {
          store.deleteSavedRequest(collection.id, saved.id);
          util.toast(t("toast.deleted"));
        }
      } }
    ];
  }

  let contextMenuNode = null;

  function closeContextMenu() {
    if (contextMenuNode) {
      contextMenuNode.remove();
      contextMenuNode = null;
    }
  }

  function openContextMenu(event, items) {
    event.preventDefault();
    event.stopPropagation();
    closeContextMenu();
    const menu = el("div", { class: "hc-context-menu", id: "hc-context-menu" });
    items.forEach((item) => {
      if (item.separator) {
        menu.append(el("div", { class: "hc-context-sep" }));
        return;
      }
      const btn = el("button", {
        type: "button",
        class: `hc-context-item${item.danger ? " is-danger" : ""}${item.disabled ? " is-disabled" : ""}`,
        text: item.label,
        disabled: item.disabled ? "true" : undefined
      });
      btn.addEventListener("click", (clickEvent) => {
        clickEvent.stopPropagation();
        if (item.disabled) return;
        closeContextMenu();
        item.onClick();
      });
      menu.append(btn);
    });
    document.body.append(menu);
    const width = 176;
    const left = Math.max(8, Math.min(event.clientX, window.innerWidth - width - 8));
    const top = Math.max(8, Math.min(event.clientY, window.innerHeight - (items.length * 30 + 16)));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    contextMenuNode = menu;
  }

  document.addEventListener("click", () => closeContextMenu());
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeContextMenu(); });

  async function confirmDeleteCollection(collection) {
    const counts = store.countTree(collection.items);
    const message = (counts.folders || counts.requests)
      ? t("dialog.deleteTreeMessage", { name: collection.name, folders: counts.folders, requests: counts.requests })
      : t("dialog.deleteMessage", { name: collection.name });
    if (await util.confirmDialog({ title: t("dialog.deleteTitle"), message })) {
      store.deleteCollection(collection.id);
      util.toast(t("toast.deleted"));
    }
  }

  async function confirmDeleteFolder(folder) {
    const counts = store.countTree(folder.items);
    const message = (counts.folders || counts.requests)
      ? t("dialog.deleteFolderMessage", { name: folder.name, folders: counts.folders, requests: counts.requests })
      : t("dialog.deleteMessage", { name: folder.name });
    if (await util.confirmDialog({
      title: t("dialog.deleteTitle"),
      message
    })) {
      store.deleteFolder(folder.id);
      util.toast(t("toast.deleted"));
    }
  }

  function openMoveDialog(node, collectionId) {
    const collectionSelect = el("select", { class: "hc-select hc-select-flat" });
    store.state.collections.forEach((collection) => {
      collectionSelect.append(el("option", { value: collection.id, text: collection.name }));
    });
    collectionSelect.value = collectionId || (store.state.collections[0] || {}).id || "";
    const folderSelect = el("select", { class: "hc-select hc-select-flat" });
    const refill = () => {
      util.clear(folderSelect);
      folderSelect.append(el("option", { value: "", text: t("dialog.collectionRoot") }));
      store.listFolders(collectionSelect.value).forEach((folder) => {
        if (node.kind === "folder" && (folder.id === node.id || store.folderContains(node.id, folder.id))) return;
        folderSelect.append(el("option", { value: folder.id, text: folder.path }));
      });
    };
    refill();
    collectionSelect.addEventListener("change", refill);
    const located = store.locate(node.id);
    if (located && located.parent && located.collection.id === collectionSelect.value) folderSelect.value = located.parent.id;
    util.openModal({
      title: t("dialog.moveTitle"),
      render: (body) => {
        body.append(el("div", { class: "hc-hint", text: node.name }));
        body.append(el("label", { class: "hc-field" }, [
          el("span", { class: "hc-field-label", text: t("dialog.collection") }), collectionSelect
        ]));
        body.append(el("label", { class: "hc-field" }, [
          el("span", { class: "hc-field-label", text: t("dialog.moveTarget") }), folderSelect
        ]));
      },
      actions: [
        { label: t("action.cancel2"), onClick: (api) => api.close() },
        {
          label: t("action.move"), kind: "primary",
          onClick: (api) => {
            const ok = store.moveItem(node.id, collectionSelect.value, folderSelect.value);
            util.toast(ok ? t("toast.moved") : t("toast.moveFailed"), ok ? "success" : "error");
            api.close();
          }
        }
      ]
    });
  }

  /* --------------------------------------------------------------- history */

  function historyDisplayPath(url) {
    const raw = String(url || "");
    if (!raw) return "/";
    try {
      const parsed = new URL(raw);
      const path = `${parsed.host}${parsed.pathname}${parsed.search || ""}`;
      return path || raw;
    } catch (error) {
      return raw;
    }
  }

  function historyEntryUrls(entry) {
    const resolved = store.historyResolvedUrl(entry);
    const template = String(entry.url || "").trim();
    return {
      resolved,
      template,
      display: historyDisplayPath(resolved || template),
      title: template && template !== resolved ? `${resolved}\n${template}` : (resolved || template)
    };
  }

  function historyDayKey(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "other";
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startOfThat = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.round((startOfToday - startOfThat) / 86400000);
    if (diffDays === 0) return "today";
    if (diffDays === 1) return "yesterday";
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function historyDayLabel(key, sampleIso) {
    if (key === "today") return t("side.historyToday");
    if (key === "yesterday") return t("side.historyYesterday");
    try {
      return new Date(sampleIso).toLocaleDateString(undefined, { month: "short", day: "numeric", weekday: "short" });
    } catch (error) {
      return key;
    }
  }

  function renderHistory(host) {
    if (!store.state.history.length) {
      host.append(el("div", { class: "hc-empty", text: t("side.emptyHistory") }));
      return;
    }

    const limit = store.historyLimit();
    const filtered = [];
    store.state.history.forEach((entry) => {
      const urls = historyEntryUrls(entry);
      if (
        !matchesFilter(urls.display)
        && !matchesFilter(urls.resolved)
        && !matchesFilter(urls.template)
        && !matchesFilter(entry.method)
        && !matchesFilter(entry.name)
      ) {
        return;
      }
      filtered.push({ entry, urls });
    });

    if (!filtered.length) {
      host.append(el("div", { class: "hc-empty hc-empty-sm", text: t("side.searchEmpty") }));
      return;
    }

    const wrap = el("div", { class: "hc-hist" });
    wrap.append(el("div", {
      class: "hc-hist-cap",
      text: t("side.historyCap", { count: store.state.history.length, limit })
    }));

    const groups = [];
    const groupMap = new Map();
    filtered.forEach((row) => {
      const key = historyDayKey(row.entry.at);
      let group = groupMap.get(key);
      if (!group) {
        group = { key, label: historyDayLabel(key, row.entry.at), rows: [] };
        groupMap.set(key, group);
        groups.push(group);
      }
      group.rows.push(row);
    });

    groups.forEach((group) => {
      const section = el("section", { class: "hc-hist-group" });
      section.append(el("div", { class: "hc-hist-day", text: group.label }));
      const list = el("div", { class: "hc-hist-list" });
      group.rows.forEach(({ entry, urls }) => {
        const statusText = entry.ok && entry.status ? String(entry.status) : "ERR";
        const statusCls = util.statusClass(entry.status, entry.ok);
        const timeText = (() => {
          try { return new Date(entry.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
          catch (error) { return ""; }
        })();
        const item = el("button", {
          class: "hc-hist-item",
          type: "button",
          title: urls.title
        }, [
          el("span", { class: `hc-method-badge m-${entry.method || "GET"}`, text: entry.method || "GET" }),
          el("span", { class: "hc-hist-body" }, [
            el("span", { class: "hc-hist-path", text: urls.display }),
            el("span", { class: "hc-hist-meta" }, [
              el("span", { text: timeText }),
              el("span", { class: "hc-hist-dot", "aria-hidden": "true", text: "·" }),
              el("span", { class: "hc-hist-dur", text: util.formatDuration(entry.durationMs) })
            ])
          ]),
          el("span", { class: `hc-hist-code ${statusCls}`, text: statusText })
        ]);
        item.addEventListener("click", () => {
          store.openHistoryEntry(entry.id);
          HC.viewRequest.render();
          HC.viewResponse.render();
        });
        list.append(item);
      });
      section.append(list);
      wrap.append(section);
    });

    host.append(wrap);
  }

  /* ---------------------------------------------------------- environments */

  let envDragId = "";

  function renderEnvironments(host) {
    if (!store.state.environments.length) {
      host.append(el("div", { class: "hc-empty", text: t("side.emptyEnvironments") }));
      return;
    }
    const filtering = !!filterText(sideFilter).trim();
    const list = el("div", { class: `hc-env-list${filtering ? " is-filtering" : ""}` });
    let shown = 0;
    const envs = store.state.environments;
    envs.forEach((environment, index) => {
      if (!matchesFilter(environment.name)) return;
      shown += 1;
      const active = environment.id === store.state.activeEnvironmentId;
      const item = el("div", {
        class: `hc-env-row${active ? " is-active" : ""}`,
        title: environment.name,
        role: "option",
        "aria-selected": active ? "true" : "false",
        dataset: { envId: environment.id }
      });
      if (!filtering) {
        item.draggable = true;
        item.append(el("span", {
          class: "hc-env-drag",
          title: t("action.dragReorder"),
          "aria-hidden": "true",
          text: "⋮⋮"
        }));
      }
      item.append(
        el("span", { class: `hc-env-dot${active ? " is-on" : ""}`, "aria-hidden": "true" }),
        el("span", { class: "hc-grow hc-list-title", text: environment.name })
      );
      const actions = el("span", { class: "hc-env-row-actions" });
      const up = el("button", {
        type: "button",
        class: "hc-env-move",
        text: "↑",
        title: t("action.moveUp"),
        disabled: index <= 0 ? "true" : undefined
      });
      const down = el("button", {
        type: "button",
        class: "hc-env-move",
        text: "↓",
        title: t("action.moveDown"),
        disabled: index >= envs.length - 1 ? "true" : undefined
      });
      up.addEventListener("click", (event) => {
        event.stopPropagation();
        store.moveEnvironmentBy(environment.id, -1);
      });
      down.addEventListener("click", (event) => {
        event.stopPropagation();
        store.moveEnvironmentBy(environment.id, 1);
      });
      actions.append(up, down);
      item.append(actions);

      item.addEventListener("contextmenu", (event) => openContextMenu(event, environmentMenu(environment, index)));
      item.addEventListener("click", (event) => {
        if (event.target.closest(".hc-env-row-actions") || event.target.closest(".hc-env-drag")) return;
        if (HC.viewEnv && HC.viewEnv.openEnvironment) HC.viewEnv.openEnvironment(environment.id);
        else store.setActiveEnvironment(environment.id);
      });

      if (!filtering) wireEnvDrag(item, environment.id);
      list.append(item);
    });
    if (!shown) {
      host.append(el("div", { class: "hc-empty hc-empty-sm", text: t("side.searchEmpty") }));
      return;
    }
    host.append(list);
  }

  function clearEnvDropMarks() {
    util.$$(".hc-env-row").forEach((row) => {
      row.classList.remove("is-drop-before", "is-drop-after", "is-dragging");
    });
  }

  function wireEnvDrag(row, envId) {
    row.addEventListener("dragstart", (event) => {
      envDragId = envId;
      row.classList.add("is-dragging");
      try {
        event.dataTransfer.setData("text/plain", envId);
        event.dataTransfer.effectAllowed = "move";
      } catch (error) { /* ignore */ }
    });
    row.addEventListener("dragend", () => {
      envDragId = "";
      clearEnvDropMarks();
    });
    row.addEventListener("dragover", (event) => {
      if (!envDragId || envDragId === envId) return;
      event.preventDefault();
      try { event.dataTransfer.dropEffect = "move"; } catch (error) { /* ignore */ }
      const rect = row.getBoundingClientRect();
      const before = event.clientY < rect.top + rect.height / 2;
      row.classList.toggle("is-drop-before", before);
      row.classList.toggle("is-drop-after", !before);
      util.$$(".hc-env-row").forEach((other) => {
        if (other === row) return;
        other.classList.remove("is-drop-before", "is-drop-after");
      });
    });
    row.addEventListener("dragleave", (event) => {
      if (!row.contains(event.relatedTarget)) {
        row.classList.remove("is-drop-before", "is-drop-after");
      }
    });
    row.addEventListener("drop", (event) => {
      event.preventDefault();
      const dragId = envDragId || (event.dataTransfer && event.dataTransfer.getData("text/plain"));
      if (!dragId || dragId === envId) {
        clearEnvDropMarks();
        return;
      }
      const rect = row.getBoundingClientRect();
      const before = event.clientY < rect.top + rect.height / 2;
      const envs = store.state.environments;
      const targetIndex = envs.findIndex((item) => item.id === envId);
      let beforeId = "";
      if (before) beforeId = envId;
      else if (targetIndex >= 0 && targetIndex < envs.length - 1) beforeId = envs[targetIndex + 1].id;
      else beforeId = "";
      store.reorderEnvironment(dragId, beforeId);
      envDragId = "";
      clearEnvDropMarks();
    });
  }

  function environmentMenu(environment, index) {
    const last = store.state.environments.length - 1;
    return [
      { label: t("action.rename"), onClick: async () => {
        const name = await util.promptDialog({ title: t("dialog.renameTitle"), value: environment.name });
        if (name) { environment.name = name; store.persist(); store.emit("environments"); }
      } },
      { label: t("action.moveUp"), disabled: index <= 0, onClick: () => {
        store.moveEnvironmentBy(environment.id, -1);
      } },
      { label: t("action.moveDown"), disabled: index >= last, onClick: () => {
        store.moveEnvironmentBy(environment.id, 1);
      } },
      { separator: true },
      { label: t("action.delete"), danger: true, onClick: async () => {
        if (await util.confirmDialog({ title: t("dialog.deleteTitle"), message: t("dialog.deleteMessage", { name: environment.name }) })) {
          store.deleteEnvironment(environment.id);
        }
      } }
    ];
  }

  /* --------------------------------------------------------------- dialogs */

  function openImportDialog() {
    const textarea = el("textarea", {
      class: "hc-textarea",
      placeholder: t("side.importPlaceholder"),
      spellcheck: "false"
    });
    const fileInput = el("input", {
      type: "file",
      accept: ".json,application/json,text/json",
      style: { display: "none" }
    });
    const fileRow = el("div", { class: "hc-import-file-row" }, [
      el("button", {
        class: "hc-btn hc-btn-sm", type: "button", text: t("side.importPickFile"),
        on: { click: () => fileInput.click() }
      }),
      el("span", { class: "hc-hint hc-import-file-name", text: t("side.importOrPaste") })
    ]);
    const nameHint = fileRow.querySelector(".hc-import-file-name");
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        textarea.value = text;
        if (nameHint) nameHint.textContent = file.name;
      } catch (error) {
        util.toast(t("toast.importFailed", { message: error.message }), "error");
      }
    });
    util.openModal({
      title: t("action.importAll"),
      render: (body) => {
        body.append(el("div", { class: "hc-hint", text: t("side.importHint") }));
        body.append(fileRow);
        body.append(fileInput);
        body.append(textarea);
      },
      actions: [
        { label: t("action.cancel2"), onClick: (api) => api.close() },
        {
          label: t("action.importAll"), kind: "primary",
          onClick: (api) => {
            const text = textarea.value.trim();
            if (!text) {
              util.toast(t("toast.importEmpty"), "error");
              return;
            }
            if (text.startsWith("{") || text.startsWith("[")) {
              importJson(text);
              api.close();
            } else {
              util.toast(t("toast.importJsonOnly"), "error");
            }
          }
        }
      ]
    });
  }

  function importJson(text) {
    try {
      const document = JSON.parse(text);
      if (HC.apipost && HC.apipost.isApipostDocument(document)) {
        importApipost(document);
        return;
      }
      const collections = Array.isArray(document) ? document : (document.collections || [document]);
      let count = 0;
      collections.forEach((collection) => {
        if (!collection || typeof collection !== "object") return;
        const target = store.importCollection(collection);
        if (!target) return;
        count += store.countRequests(target.items);
      });
      store.persist();
      store.emit("sidebar");
      util.toast(t("toast.imported", { count }), "success");
    } catch (error) {
      util.toast(t("toast.importFailed", { message: error.message }), "error");
    }
  }

  function importApipost(document) {
    const converted = HC.apipost.convert(document);
    if (!converted) {
      util.toast(t("toast.importFailed", { message: "empty ApiPost document" }), "error");
      return;
    }
    const envList = converted.environments || [];
    const requestCount = converted.stats ? converted.stats.requests : 0;
    const folderCount = converted.stats ? converted.stats.folders : 0;
    if (!requestCount && !folderCount && !envList.length) {
      util.toast(t("toast.importEmpty"), "error");
      return;
    }

    let target = null;
    let count = 0;
    let folders = 0;
    if (requestCount || folderCount) {
      const projectKey = converted.collection.projectKey || converted.collection.name;
      if (store.removeCollectionsByProject) {
        store.removeCollectionsByProject(projectKey);
        // Clean legacy duplicate wrappers from earlier builds.
        store.state.collections = store.state.collections.filter((collection) => {
          if (collection.name === "ApiPost 导入") return false;
          if (collection.projectKey && collection.projectKey === projectKey) return false;
          // Legacy wrappers: same display name, no projectKey yet.
          if (collection.source === "apipost" && !collection.projectKey && collection.name === projectKey) return false;
          return true;
        });
      }
      target = store.importCollection(converted.collection);
      count = target ? store.countRequests(target.items) : 0;
      folders = target && HC.apipost.countFolders ? HC.apipost.countFolders(target.items) : 0;
      if (target) target.collapsed = false;
    }

    let envCount = 0;
    let activeEnvId = "";
    envList.forEach((environment) => {
      const vars = environment.variables && environment.variables.length
        ? environment.variables
        : [{ key: "", value: "", enabled: true }];
      const existing = store.state.environments.find((item) =>
        item.name === environment.name
        || (environment.projectKey && item.projectKey === environment.projectKey && item.name === environment.name)
      );
      if (existing) {
        existing.variables = vars;
        existing.source = "apipost";
        if (environment.projectKey) existing.projectKey = environment.projectKey;
        activeEnvId = existing.id;
      } else {
        const created = store.createEnvironment(environment.name);
        created.variables = vars;
        created.source = "apipost";
        if (environment.projectKey) created.projectKey = environment.projectKey;
        activeEnvId = created.id;
      }
      envCount += 1;
    });
    if (activeEnvId) store.setActiveEnvironment(activeEnvId);

    // Prefer environments tab when this paste was env-only.
    if (!count && !folders && envCount) store.state.sideView = "environments";
    else if (count || folders) store.state.sideView = "collections";

    store.persist();
    store.emit("sidebar");
    store.emit("environments");
    HC.viewSidebar.render();
    if (HC.viewEnv) HC.viewEnv.syncLayout();
    util.toast(t("toast.importedApipost", { count, envs: envCount, folders }), "success");
  }

  function openExportDialog(collection) {
    const payload = JSON.stringify({ collections: [collection] }, null, 2);
    const textarea = el("textarea", { class: "hc-textarea", value: payload, spellcheck: "false" });
    util.openModal({
      title: t("dialog.exportTitle"),
      render: (body) => {
        body.append(el("div", { class: "hc-hint", text: t("dialog.exportHint") }));
        body.append(textarea);
      },
      actions: [
        { label: t("action.cancel2"), onClick: (api) => api.close() },
        {
          label: t("action.copy"), kind: "primary",
          onClick: async (api) => {
            const ok = await HC.bridge.copy(textarea.value);
            util.toast(ok ? t("toast.copied") : t("toast.copyFailed"), ok ? "success" : "error");
            api.close();
          }
        }
      ]
    });
  }

  window.HC.viewSidebar = {
    render,
    openImportDialog,
    openExportDialog,
    clearFilter() { sideFilter = ""; }
  };
})();
