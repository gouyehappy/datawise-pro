/* Response pane: status line, body/headers/cookies/request views, chunked body
   loading for oversized responses and saving to disk through the sidecar. */

(function () {
  const util = HC.util;
  const store = HC.store;
  const t = (key, params) => HC.i18n.t(key, params);
  const el = util.el;

  const RESPONSE_TABS = [
    { id: "body", label: "response.body" },
    { id: "headers", label: "response.headers" },
    { id: "cookies", label: "response.cookies" },
    { id: "examples", label: "response.examples" },
    { id: "diff", label: "response.diff" },
    { id: "request", label: "response.request" },
    { id: "console", label: "response.console" }
  ];

  let progressUnsubscribe = null;
  let loading = false;
  let lastRenderedTabId = null;

  function viewState(tab) {
    if (!tab.responseView) tab.responseView = { tab: "body", bodyMode: "pretty", search: "", searchIndex: 0 };
    if (!tab.responseView.bodyMode) tab.responseView.bodyMode = "pretty";
    if (tab.responseView.search == null) tab.responseView.search = "";
    if (tab.responseView.searchIndex == null) tab.responseView.searchIndex = 0;
    if (tab.responseView.tab === "scripts" || tab.responseView.tab === "scripts-pre" || tab.responseView.tab === "scripts-post") {
      tab.responseView.tab = "console";
    }
    return tab.responseView;
  }

  function collectTests(tab) {
    const pre = (tab && tab.scriptResults && tab.scriptResults.pre) || null;
    const post = (tab && tab.scriptResults && tab.scriptResults.post) || null;
    return []
      .concat((pre && pre.tests) || [])
      .concat((post && post.tests) || []);
  }

  function hasScriptError(tab) {
    const pre = (tab && tab.scriptResults && tab.scriptResults.pre) || null;
    const post = (tab && tab.scriptResults && tab.scriptResults.post) || null;
    return !!(pre && pre.error) || !!(post && post.error);
  }

  function render() {
    const host = util.$("#response-pane");
    if (!host) return;
    const tab = store.activeTab();
    // Preserve the scroll position of the outgoing tab so switching back does
    // not drop the user at the top of a long response again.
    const previousBody = host.querySelector(".hc-response-body");
    if (previousBody && lastRenderedTabId) {
      const previous = store.state.tabs.find((item) => item.id === lastRenderedTabId);
      if (previous) {
        previous.responseView = previous.responseView || {};
        previous.responseView.scrollTop = previousBody.scrollTop;
      }
    }
    lastRenderedTabId = tab ? tab.id : null;
    util.clear(host);
    if (!tab) return;

    if (tab.clientType === "markdown") {
      util.clear(host);
      host.hidden = true;
      return;
    }
    host.hidden = false;

    if (HC.clients && HC.clients.isStreamClient(tab.clientType)) {
      renderStreamLog(host, tab);
      return;
    }

    const result = tab.response;

    if (tab.sending && !result) {
      host.append(el("div", { class: "hc-response-empty" }, [
        el("div", { class: "hc-body-toolbar" }, [
          el("span", { class: "hc-spinner" }),
          el("span", { text: t("response.sending") }),
          el("span", { class: "hc-hint", id: "response-progress", text: formatProgress(tab.progress) })
        ])
      ]));
      return;
    }
    if (!result) {
      host.append(el("div", { class: "hc-response-empty", text: t("response.empty") }));
      return;
    }
    if (result.ok === false) {
      host.append(renderError(tab, result));
      return;
    }
    host.append(renderStatusBar(tab, result));

    const state = viewState(tab);
    const tabsHost = el("div", { class: "hc-response-tabs" });
    RESPONSE_TABS.forEach((item) => {
      let icon = "";
      if (item.id === "headers") icon = ` (${(result.headers || []).length})`;
      else if (item.id === "cookies") {
        const jar = store.cookiesForUrl
          ? store.cookiesForUrl(result.finalUrl || result.url || tab.url || "").length
          : 0;
        icon = ` (${(result.setCookies || []).length}${jar ? `/${jar}` : ""})`;
      }
      else if (item.id === "examples") icon = ` (${(tab.examples || []).length})`;
      else if (item.id === "console") {
        const pre = (tab.scriptResults && tab.scriptResults.pre) || null;
        const post = (tab.scriptResults && tab.scriptResults.post) || null;
        const tests = []
          .concat((pre && pre.tests) || [])
          .concat((post && post.tests) || []);
        if (tests.length) icon = ` (${tests.filter((row) => row.ok).length}/${tests.length})`;
        else if ((pre && pre.error) || (post && post.error)) icon = " (!)";
        else if (pre || post) icon = " (✓)";
      }
      tabsHost.append(el("button", {
        class: `hc-section${state.tab === item.id ? " is-active" : ""}`,
        type: "button",
        text: t(item.label) + icon,
        on: { click: () => { state.tab = item.id; render(); } }
      }));
    });
    host.append(tabsHost);

    const bodyHost = el("div", { class: "hc-response-body" });
    host.append(bodyHost);
    if (state.tab === "body") renderBody(bodyHost, tab, result);
    else if (state.tab === "headers") renderHeaders(bodyHost, result);
    else if (state.tab === "cookies") renderCookies(bodyHost, tab, result);
    else if (state.tab === "examples") renderExamples(bodyHost, tab);
    else if (state.tab === "diff") renderDiff(bodyHost, tab, result);
    else if (state.tab === "console") renderConsole(bodyHost, tab);
    else if (state.tab === "scripts-pre") renderScriptResult(bodyHost, tab, "pre");
    else if (state.tab === "scripts-post") renderScriptResult(bodyHost, tab, "post");
    else if (state.tab === "scripts") renderScriptResult(bodyHost, tab, "post");
    else renderRequest(bodyHost, result);

    const savedScroll = Number(state.scrollTop) || 0;
    if (savedScroll) {
      requestAnimationFrame(() => {
        if (bodyHost.isConnected) bodyHost.scrollTop = savedScroll;
      });
    }
  }

  function formatProgress(progress) {
    if (!progress) return "";
    if (progress.phase === "receiving" && progress.received) return util.formatBytes(progress.received);
    return progress.phase === "receiving" ? t("progress.receiving") : t("progress.sending");
  }

  function renderStatusBar(tab, result) {
    const status = result.status || 0;
    const host = el("div", { class: "hc-response-head" });
    host.append(el("span", {
      class: `hc-status ${util.statusClass(status, true)}`,
      text: status ? `${status} ${result.statusText || ""}`.trim() : "—"
    }));
    const metrics = el("div", { class: "hc-metrics-row" });
    metrics.append(metricChip(t("response.metricHttp"), result.httpVersion || "1.1"));
    metrics.append(metricChip(t("response.metricTime"), util.formatDuration(result.durationMs)));
    metrics.append(metricChip(t("response.metricSize"), util.formatBytes(result.sizeBytes)));
    if (result.firstByteMs !== undefined && result.firstByteMs !== null) {
      metrics.append(metricChip("TTFB", util.formatDuration(result.firstByteMs)));
    }
    if ((result.attempts || []).length > 1) {
      const attempts = result.attempts;
      const history = attempts.slice(0, -1)
        .map((item) => `#${item.attempt} ${item.status || item.error || "-"}`).join("\n");
      metrics.append(metricChip(t("response.attempts"), `×${attempts.length}`, history));
    }
    if ((result.redirects || []).length) {
      metrics.append(metricChip(
        t("response.redirects"),
        `×${result.redirects.length}`,
        result.redirects.map((hop) => `${hop.status} → ${hop.location}`).join("\n")
      ));
    }
    const tests = collectTests(tab);
    const scriptErr = hasScriptError(tab);
    if (tests.length || scriptErr) {
      const passed = tests.filter((row) => row.ok).length;
      const failed = (tests.length - passed) + (scriptErr ? 1 : 0);
      metrics.append(el("button", {
        type: "button",
        class: `hc-test-chip${failed ? " is-fail" : " is-ok"}`,
        title: t("response.testsHint"),
        text: failed
          ? t("response.testsFail", { ok: passed, total: tests.length || passed + failed })
          : t("response.testsPass", { total: tests.length }),
        on: {
          click: () => {
            viewState(tab).tab = "console";
            render();
          }
        }
      }));
    }
    host.append(metrics);
    host.append(el("span", { class: "hc-grow" }));
    const actions = el("div", { class: "hc-response-actions" });
    const fileName = suggestedName(result);
    actions.append(el("button", {
      class: "hc-btn hc-btn-sm hc-btn-ghost", type: "button", text: t("examples.save"),
      title: t("examples.saveHint"),
      on: { click: () => saveExample(tab, result) }
    }));
    actions.append(el("button", {
      class: "hc-btn hc-btn-sm hc-btn-ghost", type: "button", text: t("codegen.button"),
      on: { click: (event) => openCodegenMenu(event, tab) }
    }));
    actions.append(el("button", {
      class: "hc-btn hc-btn-sm hc-btn-ghost", type: "button", text: t("response.genAssert"),
      on: { click: () => openAssertGen(tab, result) }
    }));
    actions.append(el("button", {
      class: "hc-btn hc-btn-sm hc-btn-ghost", type: "button", text: t("response.saveToFile"),
      title: fileName,
      on: { click: () => saveToFile(tab, result) }
    }));
    actions.append(el("button", {
      class: "hc-btn hc-btn-sm hc-btn-ghost", type: "button", text: t("response.copyBody"),
      on: { click: () => copyBody(tab, result) }
    }));
    // Same layout menu as the topbar button, for quick access once a response
    // exists. (The topbar entry is the fallback for the empty-response state.)
    actions.append(el("button", {
      class: "hc-btn hc-btn-sm hc-btn-ghost", type: "button", text: "⤢ " + t("action.paneLayout"),
      title: t("action.cyclePane"),
      on: { click: (event) => {
        if (HC.app && HC.app.openPaneLayoutMenu) HC.app.openPaneLayoutMenu(event);
      } }
    }));
    host.append(actions);
    return host;
  }

  function saveExample(tab, result) {
    const body = currentText(tab, result);
    const example = store.saveResponseExample(tab, result, body);
    if (example) {
      util.toast(t("examples.saved"), "success");
      const state = viewState(tab);
      state.tab = "examples";
      render();
    }
  }

  function openCodegenMenu(event, tab) {
    const generators = (HC.codegen && HC.codegen.GENERATORS) || [
      { kind: "curl", label: "cURL" },
      { kind: "fetch", label: "JavaScript fetch" },
      { kind: "python", label: "Python requests" }
    ];
    util.openContextMenu(event, generators.map((generator) => ({
      label: generator.label,
      onClick: () => showCodegen(generator.kind, tab)
    })));
  }

  function showCodegen(kind, tab) {
    const code = HC.codegen
      ? HC.codegen.generate(kind, tab, { resolve: (value) => store.resolve(value) })
      : "";
    const textarea = el("textarea", {
      class: "hc-textarea",
      spellcheck: "false",
      value: code
    });
    util.openModal({
      title: t("codegen.title", { kind }),
      render: (body) => {
        body.append(el("div", { class: "hc-hint", text: t("codegen.hint") }));
        body.append(textarea);
      },
      actions: [
        { label: t("action.close"), onClick: (api) => api.close() },
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

  function openAssertGen(tab, result) {
    const generated = HC.assertGen && HC.assertGen.generate
      ? HC.assertGen.generate(currentText(tab, result), { status: result.status || 0 })
      : null;
    if (!generated || generated.error || !generated.code) {
      util.toast(t("toast.genAssertFailed"), "error");
      return;
    }
    const textarea = el("textarea", {
      class: "hc-textarea", spellcheck: "false", value: generated.code
    });
    util.openModal({
      title: t("response.genAssertTitle"),
      render: (body) => { body.append(textarea); },
      actions: [
        { label: t("action.close"), onClick: (api) => api.close() },
        {
          label: t("action.copy"),
          onClick: async (api) => {
            const ok = await HC.bridge.copy(textarea.value);
            util.toast(ok ? t("toast.copied") : t("toast.copyFailed"), ok ? "success" : "error");
            api.close();
          }
        },
        {
          label: t("response.genAssertAppend"), kind: "primary",
          onClick: (api) => {
            tab.scripts = tab.scripts || { pre: "", post: "" };
            const previous = String(tab.scripts.post || "").trim();
            tab.scripts.post = (previous ? previous + "\n\n" : "") + textarea.value + "\n";
            tab.section = "scripts-post";
            store.markDirty(tab);
            if (HC.viewRequest) HC.viewRequest.render();
            util.toast(t("toast.genAssertAdded"), "success");
            api.close();
          }
        }
      ]
    });
  }

  function metricChip(label, value, title) {
    return el("span", { class: "hc-metric", title: title || "" }, [
      el("span", { class: "hc-metric-label", text: label }),
      el("span", { class: "hc-metric-value", text: value })
    ]);
  }

  function renderStreamLog(host, tab) {
    if (!tab.stream) tab.stream = { sessionId: "", connected: false, log: [], draft: "" };
    const connected = !!tab.stream.connected;
    const head = el("div", { class: "hc-response-head" }, [
      el("span", {
        class: `hc-status ${connected ? "is-2xx" : "is-muted"}`,
        text: connected ? t("stream.connected") : t("stream.idle")
      }),
      el("div", { class: "hc-metrics-row" }, [
        metricChip(t("stream.messages"), String((tab.stream.log || []).length))
      ]),
      el("button", {
        class: "hc-btn hc-btn-sm hc-btn-ghost",
        type: "button",
        text: t("action.clearLog"),
        on: {
          click: () => {
            tab.stream.log = [];
            render();
          }
        }
      })
    ]);
    host.append(head);
    const list = el("div", { class: "hc-stream-log" });
    const rows = tab.stream.log || [];
    if (!rows.length) {
      list.append(el("div", { class: "hc-empty", text: t("stream.empty") }));
    } else {
      rows.slice().reverse().forEach((row) => {
        const time = new Date(row.at || Date.now()).toLocaleTimeString();
        const dirLabel = row.dir === "out" ? t("stream.dirOut")
          : row.dir === "in" ? t("stream.dirIn")
            : row.dir === "err" ? t("stream.dirErr")
              : t("stream.dirSys");
        list.append(el("div", { class: `hc-stream-row is-${row.dir || "sys"}` }, [
          el("div", { class: "hc-stream-meta" }, [
            el("span", { class: "hc-stream-dir", text: dirLabel }),
            el("span", { text: time })
          ]),
          el("pre", { class: "hc-stream-text", text: row.text || "" })
        ]));
      });
    }
    host.append(list);
  }

  function renderError(tab, result) {
    const error = result.error || {};
    const kindKey = `err.${error.kind}`;
    const kindText = t(kindKey);
    const kindLabel = kindText === kindKey ? t("err.network") : kindText;
    const host = el("div", { class: "hc-error-card" });
    host.append(el("h4", { text: `${kindLabel}（${error.kind || "unknown"}）` }));
    host.append(el("div", { text: error.message || "" }));
    host.append(el("div", { class: "hc-hint", text: `${util.formatDuration(result.durationMs)} · ${result.method} ${result.url}` }));
    if ((result.redirects || []).length) {
      host.append(el("div", { class: "hc-hint", text: result.redirects.map((hop) => `${hop.status} → ${hop.location}`).join("\n") }));
    }
    const detail = el("button", { class: "hc-btn hc-btn-sm hc-btn-ghost", type: "button", text: t("response.sentHeaders") });
    const detailHost = el("div", { hidden: true });
    detail.addEventListener("click", () => {
      detailHost.hidden = !detailHost.hidden;
      if (!detailHost.hidden && !detailHost.childNodes.length) detailHost.append(headersTable(result.requestHeaders));
    });
    host.append(el("div", { class: "hc-body-toolbar" }, [detail]));
    host.append(detailHost);
    return host;
  }

  const MAX_RENDER_CHARS = 1000000;

  function currentText(tab, result) {
    // fullBody is already bytes; base64 round-tripping it costs 30+ MiB of
    // extra allocations on a 32 MiB response.
    if (tab && tab.fullBody) {
      try { return new TextDecoder("utf-8", { fatal: false }).decode(tab.fullBody); }
      catch (_) { /* fall back to the preview below */ }
    }
    return util.decodeText((result && result.bodyPreviewBase64) || "");
  }

  function bytesToBase64(bytes) {
    let binary = "";
    for (let index = 0; index < bytes.length; index += 8192) {
      binary += String.fromCharCode.apply(null, bytes.subarray(index, index + 8192));
    }
    return btoa(binary);
  }

  function escapeRegExp(text) {
    return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function clearSearchMarks(root) {
    if (!root) return;
    root.querySelectorAll("mark.hc-search-hit").forEach((mark) => {
      const parent = mark.parentNode;
      if (!parent) return;
      parent.replaceChild(document.createTextNode(mark.textContent || ""), mark);
      parent.normalize();
    });
  }

  const MAX_SEARCH_HITS = 300;

  function markSearchHits(root, query) {
    clearSearchMarks(root);
    const q = String(query || "");
    if (!q || !root) return [];
    const re = new RegExp(escapeRegExp(q), "gi");
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    const marks = [];
    textNodes.forEach((node) => {
      if (marks.length >= MAX_SEARCH_HITS) return;
      const text = node.nodeValue || "";
      if (!text || !re.test(text)) {
        re.lastIndex = 0;
        return;
      }
      re.lastIndex = 0;
      const frag = document.createDocumentFragment();
      let last = 0;
      let match;
      while ((match = re.exec(text))) {
        if (marks.length >= MAX_SEARCH_HITS) break;
        if (match.index > last) frag.appendChild(document.createTextNode(text.slice(last, match.index)));
        const mark = document.createElement("mark");
        mark.className = "hc-search-hit";
        mark.textContent = match[0];
        frag.appendChild(mark);
        marks.push(mark);
        last = match.index + match[0].length;
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      if (node.parentNode) node.parentNode.replaceChild(frag, node);
    });
    return marks;
  }

  function jumpSearchHit(marks, state, delta) {
    if (!marks.length) return;
    marks.forEach((mark) => mark.classList.remove("is-current"));
    let index = Number(state.searchIndex) || 0;
    index = (index + delta + marks.length) % marks.length;
    state.searchIndex = index;
    const current = marks[index];
    current.classList.add("is-current");
    try { current.scrollIntoView({ block: "center", inline: "nearest" }); } catch (_) { /* ignore */ }
    const counter = util.$("#hc-body-search-count");
    if (counter) counter.textContent = `${index + 1}/${marks.length}`;
  }

  function mountBodySearch(toolbar, codeNode, state) {
    const wrap = el("div", { class: "hc-body-search" });
    const input = el("input", {
      id: "hc-body-search-input",
      class: "hc-input hc-body-search-input",
      type: "search",
      spellcheck: "false",
      placeholder: t("response.searchPlaceholder"),
      value: state.search || "",
      title: t("response.searchHint")
    });
    const count = el("span", { id: "hc-body-search-count", class: "hc-body-search-count", text: "" });
    const prev = el("button", { type: "button", class: "hc-btn hc-btn-sm hc-btn-ghost", text: "↑", title: t("response.searchPrev") });
    const next = el("button", { type: "button", class: "hc-btn hc-btn-sm hc-btn-ghost", text: "↓", title: t("response.searchNext") });
    let marks = [];
    const apply = () => {
      state.search = input.value || "";
      marks = markSearchHits(codeNode, state.search);
      if (!marks.length) {
        count.textContent = state.search ? "0" : "";
        return;
      }
      if (state.searchIndex >= marks.length) state.searchIndex = 0;
      jumpSearchHit(marks, state, 0);
    };
    let searchTimer = 0;
    input.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.searchIndex = 0;
        apply();
      }, 150);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        clearTimeout(searchTimer);
        if (input.value !== state.search) apply();
        jumpSearchHit(marks, state, event.shiftKey ? -1 : 1);
      } else if (event.key === "Escape") {
        clearTimeout(searchTimer);
        input.value = "";
        state.search = "";
        state.searchIndex = 0;
        apply();
        input.blur();
      }
    });
    prev.addEventListener("click", () => jumpSearchHit(marks, state, -1));
    next.addEventListener("click", () => jumpSearchHit(marks, state, 1));
    wrap.append(input, count, prev, next);
    toolbar.append(wrap);
    requestAnimationFrame(apply);
    return input;
  }

  function renderBody(host, tab, result) {
    const state = viewState(tab);
    const truncated = !tab.fullBody && (result.bodyPreviewBytes || 0) < (result.sizeBytes || 0);
    const total = result.sizeBytes || 0;
    const loaded = tab.fullBody ? tab.fullBody.length : (result.bodyPreviewBytes || 0);

    const toolbar = el("div", { class: "hc-body-toolbar" });
    const modes = [
      { id: "pretty", label: "response.pretty" },
      { id: "tree", label: "response.tree" },
      { id: "raw", label: "response.raw" },
      { id: "preview", label: "response.preview" }
    ];
    const segment = el("div", { class: "hc-segment", role: "group" });
    modes.forEach((mode) => {
      const input = el("input", { type: "radio", name: "body-view" });
      const label = el("label", { class: `hc-segment-item${state.bodyMode === mode.id ? " is-on" : ""}` }, [input, el("span", { text: t(mode.label) })]);
      input.addEventListener("change", () => { state.bodyMode = mode.id; render(); });
      segment.append(label);
    });
    toolbar.append(segment);
    toolbar.append(el("span", { class: "hc-hint", text: `${result.contentType || "unknown"} · ${util.formatBytes(loaded)}` }));
    host.append(toolbar);

    if (truncated) {
      const bar = el("div", { class: "hc-truncated" });
      bar.append(el("span", { text: t("response.truncated", { loaded: util.formatBytes(loaded), total: util.formatBytes(total) }) }));
      const loadButton = el("button", {
        class: "hc-btn hc-btn-sm", type: "button", text: t("response.loadFull"),
        disabled: !HC.bridge.backendReady || loading
      });
      loadButton.addEventListener("click", () => loadFullBody(tab, result, loadButton));
      bar.append(loadButton);
      host.append(bar);
    } else if (tab.fullBody && total > (result.bodyPreviewBytes || 0)) {
      host.append(el("div", { class: "hc-truncated" }, [el("span", { text: t("response.loaded", { size: util.formatBytes(tab.fullBody.length) }) })]));
    }

    if (state.bodyMode === "preview") {
      if (util.isImage(result.contentType)) {
        host.append(el("img", {
          class: "hc-preview-image",
          src: `data:${result.contentType};base64,${tab.fullBody ? bytesToBase64(tab.fullBody) : result.bodyPreviewBase64}`,
          alt: "response image"
        }));
        return;
      }
      if (/text\/html/i.test(result.contentType || "")) {
        host.append(el("div", { class: "hc-hint", text: t("response.htmlNote") }));
      } else if (!util.isTextual(result.contentType)) {
        host.append(renderFileCard(result, total));
        return;
      }
      host.append(el("pre", { class: "hc-code", text: currentText(tab, result).slice(0, 200000) }));
      return;
    }

    const content = currentText(tab, result);
    if (!util.isTextual(result.contentType)) {
      host.append(renderFileCard(result, total));
      return;
    }
    // Pretty/Tree used to format the entire 64 MiB body synchronously and
    // freeze the UI. Cap rendered text; the full body is still saved on disk.
    const renderCapped = content.length > MAX_RENDER_CHARS;
    const renderText = renderCapped ? content.slice(0, MAX_RENDER_CHARS) : content;
    if (renderCapped) {
      host.append(el("div", {
        class: "hc-hint",
        text: t("response.renderLimit", { count: util.formatBytes(MAX_RENDER_CHARS) })
      }));
    }
    let codeNode = null;
    if (state.bodyMode === "tree") {
      const treeHost = el("div", { class: "hc-json-tree-host" });
      host.append(treeHost);
      if (HC.jsonTree && HC.jsonTree.render(treeHost, renderText)) {
        codeNode = treeHost;
      } else {
        codeNode = el("pre", { class: "hc-code", text: renderText });
        treeHost.append(codeNode);
      }
      mountBodySearch(toolbar, codeNode, state);
      return;
    }
    if (state.bodyMode === "pretty") {
      const pretty = util.tryFormatJson(renderText) || (util.looksLikeJson(renderText) ? renderText : null);
      if (pretty) {
        codeNode = el("pre", { class: "hc-code", html: util.highlightJson(pretty) });
        host.append(codeNode);
        mountBodySearch(toolbar, codeNode, state);
        return;
      }
    }
    codeNode = el("pre", { class: "hc-code", text: renderText });
    host.append(codeNode);
    mountBodySearch(toolbar, codeNode, state);
  }

  function focusSearch() {
    const tab = store.activeTab();
    if (!tab || !tab.response) return false;
    const state = viewState(tab);
    if (state.tab !== "body") {
      state.tab = "body";
      if (state.bodyMode === "preview") state.bodyMode = "pretty";
      render();
    }
    const input = util.$("#hc-body-search-input");
    if (input) {
      input.focus();
      input.select();
      return true;
    }
    return false;
  }

  function renderExamples(host, tab) {
    const list = tab.examples || [];
    if (!list.length) {
      host.append(el("div", { class: "hc-hint", text: t("examples.empty") }));
      return;
    }
    list.forEach((example) => {
      const card = el("div", { class: "hc-example-card" });
      card.append(el("div", { class: "hc-example-head" }, [
        el("strong", { text: example.name || t("examples.unnamed") }),
        el("span", {
          class: "hc-hint",
          text: `${example.status || "—"} · ${example.contentType || "text"} · ${new Date(example.at || Date.now()).toLocaleString()}`
        }),
        el("span", { class: "hc-grow" }),
        el("button", {
          class: "hc-btn hc-btn-sm hc-btn-ghost", type: "button", text: t("action.copy"),
          on: {
            click: async () => {
              const ok = await HC.bridge.copy(example.body || "");
              util.toast(ok ? t("toast.copied") : t("toast.copyFailed"), ok ? "success" : "error");
            }
          }
        }),
        el("button", {
          class: "hc-btn hc-btn-sm hc-btn-danger", type: "button", text: t("action.delete"),
          on: {
            click: () => {
              tab.examples = (tab.examples || []).filter((item) => item.id !== example.id);
              tab.dirty = true;
              if (tab.savedRequestId) {
                store.saveRequestTo(tab.collectionId, tab, store.requestTitle(tab), tab.folderId || "");
              } else store.persist();
              render();
            }
          }
        })
      ]));
      card.append(el("pre", { class: "hc-code", text: String(example.body || "").slice(0, 120000) }));
      host.append(card);
    });
  }

  function renderDiff(host, tab, result) {
    const rightText = currentText(tab, result);
    const sources = [{ id: "paste", label: t("response.diffPaste"), text: null }];
    (tab.examples || []).forEach((example, index) => {
      sources.push({
        id: `example:${example.id || index}`,
        label: `${t("examples.save")} ${index + 1}: ${example.name || ""}`,
        text: example.body || ""
      });
    });
    (store.state.tabs || []).forEach((other) => {
      if (other.id === tab.id || !other.response) return;
      sources.push({
        id: `tab:${other.id}`,
        label: store.requestTitle(other),
        text: currentText(other, other.response)
      });
    });

    const bar = el("div", { class: "hc-diff-bar" });
    bar.append(el("span", { class: "hc-field-label", text: t("response.diffBaseline") }));
    const select = document.createElement("select");
    select.className = "hc-select";
    sources.forEach((source) => {
      const option = document.createElement("option");
      option.value = source.id;
      option.textContent = source.label;
      select.append(option);
    });
    bar.append(select);

    const jsonCheck = el("input", { type: "checkbox" });
    const jsonLabel = el("label", { class: "hc-checkbox" }, [
      jsonCheck, el("span", { text: t("response.diffJson") })
    ]);
    const onlyCheck = el("input", { type: "checkbox", checked: true });
    const onlyLabel = el("label", { class: "hc-checkbox" }, [
      onlyCheck, el("span", { text: t("response.diffOnly") })
    ]);
    bar.append(jsonLabel, onlyLabel);

    const paste = el("textarea", {
      class: "hc-textarea hc-diff-paste", rows: "6", spellcheck: "false",
      placeholder: t("response.diffPasteHint")
    });
    const output = el("div", { class: "hc-diff-output" });
    host.append(bar, paste, el("div", { class: "hc-hint", text: t("response.diffHint") }), output);

    let timer = 0;
    function update() {
      util.clear(output);
      const source = sources.find((item) => item.id === select.value) || sources[0];
      let left = source.text != null ? source.text : paste.value;
      let right = rightText;
      if (jsonCheck.checked) {
        left = HC.diff.normalizeJson(left);
        right = HC.diff.normalizeJson(right);
      }
      const rows = HC.diff.diffText(left, right);
      const shown = onlyCheck.checked ? rows.filter((row) => row.type !== "same") : rows;
      if (!shown.length) {
        output.append(el("div", { class: "hc-hint", text: t("response.diffEmpty") }));
        return;
      }
      shown.slice(0, 2000).forEach((row) => {
        output.append(el("div", {
          class: `hc-diff-line is-${row.type}`,
          text: `${row.type === "add" ? "+ " : row.type === "del" ? "- " : "  "}${row.text}`
        }));
      });
      if (shown.length > 2000) {
        output.append(el("div", { class: "hc-hint", text: `… ${shown.length - 2000}` }));
      }
    }
    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(update, 150);
    }
    select.addEventListener("change", update);
    jsonCheck.addEventListener("change", update);
    onlyCheck.addEventListener("change", update);
    paste.addEventListener("input", schedule);
    update();
  }

  async function loadFullBody(tab, result, button) {
    if (loading) return;
    loading = true;
    button.disabled = true;
    const total = result.sizeBytes || 0;
    const bytes = new Uint8Array(total);
    let offset = 0;
    try {
      while (offset < total) {
        const chunk = await HC.bridge.readBody(result.bodyId, offset, 512 * 1024);
        const piece = util.base64ToBytes(chunk.dataBase64 || "");
        bytes.set(piece, chunk.offset);
        offset = chunk.offset + chunk.length;
        button.textContent = t("response.loading", { percent: Math.round((offset / total) * 100) });
        if (chunk.eof || !chunk.length) break;
      }
      tab.fullBody = bytes.subarray(0, offset);
      render();
    } catch (error) {
      util.toast(t("toast.loadFailed", { message: error.message || error }), "error");
      button.disabled = false;
      button.textContent = t("response.loadFull");
    } finally {
      loading = false;
    }
  }

  async function copyBody(tab, result) {
    const text = tab.fullBody ? util.decodeText(bytesToBase64(tab.fullBody)) : (result.bodyPreviewBase64 ? util.decodeText(result.bodyPreviewBase64) : "");
    const ok = await HC.bridge.copy(text);
    util.toast(ok ? t("toast.copied") : t("toast.copyFailed"), ok ? "success" : "error");
  }

  function suggestedName(result) {
    if (result && result.suggestedFileName) return result.suggestedFileName;
    if (window.HC.downloadName) {
      return HC.downloadName.suggest({
        headers: result && result.headers,
        contentType: result && result.contentType,
        url: (result && (result.finalUrl || result.url)) || ""
      });
    }
    return "download.bin";
  }

  function renderFileCard(result, total) {
    const name = suggestedName(result);
    const ext = (name.split(".").pop() || "bin").slice(0, 4).toUpperCase();
    return el("div", { class: "hc-file-card" }, [
      el("div", { class: "hc-file-icon", "aria-hidden": "true" }, [
        el("span", { class: "hc-file-ext", text: ext })
      ]),
      el("div", { class: "hc-file-meta" }, [
        el("div", { class: "hc-file-name", text: name }),
        el("div", { class: "hc-hint", text: t("response.fileHint", {
          name,
          type: result.contentType || "application/octet-stream",
          size: util.formatBytes(total)
        }) })
      ])
    ]);
  }

  async function saveToFile(tab, result) {
    if (!HC.bridge.backendReady) {
      util.toast(t("err.backendHint"), "error");
      return;
    }
    try {
      const saved = await HC.bridge.saveBody(result.bodyId, { fileName: suggestedName(result) });
      util.toast(t("toast.savedTo", { path: saved.path }), "success");
    } catch (error) {
      util.toast(t("toast.saveFailed", { message: error.message || error }), "error");
    }
  }

  function renderConsole(host, tab) {
    const sr = tab.scriptResults || {};
    if (!sr.pre && !sr.post) {
      host.append(el("div", { class: "hc-hint", text: t("response.consoleEmpty") }));
      return;
    }
    if (sr.pre) renderScriptResult(host, tab, "pre");
    if (sr.post) renderScriptResult(host, tab, "post");
  }

  function renderScriptResult(host, tab, kind) {
    const sr = tab.scriptResults || {};
    const result = kind === "pre" ? sr.pre : sr.post;
    if (!result) {
      host.append(el("div", { class: "hc-hint", text: t("scripts.noResults") }));
      return;
    }
    const title = kind === "pre" ? t("scripts.pre") : t("scripts.post");
    const card = el("div", { class: `hc-script-result${result.ok ? " is-ok" : " is-fail"}` });
    card.append(el("div", { class: "hc-script-result-head", text: `${title} · ${result.durationMs || 0} ms` }));
    if (result.error) card.append(el("div", { class: "hc-hint", text: result.error }));
    (result.tests || []).forEach((test) => {
      card.append(el("div", {
        class: `hc-script-test${test.ok ? " is-ok" : " is-fail"}`,
        text: `${test.ok ? "✓" : "✗"} ${test.name}${test.message ? " — " + test.message : ""}`
      }));
    });
    (result.logs || []).forEach((line) => card.append(el("div", { class: "hc-script-log", text: line })));
    if (!(result.tests || []).length && !result.error && !(result.logs || []).length) {
      card.append(el("div", { class: "hc-hint", text: t("scripts.emptyRun") }));
    }
    host.append(card);
  }

  function headersTable(headers) {
    const table = el("table", { class: "hc-table" });
    table.append(el("thead", {}, [el("tr", {}, [el("th", { text: t("kv.key") }), el("th", { text: t("kv.value") })])]));
    const body = el("tbody", {});
    (headers || []).forEach((header) => {
      body.append(el("tr", {}, [el("td", { text: header.key }), el("td", { text: header.value })]));
    });
    table.append(body);
    return table;
  }

  function renderHeaders(host, result) {
    host.append(headersTable(result.headers));
  }

  function renderCookies(host, tab, result) {
    const state = viewState(tab);
    const showAll = !!state.cookieShowAll;
    const url = (result && (result.finalUrl || result.url)) || (tab && tab.url) || "";
    const setCookies = (result && result.setCookies) || [];
    const matched = store.cookiesForUrl ? store.cookiesForUrl(url) : [];
    const allJar = (store.state && store.state.cookieJar) || [];
    const rows = showAll ? allJar : matched;

    const toolbar = el("div", { class: "hc-body-toolbar" });
    toolbar.append(el("span", {
      class: "hc-hint",
      text: t("cookieJar.summary", { jar: allJar.length, match: matched.length })
    }));
    toolbar.append(el("span", { class: "hc-grow" }));
    toolbar.append(el("button", {
      class: `hc-btn hc-btn-sm hc-btn-ghost${showAll ? " is-on" : ""}`,
      type: "button",
      text: showAll ? t("cookieJar.showMatched") : t("cookieJar.showAll"),
      on: {
        click: () => {
          state.cookieShowAll = !showAll;
          render();
        }
      }
    }));
    toolbar.append(el("button", {
      class: "hc-btn hc-btn-sm hc-btn-ghost", type: "button", text: t("cookieJar.clearDomain"),
      disabled: !matched.length,
      on: {
        click: () => {
          const domain = matched[0] && matched[0].domain;
          if (!domain) return;
          store.clearCookieJar(domain);
          util.toast(t("cookieJar.clearedDomain", { domain }));
          render();
        }
      }
    }));
    toolbar.append(el("button", {
      class: "hc-btn hc-btn-sm hc-btn-ghost", type: "button", text: t("cookieJar.clearAll"),
      disabled: !allJar.length,
      on: {
        click: async () => {
          if (!await util.confirmDialog({
            title: t("cookieJar.clearAll"),
            message: t("cookieJar.clearAllConfirm")
          })) return;
          store.clearCookieJar();
          util.toast(t("cookieJar.clearedAll"));
          render();
        }
      }
    }));
    host.append(toolbar);

    if (setCookies.length) {
      host.append(el("h4", { class: "hc-cookie-section-title", text: t("cookieJar.thisResponse") }));
      const list = el("div", { class: "hc-list" });
      setCookies.forEach((cookie) => {
        list.append(el("div", { class: "hc-list-item" }, [
          el("span", { class: "hc-list-title", text: cookie })
        ]));
      });
      host.append(list);
    }

    host.append(el("h4", {
      class: "hc-cookie-section-title",
      text: showAll ? t("cookieJar.jarTitle") : t("cookieJar.matchedTitle")
    }));
    if (!rows.length) {
      host.append(el("div", {
        class: "hc-hint",
        text: allJar.length ? t("cookieJar.noMatch") : t("cookieJar.empty")
      }));
      return;
    }
    const table = el("table", { class: "hc-table" });
    table.append(el("thead", {}, [el("tr", {}, [
      el("th", { text: t("cookieJar.name") }),
      el("th", { text: t("cookieJar.value") }),
      el("th", { text: t("cookieJar.domain") }),
      el("th", { text: t("cookieJar.path") }),
      el("th", { text: "" })
    ])]));
    const tbody = el("tbody", {});
    rows.slice().reverse().forEach((row) => {
      tbody.append(el("tr", {}, [
        el("td", { text: row.name || "" }),
        el("td", { class: "hc-cookie-value", text: row.value || "" }),
        el("td", { text: row.domain || "" }),
        el("td", { text: row.path || "/" }),
        el("td", {}, [
          el("button", {
            class: "hc-btn hc-btn-sm hc-btn-ghost", type: "button", text: t("action.delete"),
            on: {
              click: () => {
                store.deleteCookie(row.id);
                render();
              }
            }
          })
        ])
      ]));
    });
    table.append(tbody);
    host.append(table);
  }

  function renderRequest(host, result) {
    host.append(el("div", { class: "hc-hint", text: `${result.method} ${result.finalUrl || result.url}` }));
    host.append(el("h4", { text: t("response.sentHeaders") }));
    host.append(headersTable(result.requestHeaders));
    if (result.requestBodyPreview) {
      host.append(el("h4", { text: t("response.sentBody") }));
      host.append(el("pre", { class: "hc-code", text: result.requestBodyPreview }));
    }
    if ((result.redirects || []).length) {
      host.append(el("h4", { text: t("response.redirects") }));
      const list = el("div", { class: "hc-list" });
      result.redirects.forEach((hop) => {
        list.append(el("div", { class: "hc-list-item" }, [
          el("span", { class: "hc-tag", text: String(hop.status) }),
          el("span", { class: "hc-list-title", text: hop.location })
        ]));
      });
      host.append(list);
    }
  }

  /* Live progress while a request is in flight. */
  function subscribeProgress() {
    if (progressUnsubscribe) return;
    progressUnsubscribe = HC.bridge.onProgress((params) => {
      const tab = store.state.tabs.find((item) => item.sending && item.requestId === params.requestId);
      if (!tab) return;
      tab.progress = params;
      if (store.state.activeTabId !== tab.id) return;
      const node = util.$("#response-progress");
      if (node) node.textContent = formatProgress(params);
      else render();
    });
  }

  function setSending(tab, sending, requestId) {
    tab.sending = sending;
    tab.requestId = requestId || "";
    tab.progress = null;
    if (sending) subscribeProgress();
  }

  window.HC.viewResponse = { render, setSending, focusSearch };
})();
