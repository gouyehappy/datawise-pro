/* Request pane: URL row wiring, section tabs and the params / headers / body /
   auth / options panels. */

(function () {
  const util = HC.util;
  const store = HC.store;
  const t = (key, params) => HC.i18n.t(key, params);
  const el = util.el;

  const SECTIONS = [
    { id: "headers", label: "section.headers" },
    { id: "params", label: "section.params" },
    { id: "path", label: "section.path" },
    { id: "body", label: "section.body" },
    { id: "auth", label: "section.auth" },
    { id: "cookies", label: "section.cookies" },
    { id: "scripts-pre", label: "section.scriptsPre" },
    { id: "scripts-post", label: "section.scriptsPost" },
    { id: "options", label: "section.options" }
  ];

  const BODY_MODES = [
    { id: "none", label: "body.none" },
    { id: "formdata", label: "body.formdata" },
    { id: "urlencoded", label: "body.urlencoded" },
    { id: "raw", label: "body.raw" }
  ];

  const CONTENT_TYPES = ["application/json", "application/xml", "text/plain", "text/html", "application/x-www-form-urlencoded", ""];

  let currentTab = null;

  /* --------------------------------------------------------------- URL sync */

  function parseQuery(url) {
    const index = url.indexOf("?");
    if (index < 0) return [];
    const hashIndex = url.indexOf("#", index);
    const query = url.slice(index + 1, hashIndex < 0 ? undefined : hashIndex);
    const rows = [];
    query.split("&").forEach((pair) => {
      if (!pair) return;
      const eq = pair.indexOf("=");
      if (eq < 0) rows.push({ key: decodeSafe(pair), value: "", enabled: true });
      else rows.push({ key: decodeSafe(pair.slice(0, eq)), value: decodeSafe(pair.slice(eq + 1)), enabled: true });
    });
    return rows;
  }

  function decodeSafe(value) {
    try { return decodeURIComponent(value.replace(/\+/g, " ")); } catch (error) { return value; }
  }

  function buildQuery(rows) {
    return rows
      .filter((row) => row.enabled !== false && String(row.key || "").trim() !== "")
      .map((row) => `${encodeURIComponent(row.key)}=${encodeURIComponent(row.value === undefined ? "" : row.value)}`)
      .join("&");
  }

  function syncParamsFromUrl(tab) {
    const parsed = parseQuery(tab.url || "");
    const signature = (rows) => rows.filter((row) => row.key || row.value).map((row) => `${row.key}=${row.value}`).join("&");
    if (signature(parsed) === signature(tab.params || [])) return false;
    const prev = {};
    (tab.params || []).forEach((row) => {
      if (!row || !row.key) return;
      const slot = `${row.key}=${row.value || ""}`;
      if (!prev[slot]) prev[slot] = row;
    });
    tab.params = parsed.map((row) => {
      const prior = prev[`${row.key}=${row.value || ""}`];
      return {
        key: row.key,
        value: row.value,
        enabled: row.enabled !== false,
        description: prior && prior.description != null ? prior.description : "",
        type: prior && prior.type ? prior.type : "string"
      };
    }).concat([util.emptyRow()]);
    return true;
  }

  function syncUrlFromParams(tab) {
    const query = buildQuery(tab.params || []);
    const input = util.$("#url-input");
    const url = tab.url || "";
    const index = url.indexOf("?");
    const hashIndex = url.indexOf("#");
    const base = index < 0 ? url : url.slice(0, index);
    const hash = hashIndex < 0 ? "" : url.slice(hashIndex);
    const next = query ? `${base}?${query}${hash}` : `${base}${hash}`;
    tab.url = next;
    if (input) input.value = next;
    updateUrlHighlight(tab);
  }

  /* ---------------------------------------------- URL {{var}} highlighting */

  let urlHighlightBound = false;

  function parseUrlTokens(text) {
    return util.varTips.parseTokens(text);
  }

  function lookupUrlVar(name) {
    return util.varTips.lookup(name);
  }

  function hideUrlVarTip() {
    util.varTips.hide();
  }

  function showUrlVarTip(token, input) {
    util.varTips.show(token, input);
  }

  function measureTextWidth(input, text) {
    return util.varTips.measureTextWidth(input, text);
  }

  function charIndexAtUrl(input, clientX) {
    return util.varTips.charIndexAt(input, clientX);
  }

  function updateUrlHighlight(tab) {
    const input = util.$("#url-input");
    const host = util.$("#url-highlight");
    const flag = util.$("#url-flag");
    if (!input || !host) return;
    bindUrlHighlight();

    const text = (tab && tab.url != null) ? String(tab.url) : (input.value || "");
    const tokens = parseUrlTokens(text);
    const hasVars = tokens.some((token) => token.type === "var");
    input.classList.toggle("is-rich", hasVars || !!text);

    util.clear(host);
    const track = el("div", { class: "hc-url-highlight-track" });
    tokens.forEach((token) => {
      if (token.type !== "var") {
        track.append(document.createTextNode(token.text));
        return;
      }
      const info = lookupUrlVar(token.name);
      const klass = info.ok
        ? (info.kind === "dynamic" ? "hc-url-var is-dynamic" : "hc-url-var is-ok")
        : "hc-url-var is-missing";
      track.append(el("span", { class: klass, text: token.text }));
    });
    host.append(track);
    track.style.transform = `translateX(${-(input.scrollLeft || 0)}px)`;

    if (flag) {
      const missing = tokens
        .filter((token) => token.type === "var" && !lookupUrlVar(token.name).ok)
        .map((token) => token.name);
      const uniq = Array.from(new Set(missing));
      if (uniq.length) {
        flag.hidden = false;
        flag.textContent = "!";
        flag.title = t("toast.missingVars", { names: uniq.join(", ") });
      } else {
        flag.hidden = true;
        flag.textContent = "";
        flag.title = "";
      }
    }
  }

  function updateUrlFlag(tab) {
    updateUrlHighlight(tab);
  }

  function bindUrlHighlight() {
    if (urlHighlightBound) return;
    const input = util.$("#url-input");
    const wrap = util.$(".hc-url-wrap");
    if (!input || !wrap) return;
    urlHighlightBound = true;

    const refresh = () => {
      const tab = store.activeTab();
      if (tab) updateUrlHighlight(tab);
    };
    input.addEventListener("scroll", () => {
      const track = util.$("#url-highlight .hc-url-highlight-track");
      if (track) track.style.transform = `translateX(${-(input.scrollLeft || 0)}px)`;
    });
    wrap.addEventListener("mousemove", (event) => {
      const tip = document.querySelector(".hc-url-var-tip");
      if (tip && tip.contains(event.target)) return;
      const index = charIndexAtUrl(input, event.clientX);
      const token = parseUrlTokens(input.value || "").find((item) => (
        item.type === "var" && index >= item.start && index < item.end
      ));
      if (token) showUrlVarTip(token, input);
      else if (!tip || !tip.matches(":hover")) {
        hideUrlVarTip();
      }
    });
    wrap.addEventListener("mouseleave", (event) => {
      const tip = document.querySelector(".hc-url-var-tip");
      if (tip && event.relatedTarget && tip.contains(event.relatedTarget)) return;
      setTimeout(() => {
        const still = document.querySelector(".hc-url-var-tip");
        if (still && still.matches(":hover")) return;
        hideUrlVarTip();
      }, 120);
    });
    input.addEventListener("blur", () => {
      setTimeout(hideUrlVarTip, 160);
    });
    store.subscribe((reason) => {
      if (reason === "environments" || reason === "loaded" || reason === "request") refresh();
    });
  }

  /* -------------------------------------------------------------- rendering */

  function render() {
    const tab = store.activeTab();
    if (!tab) return;
    currentTab = tab;
    if (tab.section === "scripts") tab.section = "scripts-pre";
    const methodSelect = util.$("#method-select");
    const urlInput = util.$("#url-input");
    const urlRow = util.$(".hc-url-row");
    const methodLabel = util.$("#method-label");
    const methodPicker = util.$("#method-picker");
    const sendBtn = util.$("#btn-send");
    const clientType = tab.clientType || "http";
    const stream = HC.clients && HC.clients.isStreamClient(clientType);
    const markdown = clientType === "markdown";

    const displayMethod = (HC.clients && HC.clients.CLIENT_META[clientType] && clientType !== "http")
      ? HC.clients.CLIENT_META[clientType].tag
      : tab.method;
    if (methodSelect) {
      methodSelect.value = store.METHODS.indexOf(tab.method) >= 0 ? tab.method : "GET";
      methodSelect.dataset.method = displayMethod;
      methodSelect.disabled = stream || markdown || clientType === "graphql" || clientType === "sse" || clientType === "grpc";
    }
    if (methodLabel) methodLabel.textContent = displayMethod;
    if (methodPicker) methodPicker.hidden = !!(stream || markdown);
    if (urlRow) {
      urlRow.dataset.method = displayMethod;
      urlRow.hidden = !!markdown;
      urlRow.classList.toggle("is-stream", !!stream);
    }
    if (urlInput) {
      if (urlInput.value !== tab.url) urlInput.value = tab.url || "";
      urlInput.placeholder = clientType === "tcp" ? t("client.tcpUrlPlaceholder")
        : stream ? t("client.wsUrlPlaceholder")
          : t("request.urlPlaceholder") || urlInput.placeholder;
    }
    if (sendBtn) sendBtn.hidden = !!markdown;
    const copyCurl = util.$("#btn-copy-curl");
    if (copyCurl) copyCurl.hidden = !!markdown;
    const requestPane = util.$("#request-pane");
    if (requestPane) requestPane.classList.toggle("is-markdown", !!markdown);
    const responsePane = util.$("#response-pane");
    if (responsePane) responsePane.hidden = !!markdown;
    const paneSplitter = util.$("#pane-splitter");
    if (paneSplitter) paneSplitter.hidden = !!markdown;
    if (markdown && requestPane) requestPane.style.flex = "1 1 auto";
    else if (requestPane && HC.app && HC.app.applyLayout) HC.app.applyLayout();
    else if (requestPane) requestPane.style.flex = "";
    updateUrlHighlight(tab);
    renderSections(tab);
    renderPanels(tab);
    updateTitle(tab);
  }

  function updateTitle(tab) {
    const nameInput = util.$("#request-title");
    if (nameInput && document.activeElement !== nameInput) nameInput.value = store.requestTitle(tab);
  }

  function countActive(rows) {
    return (rows || []).filter((row) => row && row.enabled !== false && row.key).length;
  }

  const PRIMARY_SECTIONS = ["headers", "params", "path", "body", "auth", "cookies", "scripts-pre", "scripts-post", "options"];
  const MORE_SECTIONS = [];

  function bodyBadgeCount(tab) {
    if (!tab.body || tab.body.mode === "none") return null;
    if (tab.body.mode === "raw") return tab.body.raw && String(tab.body.raw).trim() ? 1 : null;
    return countActive(tab.body.fields) || null;
  }

  function sectionBadge(tab, sectionId) {
    if (sectionId === "params") return countActive(tab.params);
    if (sectionId === "headers") return countActive(tab.headers);
    if (sectionId === "path") return countActive(tab.pathParams);
    if (sectionId === "cookies") return countActive(tab.cookies);
    if (sectionId === "body") return bodyBadgeCount(tab);
    if (sectionId === "auth" && tab.auth.type !== "none") return 1;
    if (sectionId === "scripts-pre") {
      const scripts = tab.scripts || {};
      return scripts.pre && scripts.pre.trim() ? 1 : null;
    }
    if (sectionId === "scripts-post") {
      const scripts = tab.scripts || {};
      return scripts.post && scripts.post.trim() ? 1 : null;
    }
    if (sectionId === "options") {
      const defaults = tab.options.verifyTls === false || tab.options.proxyMode !== "environment";
      return defaults ? "•" : null;
    }
    return null;
  }

  function appendSectionButton(host, tab, section) {
    const badge = sectionBadge(tab, section.id);
    const hasData = typeof badge === "number" ? badge > 0 : (badge !== null && badge !== 0 && badge !== "");
    const useDot = section.id === "scripts-pre" || section.id === "scripts-post" || section.id === "auth";
    const button = el("button", {
      class: `hc-section${tab.section === section.id ? " is-active" : ""}${hasData ? " has-data" : ""}`,
      type: "button",
      on: {
        click: () => {
          tab.section = section.id;
          store.schedulePersist();
          render();
        }
      }
    });
    button.append(document.createTextNode(t(section.label)));
    if (useDot && hasData) {
      button.append(el("span", { class: "hc-section-dot", "aria-hidden": "true" }));
    } else if (typeof badge === "number" && badge > 0) {
      button.append(el("span", { class: "hc-section-count", text: `(${badge})` }));
    } else if (badge !== null && badge !== 0 && badge !== "") {
      button.append(el("span", { class: "hc-badge is-on", text: String(badge) }));
    }
    host.append(button);
    return button;
  }

  function renderSections(tab) {
    const host = util.clear(util.$("#request-sections"));
    const clientType = tab.clientType || "http";
    const stream = HC.clients && HC.clients.isStreamClient(clientType);
    const markdown = clientType === "markdown";
    if (markdown) {
      host.hidden = true;
      return;
    }
    host.hidden = false;
    const byId = {};
    SECTIONS.forEach((section) => { byId[section.id] = section; });
    byId.messages = { id: "messages", label: "section.messages" };

    let primaryIds = PRIMARY_SECTIONS.slice();
    let moreIds = MORE_SECTIONS.slice();
    if (clientType === "graphql") {
      primaryIds = ["body", "headers", "auth", "scripts-pre", "scripts-post", "options"];
      moreIds = [];
      if (tab.section === "params" || tab.section === "path" || tab.section === "cookies") tab.section = "body";
    } else if (stream) {
      primaryIds = ["messages", "headers", "scripts-pre", "scripts-post"];
      moreIds = ["auth", "options"];
      if (tab.section === "params" || tab.section === "body" || tab.section === "path" || tab.section === "cookies") {
        tab.section = "messages";
      }
    } else if (clientType === "sse") {
      if (tab.section === "body") tab.section = "headers";
    }

    primaryIds.forEach((id) => {
      if (byId[id]) appendSectionButton(host, tab, byId[id]);
    });

    const moreActive = moreIds.indexOf(tab.section) >= 0;
    const moreHasBadge = moreIds.some((id) => {
      const badge = sectionBadge(tab, id);
      return badge !== null && badge !== 0 && badge !== "";
    });
    if (!moreIds.length) return;
    const wrap = el("div", { class: `hc-section-more${moreActive ? " is-active" : ""}` });
    const trigger = el("button", {
      class: `hc-section hc-section-more-trigger${moreActive ? " is-active" : ""}`,
      type: "button",
      "aria-haspopup": "menu",
      "aria-expanded": "false"
    });
    trigger.append(document.createTextNode(moreActive ? t(byId[tab.section].label) : t("section.more")));
    if (moreHasBadge || moreActive) {
      trigger.append(el("span", { class: "hc-badge is-on", text: moreActive ? "•" : "…" }));
    }
    const menu = el("div", { class: "hc-section-more-menu", hidden: true, role: "menu" });
    moreIds.forEach((id) => {
      const section = byId[id];
      if (!section) return;
      const item = el("button", {
        type: "button",
        class: `hc-section-more-item${tab.section === id ? " is-active" : ""}`,
        role: "menuitem",
        text: t(section.label),
        on: {
          click: (event) => {
            event.stopPropagation();
            closeMore();
            tab.section = id;
            store.schedulePersist();
            render();
          }
        }
      });
      const badge = sectionBadge(tab, id);
      if (badge !== null && badge !== 0 && badge !== "") {
        item.append(el("span", { class: "hc-badge is-on", text: String(badge) }));
      }
      menu.append(item);
    });
    let docCloser = null;
    const closeMore = () => {
      menu.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      menu.classList.remove("is-fixed");
      if (menu.parentNode === document.body) wrap.append(menu);
      if (docCloser) {
        document.removeEventListener("click", docCloser);
        docCloser = null;
      }
    };
    const openMore = () => {
      document.body.append(menu);
      menu.hidden = false;
      menu.classList.add("is-fixed");
      const rect = trigger.getBoundingClientRect();
      const width = Math.max(132, menu.offsetWidth || 132);
      let left = rect.right - width;
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
      menu.style.top = `${Math.round(rect.bottom + 4)}px`;
      menu.style.left = `${Math.round(left)}px`;
      menu.style.right = "auto";
      trigger.setAttribute("aria-expanded", "true");
      setTimeout(() => {
        docCloser = (clickEvent) => {
          if (wrap.contains(clickEvent.target) || menu.contains(clickEvent.target)) return;
          closeMore();
        };
        document.addEventListener("click", docCloser);
      }, 0);
    };
    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      if (menu.hidden) openMore();
      else closeMore();
    });
    wrap.append(trigger, menu);
    host.append(wrap);
  }

  function renderPanels(tab) {
    const host = util.clear(util.$("#request-panels"));
    const panel = el("div", { class: "hc-panel" });
    host.append(panel);
    if (tab.clientType === "markdown") {
      renderMarkdown(panel, tab);
      return;
    }
    if (tab.section === "messages") renderMessages(panel, tab);
    else if (tab.section === "params") renderParams(panel, tab);
    else if (tab.section === "path") renderPath(panel, tab);
    else if (tab.section === "headers") renderHeaders(panel, tab);
    else if (tab.section === "cookies") renderCookies(panel, tab);
    else if (tab.section === "body") renderBody(panel, tab);
    else if (tab.section === "auth") renderAuth(panel, tab);
    else if (tab.section === "scripts-pre") renderScriptPane(panel, tab, "pre");
    else if (tab.section === "scripts-post") renderScriptPane(panel, tab, "post");
    else if (tab.section === "scripts") renderScriptPane(panel, tab, "pre");
    else renderOptions(panel, tab);
  }

  function renderMarkdown(panel, tab) {
    const shell = el("div", { class: "hc-md-workspace" });
    const editorPane = el("div", { class: "hc-md-pane" });
    editorPane.append(el("div", { class: "hc-md-pane-head" }, [
      el("span", { class: "hc-md-pane-title", text: t("client.mdEdit") }),
      el("span", { class: "hc-hint", text: t("client.mdHint") })
    ]));
    const previewPane = el("div", { class: "hc-md-pane is-preview" });
    const previewHead = el("div", { class: "hc-md-pane-head" }, [
      el("span", { class: "hc-md-pane-title", text: t("client.mdPreviewHint") })
    ]);
    const previewBody = el("div", { class: "hc-md-preview-body" });
    const syncPreview = () => {
      const raw = (tab.body && tab.body.raw) || "";
      previewBody.innerHTML = HC.clients && HC.clients.renderMarkdown
        ? HC.clients.renderMarkdown(raw)
        : `<pre>${util.escapeHtml(raw)}</pre>`;
    };
    const area = el("textarea", {
      class: "hc-textarea hc-md-editor",
      value: (tab.body && tab.body.raw) || "",
      spellcheck: "true",
      placeholder: t("client.mdPlaceholder")
    });
    area.addEventListener("input", () => {
      if (!tab.body) tab.body = { mode: "raw", raw: "", contentType: "text/markdown", fields: [] };
      tab.body.mode = "raw";
      tab.body.contentType = "text/markdown";
      tab.body.raw = area.value;
      markChanged(tab);
      syncPreview();
    });
    editorPane.append(area);
    previewPane.append(previewHead, previewBody);
    shell.append(editorPane, previewPane);
    panel.append(shell);
    syncPreview();
  }

  function renderMessages(panel, tab) {
    if (!tab.stream) tab.stream = { sessionId: "", connected: false, log: [], draft: "" };
    const shell = el("div", { class: "hc-client-shell" });
    shell.append(el("div", { class: "hc-client-toolbar" }, [
      el("span", { class: "hc-client-title", text: t("section.messages") }),
      el("span", {
        class: `hc-client-pill ${tab.stream.connected ? "is-on" : ""}`,
        text: tab.stream.connected ? t("stream.connected") : t("stream.idle")
      })
    ]));
    shell.append(el("div", {
      class: "hc-hint",
      text: tab.clientType === "socketio" ? t("client.sioHint") : t("client.streamHint")
    }));
    const composer = el("div", { class: "hc-stream-composer" });
    const area = el("textarea", {
      class: "hc-textarea hc-stream-input",
      value: tab.stream.draft || "",
      placeholder: t("client.messagePlaceholder"),
      spellcheck: "false"
    });
    area.addEventListener("input", () => { tab.stream.draft = area.value; });
    area.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        if (HC.app && HC.app.sendStreamMessage) HC.app.sendStreamMessage();
      }
    });
    const sendBtn = el("button", {
      class: "hc-btn hc-btn-sm hc-btn-send",
      type: "button",
      text: t("action.sendMessage"),
      disabled: !(tab.stream && tab.stream.connected) ? "true" : undefined,
      on: {
        click: () => {
          if (HC.app && HC.app.sendStreamMessage) HC.app.sendStreamMessage();
        }
      }
    });
    composer.append(area, sendBtn);
    shell.append(composer);
    shell.append(el("div", { class: "hc-hint", text: t("client.streamShortcut") }));
    panel.append(shell);
  }

  function markChanged(tab) {
    store.markDirty(tab);
  }

  function renderParams(panel, tab) {
    const kvHost = el("div", {});
    panel.append(kvHost);
    util.createKVEditor(kvHost, {
      rows: tab.params.length ? tab.params : (tab.params = [util.emptyRow()]),
      showEquals: true,
      keyLabel: t("kv.keyName"),
      valueLabel: t("kv.valueName"),
      descriptionLabel: t("kv.description"),
      keyPlaceholder: t("kv.keyPlaceholder"),
      valuePlaceholder: t("kv.valuePlaceholder"),
      descriptionPlaceholder: t("kv.descriptionPlaceholder"),
      onChange: () => { syncUrlFromParams(tab); markChanged(tab); }
    });
  }

  function renderHeaders(panel, tab) {
    const toolbar = el("div", { class: "hc-body-toolbar" });
    toolbar.append(el("span", { class: "hc-hint", text: t("headers.presets") }));
    ["Accept: application/json", "Content-Type: application/json", "Authorization: Bearer ", "User-Agent: "].forEach((preset) => {
      const [key, value] = preset.split(": ");
      toolbar.append(el("button", {
        class: "hc-btn hc-btn-sm hc-btn-ghost", type: "button", text: key,
        on: {
          click: () => {
            // 先清掉尾部的空白行，再追加预设行，最后补一行新的空行。否则预设会
            // 排在既有空行之后，界面上就多出一行空列（编辑器始终保留一行待输入）。
            const rows = tab.headers;
            while (rows.length && !rows[rows.length - 1].key && !rows[rows.length - 1].value
              && !rows[rows.length - 1].description) rows.pop();
            rows.push({ key, value: value || "", description: "", type: "string", enabled: true });
            store.markDirty(tab);
            render();
          }
        }
      }));
    });
    panel.append(toolbar);
    const kvHost = el("div", {});
    panel.append(kvHost);
    util.createKVEditor(kvHost, {
      rows: tab.headers.length ? tab.headers : (tab.headers = [util.emptyRow()]),
      showType: true,
      keyLabel: t("kv.keyName"),
      typeLabel: t("kv.advanced"),
      valueLabel: t("kv.valueName"),
      descriptionLabel: t("kv.description"),
      keyPlaceholder: t("kv.keyPlaceholder"),
      valuePlaceholder: t("kv.valuePlaceholder"),
      descriptionPlaceholder: t("kv.descriptionPlaceholder"),
      onChange: () => markChanged(tab)
    });
  }

  function syncPathParamsFromUrl(tab) {
    const url = String(tab.url || "");
    const pathOnly = url.split("?")[0].split("#")[0];
    const names = [];
    const seen = new Set();
    pathOnly.replace(/:([A-Za-z_][\w]*)|\{([A-Za-z_][\w]*)\}/g, (_, colon, brace) => {
      const name = colon || brace;
      if (name && !seen.has(name)) {
        seen.add(name);
        names.push(name);
      }
      return _;
    });
    const prev = {};
    (tab.pathParams || []).forEach((row) => {
      if (row && row.key) prev[row.key] = row;
    });
    tab.pathParams = names.map((key) => ({
      key,
      value: prev[key] ? prev[key].value : "",
      description: prev[key] && prev[key].description != null ? prev[key].description : "",
      type: prev[key] && prev[key].type ? prev[key].type : "string",
      enabled: prev[key] ? prev[key].enabled !== false : true
    })).concat([util.emptyRow()]);
  }

  function applyPathParamsToUrl(tab) {
    let url = String(tab.url || "");
    const queryIndex = url.indexOf("?");
    const hashIndex = url.indexOf("#");
    let path = url;
    let suffix = "";
    if (queryIndex >= 0 || hashIndex >= 0) {
      const cut = queryIndex >= 0 && hashIndex >= 0 ? Math.min(queryIndex, hashIndex)
        : (queryIndex >= 0 ? queryIndex : hashIndex);
      path = url.slice(0, cut);
      suffix = url.slice(cut);
    }
    (tab.pathParams || []).forEach((row) => {
      if (!row || !row.key || row.enabled === false) return;
      const value = row.value == null ? "" : String(row.value);
      if (!value) return;
      const colon = `:${row.key}`;
      const brace = `{${row.key}}`;
      if (path.indexOf(colon) >= 0) path = path.split(colon).join(encodeURIComponent(value));
      else if (path.indexOf(brace) >= 0) path = path.split(brace).join(encodeURIComponent(value));
    });
    tab.url = path + suffix;
    const input = util.$("#url-input");
    if (input) input.value = tab.url;
    updateUrlHighlight(tab);
  }

  function renderPath(panel, tab) {
    syncPathParamsFromUrl(tab);
    const kvHost = el("div", {});
    panel.append(kvHost);
    util.createKVEditor(kvHost, {
      rows: tab.pathParams.length ? tab.pathParams : (tab.pathParams = [util.emptyRow()]),
      keyLabel: t("kv.keyName"),
      valueLabel: t("kv.valueName"),
      descriptionLabel: t("kv.description"),
      keyPlaceholder: t("path.key"),
      valuePlaceholder: t("path.value"),
      descriptionPlaceholder: t("kv.descriptionPlaceholder"),
      onChange: () => {
        applyPathParamsToUrl(tab);
        markChanged(tab);
      }
    });
  }

  function renderCookies(panel, tab) {
    if (!tab.cookies) tab.cookies = [util.emptyRow()];
    const kvHost = el("div", {});
    panel.append(kvHost);
    util.createKVEditor(kvHost, {
      rows: tab.cookies.length ? tab.cookies : (tab.cookies = [util.emptyRow()]),
      showEquals: true,
      keyLabel: t("kv.keyName"),
      valueLabel: t("kv.valueName"),
      descriptionLabel: t("kv.description"),
      keyPlaceholder: t("cookies.key"),
      valuePlaceholder: t("cookies.value"),
      descriptionPlaceholder: t("kv.descriptionPlaceholder"),
      onChange: () => markChanged(tab)
    });
  }

  function renderBody(panel, tab) {
    if (tab.clientType === "graphql") {
      if (!tab.graphql) tab.graphql = { query: "query {\n  \n}", variables: "{\n  \n}" };
      const shell = el("div", { class: "hc-client-shell" });
      shell.append(el("div", { class: "hc-client-toolbar" }, [
        el("span", { class: "hc-client-title", text: "GraphQL" }),
        el("span", { class: "hc-hint", text: t("client.gqlHint") })
      ]));
      const split = el("div", { class: "hc-gql-split" });
      const queryPane = el("div", { class: "hc-gql-pane" });
      queryPane.append(el("div", { class: "hc-field-label", text: t("client.gqlQuery") }));
      const queryArea = el("textarea", {
        class: "hc-textarea hc-gql-query",
        value: tab.graphql.query || "",
        spellcheck: "false"
      });
      queryArea.addEventListener("input", () => {
        tab.graphql.query = queryArea.value;
        if (HC.clients) HC.clients.syncGraphqlBody(tab);
        markChanged(tab);
      });
      queryPane.append(queryArea);
      const varsPane = el("div", { class: "hc-gql-pane is-vars" });
      varsPane.append(el("div", { class: "hc-field-label", text: t("client.gqlVariables") }));
      const varsArea = el("textarea", {
        class: "hc-textarea hc-gql-vars",
        value: tab.graphql.variables || "{}",
        spellcheck: "false"
      });
      varsArea.addEventListener("input", () => {
        tab.graphql.variables = varsArea.value;
        if (HC.clients) HC.clients.syncGraphqlBody(tab);
        markChanged(tab);
      });
      varsPane.append(varsArea);
      split.append(queryPane, varsPane);
      shell.append(split);
      panel.append(shell);
      return;
    }
    if (tab.clientType === "grpc") {
      panel.append(el("div", { class: "hc-hint", text: t("client.grpcHint") }));
    }

    const modeRow = el("div", { class: "hc-body-modes" });
    BODY_MODES.forEach((mode) => {
      const input = el("input", {
        type: "radio",
        name: "body-mode",
        checked: tab.body.mode === mode.id ? "true" : undefined
      });
      const label = el("label", {
        class: `hc-body-mode${tab.body.mode === mode.id ? " is-on" : ""}`
      }, [
        el("span", { class: "hc-body-mode-dot", "aria-hidden": "true" }),
        el("span", { text: t(mode.label) })
      ]);
      label.prepend(input);
      input.addEventListener("change", () => {
        tab.body.mode = mode.id;
        if (mode.id === "formdata" && !tab.body.fields.length) tab.body.fields = [util.emptyRow()];
        if (mode.id === "urlencoded" && !tab.body.fields.length) tab.body.fields = [util.emptyRow()];
        store.markDirty(tab);
        render();
      });
      modeRow.append(label);
    });
    if (tab.body.mode === "raw") {
      const contentTypeSelect = el("select", { class: "hc-select hc-select-flat hc-body-type" });
      const typeLabels = {
        "application/json": "JSON",
        "application/xml": "XML",
        "text/plain": "Text",
        "text/html": "HTML",
        "application/x-www-form-urlencoded": "URL Encoded",
        "": t("body.noContentType")
      };
      CONTENT_TYPES.forEach((type) => {
        contentTypeSelect.append(el("option", { value: type, text: typeLabels[type] || type || t("body.noContentType") }));
      });
      contentTypeSelect.value = tab.body.contentType || "application/json";
      contentTypeSelect.addEventListener("change", () => {
        tab.body.contentType = contentTypeSelect.value;
        markChanged(tab);
      });
      modeRow.append(contentTypeSelect);
    }
    panel.append(modeRow);

    if (tab.body.mode === "none") {
      panel.append(el("div", { class: "hc-panel-empty", text: t("body.noneHint") }));
      return;
    }

    if (tab.body.mode === "raw") {
      const toolbar = el("div", { class: "hc-body-toolbar" }, [
        el("button", {
          class: "hc-btn hc-btn-sm hc-btn-ghost", type: "button", text: t("action.format"),
          on: {
            click: () => {
              const formatted = util.tryFormatJson(textarea.value) || util.tryFormatXml(textarea.value);
              if (formatted) { textarea.value = formatted; tab.body.raw = formatted; markChanged(tab); }
            }
          }
        }),
        el("span", { class: "hc-hint", text: t("body.rawHint") })
      ]);
      const textarea = el("textarea", {
        class: "hc-textarea hc-body-raw", spellcheck: "false", placeholder: t("body.placeholder"), value: tab.body.raw || ""
      });
      textarea.addEventListener("input", () => { tab.body.raw = textarea.value; markChanged(tab); });
      panel.append(toolbar, textarea);
      return;
    }

    const allowFiles = tab.body.mode === "formdata";
    const kvHost = el("div", {});
    panel.append(kvHost);
    util.createKVEditor(kvHost, {
      rows: tab.body.fields.length ? tab.body.fields : (tab.body.fields = [util.emptyRow()]),
      allowFiles,
      showEquals: !allowFiles,
      keyLabel: t("kv.keyName"),
      valueLabel: t("kv.valueName"),
      descriptionLabel: t("kv.description"),
      keyPlaceholder: t("kv.keyPlaceholder"),
      valuePlaceholder: t("kv.valuePlaceholder"),
      descriptionPlaceholder: t("kv.descriptionPlaceholder"),
      onChange: () => markChanged(tab)
    });
  }

  function renderAuth(panel, tab) {
    const types = [
      { id: "none", label: "auth.none" },
      { id: "basic", label: "auth.basic" },
      { id: "bearer", label: "auth.bearer" },
      { id: "apikey", label: "auth.apikey" }
    ];
    const modeRow = el("div", { class: "hc-body-modes" });
    types.forEach((type) => {
      const input = el("input", {
        type: "radio",
        name: "auth-type",
        checked: tab.auth.type === type.id ? "true" : undefined
      });
      const label = el("label", {
        class: `hc-body-mode${tab.auth.type === type.id ? " is-on" : ""}`
      }, [
        el("span", { class: "hc-body-mode-dot", "aria-hidden": "true" }),
        el("span", { text: t(type.label) })
      ]);
      label.prepend(input);
      input.addEventListener("change", () => {
        tab.auth.type = type.id;
        store.markDirty(tab);
        render();
      });
      modeRow.append(label);
    });
    panel.append(modeRow);

    if (tab.auth.type === "none") {
      panel.append(el("div", { class: "hc-panel-empty", text: t("auth.hint") }));
      return;
    }

    const grid = el("div", { class: "hc-form-grid" });
    const field = (labelKey, key, options) => {
      grid.append(el("span", { class: "hc-field-label", text: t(labelKey) }));
      const input = el("input", {
        class: "hc-input",
        type: (options && options.type) || "text",
        value: tab.auth[key] || "",
        placeholder: (options && options.placeholder) || ""
      });
      input.addEventListener("input", () => { tab.auth[key] = input.value; markChanged(tab); });
      grid.append(input);
    };

    if (tab.auth.type === "basic") {
      field("auth.username", "username");
      field("auth.password", "password", { type: "password" });
    } else if (tab.auth.type === "bearer") {
      field("auth.token", "token", { type: "password", placeholder: "eyJhbGciOi..." });
    } else if (tab.auth.type === "apikey") {
      field("auth.key", "key", { placeholder: "X-API-Key" });
      field("auth.value", "value", { type: "password" });
      grid.append(el("span", { class: "hc-field-label", text: t("auth.in") }));
      const select = el("select", { class: "hc-select" }, [
        el("option", { value: "header", text: t("auth.inHeader") }),
        el("option", { value: "query", text: t("auth.inQuery") })
      ]);
      select.value = tab.auth.in || "header";
      select.addEventListener("change", () => { tab.auth.in = select.value; markChanged(tab); });
      grid.append(select);
    }
    panel.append(grid);
    panel.append(el("div", { class: "hc-hint", text: t("auth.hint") }));
  }

  function renderScriptPane(panel, tab, kind) {
    if (!tab.scripts) tab.scripts = { pre: "", post: "" };
    if (!tab.scriptsUi) tab.scriptsUi = { preOpen: false, postOpen: false };
    const isPre = kind === "pre";
    const code = (isPre ? tab.scripts.pre : tab.scripts.post) || "";
    const open = isPre ? tab.scriptsUi.preOpen : tab.scriptsUi.postOpen;
    const showEditor = open || !!code.trim();

    if (!showEditor) {
      const empty = el("div", { class: "hc-scripts-empty" });
      empty.append(el("button", {
        type: "button",
        class: "hc-scripts-add",
        text: t("scripts.addItem"),
        on: {
          click: () => {
            if (isPre) tab.scriptsUi.preOpen = true;
            else tab.scriptsUi.postOpen = true;
            store.schedulePersist();
            render();
          }
        }
      }));
      panel.append(empty);
      return;
    }

    panel.append(el("div", {
      class: "hc-hint",
      text: isPre ? t("scripts.preHint") : t("scripts.postHint")
    }));
    const editor = el("textarea", {
      class: "hc-textarea hc-scripts-editor is-solo",
      spellcheck: "false",
      placeholder: t(isPre ? "scripts.prePlaceholder" : "scripts.postPlaceholder"),
      value: code
    });
    editor.addEventListener("input", () => {
      if (isPre) tab.scripts.pre = editor.value;
      else tab.scripts.post = editor.value;
      markChanged(tab);
    });
    panel.append(editor);
    requestAnimationFrame(() => {
      try { editor.focus(); } catch (_) { /* ignore */ }
    });
  }

  function renderOptions(panel, tab) {
    const grid = el("div", { class: "hc-form-grid" });

    const numberField = (labelKey, key, options) => {
      grid.append(el("span", { class: "hc-field-label", text: t(labelKey) }));
      const input = el("input", {
        class: "hc-input", type: "number", value: tab.options[key],
        min: options.min, max: options.max, step: options.step || 1
      });
      input.addEventListener("change", () => {
        const value = Number(input.value);
        if (Number.isFinite(value)) { tab.options[key] = value; markChanged(tab); }
      });
      grid.append(input);
    };

    const checkboxField = (labelKey, key, inverted) => {
      grid.append(el("span", { class: "hc-field-label", text: t(labelKey) }));
      const input = el("input", { type: "checkbox", checked: inverted ? tab.options[key] === false : tab.options[key] !== false });
      input.addEventListener("change", () => { tab.options[key] = inverted ? !input.checked : input.checked; markChanged(tab); });
      const wrap = el("label", { class: "hc-checkbox" }, [input]);
      if (key === "verifyTls" && tab.options.verifyTls === false) {
        wrap.append(el("span", { class: "hc-hint", text: t("options.verifyTlsOff") }));
      }
      grid.append(wrap);
    };

    numberField("options.timeout", "timeoutMs", { min: 500, max: 115000, step: 500 });
    numberField("options.maxRedirects", "maxRedirects", { min: 0, max: 50 });
    checkboxField("options.followRedirects", "followRedirects");
    checkboxField("options.verifyTls", "verifyTls");

    grid.append(el("span", { class: "hc-field-label", text: t("options.proxy") }));
    const proxySelect = el("select", { class: "hc-select" }, [
      el("option", { value: "environment", text: t("options.proxy.environment") }),
      el("option", { value: "direct", text: t("options.proxy.direct") }),
      el("option", { value: "custom", text: t("options.proxy.custom") })
    ]);
    proxySelect.value = tab.options.proxyMode || "environment";
    proxySelect.addEventListener("change", () => { tab.options.proxyMode = proxySelect.value; markChanged(tab); render(); });
    grid.append(proxySelect);

    if (tab.options.proxyMode === "custom") {
      grid.append(el("span", { class: "hc-field-label", text: t("options.proxyUrl") }));
      const proxyInput = el("input", { class: "hc-input", type: "text", value: tab.options.proxyUrl || "", placeholder: "http://127.0.0.1:7890" });
      proxyInput.addEventListener("input", () => { tab.options.proxyUrl = proxyInput.value; markChanged(tab); });
      grid.append(proxyInput);
    }

    grid.append(el("span", { class: "hc-field-label", text: t("options.maxBodyBytes") }));
    const sizeSelect = el("select", { class: "hc-select hc-select-flat" }, [
      el("option", { value: "1048576", text: "1 MiB" }),
      el("option", { value: "8388608", text: "8 MiB" }),
      el("option", { value: "33554432", text: "32 MiB" }),
      el("option", { value: "67108864", text: "64 MiB" })
    ]);
    sizeSelect.value = String(tab.options.maxBodyBytes || 33554432);
    sizeSelect.addEventListener("change", () => { tab.options.maxBodyBytes = Number(sizeSelect.value); markChanged(tab); });
    grid.append(sizeSelect);

    panel.append(grid);
    panel.append(el("div", { class: "hc-hint", text: t("options.hint") }));
  }

  window.HC.viewRequest = {
    render, syncParamsFromUrl, syncUrlFromParams, updateUrlFlag, updateUrlHighlight, buildQuery
  };
})();
