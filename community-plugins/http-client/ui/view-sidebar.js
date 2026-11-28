/* Sidebar: collections, history and environment/variable management. */

(function () {
  const util = HC.util;
  const store = HC.store;
  const t = (key, params) => HC.i18n.t(key, params);
  const el = util.el;

  let sideFilter = "";
  /** @type {{ collectionId: string, parentId: string } | null} */
  let inlineFolderDraft = null;
  /** @type {string} request id currently renamed inline */
  let inlineRenameRequestId = "";
  let inlineFocus = false;

  function render() {
    renderActions();
    const host = util.clear(util.$("#sidebar-body"));
    const view = store.state.sideView;
    if (view === "collections") renderCollections(host);
    else if (view === "history") renderHistory(host);
    else renderEnvironments(host);
    if (inlineFocus) {
      inlineFocus = false;
      requestAnimationFrame(() => {
        const input = util.$(".hc-tree-inline-input");
        if (input) {
          input.focus();
          input.select();
        }
      });
    }
  }

  /** Update tree highlight without rebuilding the sidebar (keeps scroll). */
  function syncActive(opts) {
    if (opts && opts.fromTab && store.syncTreeFocusFromTab) {
      store.syncTreeFocusFromTab(store.activeTab());
    }
    const focus = store.treeFocus ? store.treeFocus() : { collectionId: "", folderId: "", requestId: "" };
    const requestId = focus.requestId || "";
    util.$$(".hc-tree-request-row").forEach((row) => {
      row.classList.toggle("is-active", !!requestId && row.dataset.nodeId === requestId);
    });
    util.$$(".hc-tree-folder-row").forEach((row) => {
      row.classList.toggle("is-active", !requestId && !!focus.folderId && row.dataset.nodeId === focus.folderId);
    });
    util.$$(".hc-tree-root-row").forEach((row) => {
      row.classList.toggle(
        "is-active",
        !requestId && !focus.folderId && !!focus.collectionId && row.dataset.nodeId === focus.collectionId
      );
    });
  }

  function startInlineFolder(collectionId, parentId) {
    if (!collectionId) return;
    store.state.sideView = "collections";
    inlineRenameRequestId = "";
    const collection = store.state.collections.find((item) => item.id === collectionId);
    if (collection) collection.collapsed = false;
    if (parentId) {
      const located = store.locate(parentId);
      if (located && located.item.kind === "folder") located.item.collapsed = false;
    }
    inlineFolderDraft = { collectionId, parentId: parentId || "" };
    inlineFocus = true;
    store.persist();
    store.emit("sidebar");
    render();
  }

  function startInlineRenameRequest(requestId) {
    if (!requestId) return;
    inlineFolderDraft = null;
    inlineRenameRequestId = requestId;
    inlineFocus = true;
    render();
  }

  function commitInlineRenameRequest(requestId, name) {
    inlineRenameRequestId = "";
    const trimmed = String(name || "").trim();
    const located = store.locate(requestId);
    if (!located || located.item.kind !== "request") {
      render();
      return;
    }
    if (trimmed) {
      located.item.name = trimmed;
      const tab = store.state.tabs.find((item) => item.savedRequestId === requestId);
      if (tab) tab.name = trimmed;
      store.persist();
      store.emit("sidebar");
      store.emit("tabs");
    }
    render();
  }

  function cancelInlineRenameRequest() {
    if (!inlineRenameRequestId) return;
    inlineRenameRequestId = "";
    render();
  }

  function cancelInlineFolder() {
    if (!inlineFolderDraft) return;
    inlineFolderDraft = null;
    render();
  }

  function commitInlineFolder(name) {
    if (!inlineFolderDraft) return;
    const draft = inlineFolderDraft;
    const trimmed = String(name || "").trim();
    inlineFolderDraft = null;
    if (!trimmed) {
      render();
      return;
    }
    store.createFolder(draft.collectionId, draft.parentId, trimmed);
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
    let searchTimer = 0;
    search.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        sideFilter = search.value || "";
        const body = util.$("#sidebar-body");
        if (!body) return;
        const scrollTop = body.scrollTop;
        util.clear(body);
        if (view === "collections") renderCollections(body);
        else if (view === "history") renderHistory(body);
        else renderEnvironments(body);
        body.scrollTop = scrollTop;
      }, 150);
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

  function treeTwist(open, leaf, onToggle) {
    const node = el("span", {
      class: `hc-tree-twist${leaf ? " is-leaf" : ""}${!leaf && open ? " is-open" : ""}`,
      role: leaf ? undefined : "button",
      title: leaf ? undefined : t("action.expand"),
      "aria-hidden": leaf ? "true" : undefined
    });
    if (!leaf && typeof onToggle === "function") {
      // Keep twist out of row drag/select — otherwise pointer capture eats the click.
      node.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
      });
      node.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle(event);
      });
    }
    return node;
  }

  function treeGlyph(kind, method) {
    const node = el("span", {
      class: `hc-tree-glyph is-${kind}${method ? ` m-${method}` : ""}`,
      "aria-hidden": "true"
    });
    if (kind === "folder") {
      node.innerHTML = "<svg viewBox=\"0 0 16 16\" width=\"14\" height=\"14\"><path fill=\"currentColor\" d=\"M1.75 3.5A1.75 1.75 0 0 1 3.5 1.75h2.38c.46 0 .9.18 1.22.51L8.28 3.5h4.22A1.75 1.75 0 0 1 14.25 5.25v7A1.75 1.75 0 0 1 12.5 14H3.5A1.75 1.75 0 0 1 1.75 12.25v-8.75z\"/></svg>";
    } else if (kind === "collection") {
      node.innerHTML = "<svg viewBox=\"0 0 16 16\" width=\"14\" height=\"14\"><path fill=\"currentColor\" d=\"M2.5 2.75A.75.75 0 0 1 3.25 2h9.5a.75.75 0 0 1 0 1.5h-9.5A.75.75 0 0 1 2.5 2.75zm0 3.5A.75.75 0 0 1 3.25 5.5h9.5a.75.75 0 0 1 0 1.5h-9.5A.75.75 0 0 1 2.5 6.25zm0 3.5A.75.75 0 0 1 3.25 9h9.5a.75.75 0 0 1 0 1.5h-9.5a.75.75 0 0 1-.75-.75zm0 3.5a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5a.75.75 0 0 1-.75-.75z\"/></svg>";
    } else if (kind === "method") {
      node.textContent = shortMethod(method);
    }
    return node;
  }

  function renderInlineFolderRow(depth) {
    const row = el("div", {
      class: "hc-tree-row hc-tree-inline-row",
      style: { "--hc-depth": String(depth) }
    }, [
      treeTwist(true, false),
      treeGlyph("folder"),
      el("input", {
        class: "hc-tree-inline-input",
        type: "text",
        value: t("misc.untitledFolder"),
        spellcheck: "false",
        autocomplete: "off",
        "aria-label": t("action.newFolder")
      })
    ]);
    const input = row.querySelector(".hc-tree-inline-input");
    let done = false;
    const finish = (commit) => {
      if (done) return;
      done = true;
      if (commit) commitInlineFolder(input.value);
      else cancelInlineFolder();
    };
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        finish(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        finish(false);
      }
      event.stopPropagation();
    });
    input.addEventListener("blur", () => finish(!!String(input.value || "").trim()));
    input.addEventListener("click", (event) => event.stopPropagation());
    return row;
  }

  function renderCollection(collection) {
    const count = store.countRequests(collection.items);
    const isApipost = collection.source === "apipost";
    const group = el("div", {
      class: `hc-side-group hc-collection${isApipost ? " is-apipost" : ""}`,
      dataset: { nodeId: collection.id, kind: "collection" }
    });
    const focus = store.treeFocus ? store.treeFocus() : {};
    const selected = !focus.requestId && !focus.folderId && focus.collectionId === collection.id;
    const head = el("div", {
      class: `hc-tree-row hc-tree-root-row${isApipost ? " is-apipost" : ""}${selected ? " is-active" : ""}`,
      "aria-expanded": collection.collapsed ? "false" : "true",
      title: collection.name,
      style: { "--hc-depth": "0" },
      dataset: {
        dropKind: "collection",
        collectionId: collection.id,
        nodeId: collection.id
      }
    }, [
      treeTwist(!collection.collapsed, false, () => store.toggleCollapsed(collection.id)),
      treeGlyph("collection"),
      el("span", { class: "hc-grow hc-list-title", text: isApipost ? t("side.allApis") : collection.name }),
      el("span", { class: "hc-count", text: count ? String(count) : "" })
    ]);
    head.addEventListener("contextmenu", (event) => openContextMenu(event, collectionMenu(collection)));
    head.addEventListener("click", (event) => {
      if (event.target && event.target.closest && event.target.closest(".hc-tree-twist")) return;
      store.setTreeFocus(collection.id, "", "");
      if (event.detail === 2) {
        store.toggleCollapsed(collection.id);
        return;
      }
      // Single click selects; expand if currently collapsed.
      if (collection.collapsed) store.toggleCollapsed(collection.id);
      else syncActive();
    });
    group.append(head);
    // Children start at depth 1 so the first folder level is clearly indented under the root.
    group.append(renderItemList(collection, collection.items, !!collection.collapsed, 1, ""));
    return group;
  }

  function renderItemList(collection, items, collapsed, depth, parentId) {
    const body = el("div", {
      class: `hc-side-group-body${depth > 0 ? " hc-tree-branch" : " hc-tree-root-body"}`,
      hidden: collapsed,
      dataset: { depth: String(depth) }
    });
    const showDraft = inlineFolderDraft
      && inlineFolderDraft.collectionId === collection.id
      && (inlineFolderDraft.parentId || "") === (parentId || "");
    if (showDraft) body.append(renderInlineFolderRow(depth));

    if (!items || !items.length) {
      if (depth > 0 && !showDraft) {
        body.append(el("div", {
          class: "hc-hint hc-tree-empty",
          style: { "--hc-depth": String(depth) },
          text: t("side.emptyFolder")
        }));
      }
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
    const focus = store.treeFocus ? store.treeFocus() : {};
    const selected = !focus.requestId && focus.folderId === folder.id;
    const group = el("div", {
      class: "hc-side-group hc-tree-folder",
      dataset: { nodeId: folder.id, kind: "folder", depth: String(depth) }
    });
    const head = el("div", {
      class: `hc-tree-row hc-tree-folder-row${selected ? " is-active" : ""}`,
      "aria-expanded": folder.collapsed ? "false" : "true",
      title: folder.name,
      style: { "--hc-depth": String(depth) },
      dataset: {
        dropKind: "folder",
        collectionId: collection.id,
        nodeId: folder.id
      }
    }, [
      treeTwist(!folder.collapsed, false, () => store.toggleCollapsed(folder.id)),
      treeGlyph("folder"),
      el("span", { class: "hc-grow hc-list-title", text: folder.name }),
      el("span", { class: "hc-count", text: count ? String(count) : "" })
    ]);
    head.addEventListener("contextmenu", (event) => openContextMenu(event, folderMenu(collection, folder)));
    head.addEventListener("click", (event) => {
      if (dragMoved) return;
      if (event.target && event.target.closest && event.target.closest(".hc-tree-twist")) return;
      store.setTreeFocus(collection.id, folder.id, "");
      if (event.detail === 2) {
        store.toggleCollapsed(folder.id);
        return;
      }
      if (folder.collapsed) store.toggleCollapsed(folder.id);
      else syncActive();
    });
    wireDragSource(head, { id: folder.id, kind: "folder", collectionId: collection.id });
    group.append(head);
    group.append(renderItemList(collection, folder.items, !!folder.collapsed, depth + 1, folder.id));
    return group;
  }

  function renderSavedRequest(collection, saved, depth) {
    const focus = store.treeFocus ? store.treeFocus() : {};
    const active = focus.requestId
      ? focus.requestId === saved.id
      : !!(store.activeTab() && store.activeTab().savedRequestId === saved.id);
    const path = requestPath(saved.url);
    const untitled = t("tab.untitled");
    const named = String(saved.name || "").trim();
    // Prefer request name so the tree is readable; path stays in tooltip.
    const label = (named && named !== untitled) ? named : (path || named || shortMethod(saved.method));
    const renaming = inlineRenameRequestId === saved.id;
    const item = el("div", {
      class: `hc-tree-row hc-tree-request-row${active ? " is-active" : ""}${renaming ? " is-renaming" : ""}`,
      title: renaming ? "" : (named && path ? `${named}\n${saved.url || path}` : (saved.url || named || "")),
      style: { "--hc-depth": String(depth) },
      dataset: {
        nodeId: saved.id,
        kind: "request",
        depth: String(depth),
        dropKind: "request",
        collectionId: collection.id
      }
    }, [
      treeTwist(false, true),
      treeGlyph("method", saved.method)
    ]);
    if (renaming) {
      const input = el("input", {
        class: "hc-tree-inline-input",
        type: "text",
        value: named || untitled,
        spellcheck: "false",
        autocomplete: "off",
        "aria-label": t("action.rename")
      });
      let done = false;
      const finish = (commit) => {
        if (done) return;
        done = true;
        if (commit) commitInlineRenameRequest(saved.id, input.value);
        else cancelInlineRenameRequest();
      };
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          finish(true);
        } else if (event.key === "Escape") {
          event.preventDefault();
          finish(false);
        }
        event.stopPropagation();
      });
      input.addEventListener("blur", () => finish(true));
      input.addEventListener("click", (event) => event.stopPropagation());
      item.append(input);
      return item;
    }
    item.append(el("span", { class: "hc-grow hc-list-title", text: label }));
    item.addEventListener("contextmenu", (event) => openContextMenu(event, requestMenu(collection, saved)));
    item.addEventListener("click", () => {
      if (dragMoved) return;
      const parentId = (() => {
        const located = store.locate(saved.id);
        return located && located.parent ? located.parent.id : "";
      })();
      store.setTreeFocus(collection.id, parentId, saved.id);
      store.openSavedRequest(collection.id, saved.id);
      HC.viewRequest.render();
      HC.viewResponse.render();
      syncActive();
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

  function promptFolder(collectionId, parentId) {
    startInlineFolder(collectionId, parentId || "");
  }

  function promptNewRequest(collectionId, folderId) {
    let targetCollectionId = collectionId;
    if (!targetCollectionId) {
      const created = store.createCollection(t("misc.untitledCollection"));
      targetCollectionId = created.id;
    }
    store.state.sideView = "collections";
    const collection = store.state.collections.find((item) => item.id === targetCollectionId);
    if (collection) collection.collapsed = false;
    if (folderId) {
      const located = store.locate(folderId);
      if (located && located.item.kind === "folder") located.item.collapsed = false;
    }
    store.setTreeFocus(targetCollectionId, folderId || "");
    const name = t("tab.untitled");
    const tab = store.createTab({
      name,
      collectionId: targetCollectionId,
      folderId: folderId || ""
    });
    const saved = store.saveRequestTo(targetCollectionId, tab, name, folderId || "");
    HC.viewRequest.render();
    HC.viewResponse.render();
    startInlineRenameRequest(saved && saved.id ? saved.id : tab.savedRequestId);
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
    const clone = store.cloneSavedRequest(saved.id);
    if (!clone) return;
    HC.viewRequest.render();
    HC.viewResponse.render();
    util.toast(t("toast.cloned"));
    startInlineRenameRequest(clone.id);
  }

  function duplicateSavedAsTab(collection, saved) {
    store.openSavedRequest(collection.id, saved.id);
    const tab = store.activeTab();
    if (!tab) return;
    store.duplicateTab(tab.id);
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

  function shortcutKeys() {
    return (HC.shortcuts && HC.shortcuts.keys) || {};
  }

  function ensureOwnerAuth(owner) {
    if (!owner.auth) {
      owner.auth = { type: "none", username: "", password: "", token: "", key: "", value: "", in: "header" };
    }
    if (!Array.isArray(owner.headers)) owner.headers = [];
  }

  function openSharedSettings(owner, title) {
    ensureOwnerAuth(owner);
    const auth = Object.assign({
      type: "none", username: "", password: "", token: "", key: "", value: "", in: "header"
    }, owner.auth || {});
    const headers = JSON.parse(JSON.stringify(owner.headers || []));
    const params = JSON.parse(JSON.stringify(owner.params || []));
    const cookies = JSON.parse(JSON.stringify(owner.cookies || []));
    if (!headers.length || headers.every((row) => row.key)) headers.push(util.emptyRow());
    if (!params.length || params.every((row) => row.key)) params.push(util.emptyRow());
    if (!cookies.length || cookies.every((row) => row.key)) cookies.push(util.emptyRow());

    util.openModal({
      title: title || t("shared.title"),
      render: (body) => {
        body.append(el("div", { class: "hc-hint", text: t("shared.hint") }));
        body.append(el("div", { class: "hc-field-label", text: t("section.auth") }));
        const authFields = el("div", { class: "hc-form-grid", style: { marginTop: "8px" } });
        function rebuildAuthFields() {
          util.clear(authFields);
          const field = (labelKey, key, opts) => {
            authFields.append(el("span", { class: "hc-field-label", text: t(labelKey) }));
            const input = el("input", {
              class: "hc-input",
              type: (opts && opts.type) || "text",
              value: auth[key] || "",
              placeholder: (opts && opts.placeholder) || ""
            });
            input.addEventListener("input", () => { auth[key] = input.value; });
            authFields.append(input);
          };
          if (auth.type === "basic") {
            field("auth.username", "username");
            field("auth.password", "password", { type: "password" });
          } else if (auth.type === "bearer") {
            field("auth.token", "token", { type: "password", placeholder: "eyJhbGciOi..." });
          } else if (auth.type === "apikey") {
            field("auth.key", "key", { placeholder: "X-API-Key" });
            field("auth.value", "value", { type: "password" });
          } else {
            authFields.append(el("div", {
              class: "hc-hint",
              style: { gridColumn: "1 / -1" },
              text: t("shared.authNone")
            }));
          }
        }
        const authDd = util.createSelect({
          className: "hc-dd-block",
          value: auth.type || "none",
          items: [
            { value: "none", label: t("auth.none") },
            { value: "basic", label: t("auth.basic") },
            { value: "bearer", label: t("auth.bearer") },
            { value: "apikey", label: t("auth.apikey") }
          ],
          onChange: (value) => {
            auth.type = value;
            rebuildAuthFields();
          }
        });
        body.append(authDd.root);
        body.append(authFields);
        rebuildAuthFields();

        const sharedGroups = [
          { label: "section.headers", hint: "shared.headersHint", rows: headers },
          { label: "section.params", hint: "shared.paramsHint", rows: params },
          { label: "section.cookies", hint: "shared.cookiesHint", rows: cookies }
        ];
        sharedGroups.forEach((group) => {
          body.append(el("div", {
            class: "hc-field-label",
            style: { marginTop: "12px" },
            text: t(group.label)
          }));
          body.append(el("div", { class: "hc-hint", text: t(group.hint) }));
          const kvHost = el("div");
          body.append(kvHost);
          util.createKVEditor(kvHost, {
            rows: group.rows,
            onChange: () => { /* rows mutated in place */ }
          });
        });
      },
      actions: [
        { label: t("action.cancel2"), onClick: (api) => api.close() },
        {
          label: t("action.save2"), kind: "primary",
          onClick: (api) => {
            owner.auth = Object.assign({}, auth);
            owner.headers = headers.filter((row) => row && (row.key || row.value));
            owner.params = params.filter((row) => row && (row.key || row.value));
            owner.cookies = cookies.filter((row) => row && (row.key || row.value));
            store.persist();
            store.emit("sidebar");
            util.toast(t("shared.saved"), "success");
            api.close();
          }
        }
      ]
    });
  }

  function collectionMenu(collection) {
    const sk = shortcutKeys();
    return [
      { label: t("action.newRequest"), shortcut: sk.newTab, onClick: () => promptNewRequest(collection.id, "") },
      { label: t("action.newFolder"), onClick: () => promptFolder(collection.id, "") },
      { label: t("shared.menu"), onClick: () => openSharedSettings(collection, t("shared.titleCollection")) },
      { separator: true },
      { label: t("action.rename"), onClick: async () => {
        const name = await util.promptDialog({ title: t("dialog.renameTitle"), value: collection.name });
        if (name) store.renameCollection(collection.id, name);
      } },
      {
        label: t("action.more"),
        children: [
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
          { label: t("action.export"), onClick: () => openExportDialog(collection) }
        ]
      },
      { separator: true },
      { label: t("action.delete"), danger: true, onClick: () => confirmDeleteCollection(collection) }
    ];
  }

  function folderMenu(collection, folder) {
    const sk = shortcutKeys();
    return [
      { label: t("action.runFolder"), onClick: () => {
        if (HC.workflow && HC.workflow.openRunDialog) HC.workflow.openRunDialog(folder.id);
      } },
      { separator: true },
      { label: t("action.newRequest"), shortcut: sk.newTab, onClick: () => promptNewRequest(collection.id, folder.id) },
      { label: t("action.clone"), onClick: () => duplicateFolder(collection, folder) },
      { label: t("action.newFolder"), onClick: () => promptFolder(collection.id, folder.id) },
      { label: t("shared.menu"), onClick: () => openSharedSettings(folder, t("shared.titleFolder")) },
      { separator: true },
      { label: t("action.rename"), onClick: async () => {
        const name = await util.promptDialog({ title: t("dialog.renameTitle"), value: folder.name });
        if (name) store.renameFolder(folder.id, name);
      } },
      {
        label: t("action.more"),
        children: [
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
          { label: t("action.move"), onClick: () => openMoveDialog(folder, collection.id) }
        ]
      },
      { separator: true },
      { label: t("action.delete"), danger: true, onClick: () => confirmDeleteFolder(folder) }
    ];
  }

  function requestMenu(collection, saved) {
    const sk = shortcutKeys();
    return [
      { label: t("action.rename"), shortcut: sk.rename, onClick: () => startInlineRenameRequest(saved.id) },
      { label: t("action.clone"), shortcut: sk.cloneRequest, onClick: () => duplicateSavedRequest(collection, saved) },
      {
        label: t("action.more"),
        children: [
          { label: t("action.duplicateAsTab"), shortcut: sk.duplicateTab, onClick: () => duplicateSavedAsTab(collection, saved) },
          { label: t("action.copyPath"), onClick: () => copyText(requestPath(saved.url) || saved.url || saved.name, "toast.copied") },
          { label: t("action.copyCurl"), shortcut: sk.copyCurl, onClick: () => {
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
          { label: t("action.move"), onClick: () => openMoveDialog(saved, collection.id) }
        ]
      },
      { separator: true },
      { label: t("action.delete"), danger: true, onClick: async () => {
        if (await util.confirmDialog({ title: t("dialog.deleteTitle"), message: t("dialog.deleteMessage", { name: saved.name }) })) {
          store.deleteSavedRequest(collection.id, saved.id);
          util.toast(t("toast.deleted"));
        }
      } }
    ];
  }

  function openContextMenu(event, items) {
    util.openContextMenu(event, items);
  }

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
    const initialCollection = collectionId || (store.state.collections[0] || {}).id || "";
    const folderDd = util.createSelect({
      className: "hc-dd-block",
      items: [{ value: "", label: t("dialog.collectionRoot") }],
      value: ""
    });
    const collectionDd = util.createSelect({
      className: "hc-dd-block",
      items: store.state.collections.map((collection) => ({ value: collection.id, label: collection.name })),
      value: initialCollection,
      onChange: () => refillFolders()
    });
    function refillFolders() {
      const items = [{ value: "", label: t("dialog.collectionRoot") }];
      store.listFolders(collectionDd.value).forEach((folder) => {
        if (node.kind === "folder" && (folder.id === node.id || store.folderContains(node.id, folder.id))) return;
        items.push({ value: folder.id, label: folder.path });
      });
      folderDd.setOptions(items, true);
    }
    refillFolders();
    const located = store.locate(node.id);
    if (located && located.parent && located.collection.id === collectionDd.value) {
      folderDd.value = located.parent.id;
    }
    util.openModal({
      title: t("dialog.moveTitle"),
      render: (body) => {
        body.append(el("div", { class: "hc-hint", text: node.name }));
        body.append(el("label", { class: "hc-field" }, [
          el("span", { class: "hc-field-label", text: t("dialog.collection") }), collectionDd.root
        ]));
        body.append(el("label", { class: "hc-field" }, [
          el("span", { class: "hc-field-label", text: t("dialog.moveTarget") }), folderDd.root
        ]));
      },
      actions: [
        { label: t("action.cancel2"), onClick: (api) => api.close() },
        {
          label: t("action.move"), kind: "primary",
          onClick: (api) => {
            const ok = store.moveItem(node.id, collectionDd.value, folderDd.value);
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
        const item = el("div", {
          class: "hc-hist-item",
          role: "button",
          tabindex: "0",
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
        const openEntry = () => {
          store.openHistoryEntry(entry.id);
          HC.viewRequest.render();
          HC.viewResponse.render();
        };
        item.addEventListener("click", openEntry);
        item.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openEntry();
          }
        });
        item.addEventListener("contextmenu", (event) => {
          util.openContextMenu(event, [
            { label: t("action.open"), onClick: openEntry },
            { label: t("action.saveToCollection"), onClick: () => saveHistoryToCollection(entry) }
          ]);
        });
        list.append(item);
      });
      section.append(list);
      wrap.append(section);
    });

    host.append(wrap);
  }

  function saveHistoryToCollection(entry) {
    const snap = entry && entry.snapshot;
    if (!snap) return;
    const focus = store.treeFocus ? store.treeFocus() : { collectionId: "", folderId: "" };
    let collectionId = focus.collectionId || "";
    if (!collectionId) {
      const created = store.createCollection(t("misc.untitledCollection"));
      collectionId = created.id;
    }
    const draft = {
      id: util.uid("req"),
      name: entry.name || store.requestTitle(snap),
      clientType: snap.clientType || "http",
      method: snap.method || "GET",
      url: snap.url || "",
      headers: JSON.parse(JSON.stringify(snap.headers || [])),
      params: JSON.parse(JSON.stringify(snap.params || [])),
      pathParams: JSON.parse(JSON.stringify(snap.pathParams || [])),
      cookies: JSON.parse(JSON.stringify(snap.cookies || [])),
      examples: [],
      body: JSON.parse(JSON.stringify(snap.body || {})),
      auth: JSON.parse(JSON.stringify(snap.auth || {})),
      scripts: Object.assign({ pre: "", post: "" }, JSON.parse(JSON.stringify(snap.scripts || {}))),
      runPolicy: "each",
      options: Object.assign(store.emptyRequest().options, snap.options || {}),
      graphql: Object.assign({ query: "", variables: "{}" }, JSON.parse(JSON.stringify(snap.graphql || {}))),
      savedRequestId: "",
      collectionId: "",
      folderId: "",
      dirty: true
    };
    const saved = store.saveRequestTo(collectionId, draft, draft.name, focus.folderId || "");
    util.toast(t("toast.historySaved", { name: draft.name }), "success");
    if (saved && saved.id) {
      store.state.sideView = "collections";
      store.openSavedRequest(collectionId, saved.id);
      HC.viewRequest.render();
      HC.viewResponse.render();
      render();
    }
  }

  /* ---------------------------------------------------------- environments */

  let envDragId = "";

  function countEnvVars(environment) {
    return (environment.variables || []).filter(
      (row) => row && row.enabled !== false && String(row.key || "").trim()
    ).length;
  }

  function renderEnvironments(host) {
    if (!store.state.environments.length) {
      host.append(el("div", { class: "hc-empty", text: t("side.emptyEnvironments") }));
      return;
    }
    const filtering = !!filterText(sideFilter).trim();
    const envs = store.state.environments;
    const wrap = el("div", { class: "hc-env-side" });
    if (!filtering) {
      wrap.append(el("div", {
        class: "hc-env-cap",
        text: t("env.listCount", { count: envs.length })
      }));
    }
    const list = el("div", {
      class: `hc-env-list${filtering ? " is-filtering" : ""}`,
      role: "listbox",
      "aria-label": t("side.environments")
    });
    let shown = 0;
    envs.forEach((environment, index) => {
      if (!matchesFilter(environment.name)) return;
      shown += 1;
      const active = environment.id === store.state.activeEnvironmentId;
      const enabledVars = countEnvVars(environment);
      const item = el("div", {
        class: `hc-env-row${active ? " is-active" : ""}`,
        title: environment.name,
        role: "option",
        "aria-selected": active ? "true" : "false",
        dataset: { envId: environment.id }
      });
      if (!filtering) item.draggable = true;

      const main = el("div", { class: "hc-env-main" }, [
        el("span", {
          class: `hc-env-mark${active ? " is-on" : ""}`,
          "aria-hidden": "true"
        }),
        el("span", { class: "hc-list-title", text: environment.name })
      ]);
      const trail = el("div", { class: "hc-env-trail" }, [
        el("span", {
          class: "hc-env-meta",
          text: String(enabledVars),
          title: t("env.varCount", { count: enabledVars })
        })
      ]);
      const more = el("button", {
        type: "button",
        class: "hc-env-more",
        title: t("action.more"),
        "aria-label": t("action.more"),
        text: "⋯"
      });
      more.addEventListener("click", (event) => {
        event.stopPropagation();
        openContextMenu(event, environmentMenu(environment, index));
      });
      trail.append(more);
      item.append(main, trail);

      item.addEventListener("contextmenu", (event) => openContextMenu(event, environmentMenu(environment, index)));
      item.addEventListener("click", (event) => {
        if (event.target.closest(".hc-env-more")) return;
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
    wrap.append(list);
    host.append(wrap);
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
      {
        label: t("action.duplicate"),
        onClick: () => {
          const copy = store.createEnvironment(t("tab.copySuffix", { name: environment.name }));
          copy.variables = JSON.parse(JSON.stringify(environment.variables || []));
          store.persist();
          store.emit("environments");
          if (HC.viewEnv && HC.viewEnv.openEnvironment) HC.viewEnv.openEnvironment(copy.id);
          util.toast(t("env.duplicated"), "success");
        }
      },
      { separator: true },
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
      accept: ".json,.har,application/json,text/json",
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
      if (HC.har && HC.har.isHarDocument(document)) {
        const result = HC.har.importCollection(document);
        if (!result || result.error || !result.collection) {
          util.toast(t("toast.harFailed"), "error");
          return;
        }
        store.importCollection(result.collection);
        store.persist();
        store.emit("sidebar");
        render();
        util.toast(t("toast.imported", { count: result.count || 0 }), "success");
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

  function openExportDialog(collection, initialFormat) {
    const payload = { collections: [collection] };
    const redactCheck = el("input", { type: "checkbox", checked: true });
    const formatSelect = document.createElement("select");
    formatSelect.className = "hc-select";
    const formats = [
      ["native", t("dialog.exportFormatNative"), "json"],
      ["postman", "Postman v2.1", "json"],
      ["markdown", t("dialog.exportFormatMarkdown"), "md"],
      ["html", t("dialog.exportFormatHtml"), "html"]
    ];
    formats.forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      formatSelect.append(option);
    });
    if (initialFormat && formats.some((row) => row[0] === initialFormat)) {
      formatSelect.value = initialFormat;
    }
    const textarea = el("textarea", { class: "hc-textarea", spellcheck: "false" });
    const extension = () => {
      const hit = formats.find((row) => row[0] === formatSelect.value);
      return hit ? hit[2] : "txt";
    };
    const filename = () => {
      const name = String((collection && collection.name) || "api-docs")
        .replace(/[\\/:*?"<>|]/g, "_").trim() || "api-docs";
      return `${name}.${extension()}`;
    };
    const refresh = () => {
      const data = redactCheck.checked && store.redactForExport
        ? store.redactForExport(payload) : payload;
      const fmt = formatSelect.value;
      if (fmt === "postman" && HC.postman) {
        textarea.value = JSON.stringify(HC.postman.exportCollection(data.collections[0], { redact: false }), null, 2);
      } else if ((fmt === "markdown" || fmt === "html") && HC.docExport) {
        const rawLang = HC.i18n && HC.i18n.locale;
        const currentLang = typeof rawLang === "function" ? rawLang() : (rawLang || "zh-CN");
        textarea.value = HC.docExport.generate(data.collections[0], {
          format: fmt,
          lang: currentLang === "en" ? "en" : "zh-CN",
          includeExamples: true,
          includeAuth: true,
          redact: false
        });
      } else if (fmt === "markdown" || fmt === "html") {
        textarea.value = t("dialog.exportDocUnavailable");
      } else {
        textarea.value = JSON.stringify(data, null, 2);
      }
    };
    refresh();
    redactCheck.addEventListener("change", refresh);
    formatSelect.addEventListener("change", refresh);
    const download = (api) => {
      const ok = util.downloadText(textarea.value, filename());
      util.toast(ok ? t("toast.downloaded") : t("toast.downloadFailed"), ok ? "success" : "error");
      api.close();
    };
    util.openModal({
      title: t("dialog.exportTitle"),
      render: (body) => {
        body.append(el("div", { class: "hc-hint", text: t("dialog.exportHint") }));
        body.append(el("div", { class: "hc-field" }, [
          el("span", { class: "hc-field-label", text: t("dialog.exportFormat") }), formatSelect
        ]));
        body.append(el("label", { class: "hc-checkbox" }, [
          redactCheck, el("span", { text: t("dialog.exportRedact") })
        ]));
        body.append(textarea);
      },
      actions: [
        { label: t("action.cancel2"), onClick: (api) => api.close() },
        { label: t("action.download"), onClick: download },
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

  function duplicateFolder(_collection, folder) {
    const clone = store.cloneFolder(folder.id);
    if (!clone) return;
    util.toast(t("toast.cloned"));
  }

  window.HC.viewSidebar = {
    render,
    syncActive,
    openImportDialog,
    openExportDialog,
    startInlineFolder,
    startInlineRenameRequest,
    createRequestQuick: promptNewRequest,
    clearFilter() { sideFilter = ""; }
  };
})();
