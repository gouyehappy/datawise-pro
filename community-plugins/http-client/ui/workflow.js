/* Folder workflow runner: sidecar owns the loop; UI configures and streams logs. */

(function () {
  const util = HC.util;
  const store = HC.store;
  const bridge = HC.bridge;
  const t = (key, params) => HC.i18n.t(key, params);
  const el = util.el;

  const state = {
    runId: "",
    folderId: "",
    folderName: "",
    status: "idle",
    mode: "forever",
    rounds: 10,
    intervalMs: 5000,
    onError: "stop",
    authStepId: "",
    round: 0,
    stepIndex: 0,
    stepName: "",
    okCount: 0,
    failCount: 0,
    stepCount: 0,
    logs: [],
    open: false,
    fullscreen: false,
    phase: "idle", /* idle | configure | running */
    steps: [],
    stepProgress: [],
    logFilter: "all", /* all | err | script */
    lastError: "",
    /** Data-driven run: raw editor text + parsed rows sent to the sidecar. */
    datasetText: "",
    dataset: [],
    currentDatasetRow: null
  };

  function resetStepProgress(steps) {
    state.stepProgress = (steps || []).map((step) => ({
      id: step.id,
      name: step.name,
      method: step.method || "GET",
      runPolicy: step.runPolicy === "once" ? "once" : "each",
      state: "pending",
      status: 0,
      ms: 0,
      error: "",
      bodyPreview: "",
      tests: []
    }));
  }

  function updateStepProgress(stepId, patch) {
    const row = state.stepProgress.find((item) => item.id === stepId);
    if (!row) return;
    Object.assign(row, patch || {});
  }

  function notifyLayout() {
    if (typeof HC.app !== "undefined" && HC.app.applyLayout) HC.app.applyLayout();
    else if (window.HC && HC._applyLayout) HC._applyLayout();
  }

  const MAX_LOGS = 500;
  let unsubProgress = null;
  let unsubVariables = null;
  let formApi = null;
  /** Stable DOM for live run view — avoid full rebuild (flicker). */
  let runDom = null;
  let panelMode = ""; /* "" | configure | live | idle */

  function collectRequests(items, out) {
    (items || []).forEach((item) => {
      if (!item) return;
      if (item.kind === "folder") collectRequests(item.items, out);
      else if (item.kind === "request") out.push(item);
    });
  }

  function folderSteps(folderId) {
    const located = store.locate(folderId);
    if (!located || located.item.kind !== "folder") return { folder: null, steps: [] };
    const requests = [];
    collectRequests(located.item.items, requests);
    const steps = requests
      .filter((item) => {
        const type = HC.clients
          ? HC.clients.normalizeClientType(item)
          : (item.clientType || "http");
        return type === "http" || type === "graphql";
      })
      .map((item) => serializeStep(item));
    return { folder: located.item, collection: located.collection, steps };
  }

  function serializeStep(saved) {
    const draft = {
      method: saved.method || "GET",
      url: saved.url || "",
      params: JSON.parse(JSON.stringify(saved.params || [])),
      pathParams: JSON.parse(JSON.stringify(saved.pathParams || [])),
      headers: JSON.parse(JSON.stringify(saved.headers || [])),
      cookies: JSON.parse(JSON.stringify(saved.cookies || [])),
      body: Object.assign({ mode: "none", raw: "", fields: [] }, JSON.parse(JSON.stringify(saved.body || {}))),
      auth: Object.assign({ type: "none" }, JSON.parse(JSON.stringify(saved.auth || {}))),
      options: Object.assign(store.emptyRequest().options, saved.options || {}),
      scripts: Object.assign({ pre: "", post: "" }, JSON.parse(JSON.stringify(saved.scripts || {}))),
      clientType: HC.clients ? HC.clients.normalizeClientType(saved) : (saved.clientType || "http"),
      graphql: Object.assign({ query: "", variables: "{}" }, JSON.parse(JSON.stringify(saved.graphql || {})))
    };
    if (draft.clientType === "graphql" && HC.clients && HC.clients.syncGraphqlBody) {
      HC.clients.syncGraphqlBody(draft);
    }
    if (HC.viewRequest && HC.viewRequest.syncUrlFromParams) {
      HC.viewRequest.syncUrlFromParams(draft);
    }
    return {
      id: saved.id,
      name: saved.name || saved.method || "request",
      clientType: draft.clientType,
      method: draft.method,
      url: draft.url,
      headers: draft.headers,
      params: draft.params,
      pathParams: draft.pathParams,
      cookies: draft.cookies,
      body: draft.body,
      auth: draft.auth,
      options: draft.options,
      scripts: draft.scripts,
      runPolicy: saved.runPolicy === "once" ? "once" : "each"
    };
  }

  function pushLog(entry) {
    const row = Object.assign({ at: Date.now(), id: util.uid("wlog") }, entry);
    state.logs.push(row);
    if (state.logs.length > MAX_LOGS) state.logs.splice(0, state.logs.length - MAX_LOGS);
    if (runDom && runDom.logEl && panelMode !== "configure") {
      appendLogNode(row, true);
      patchStrip();
    } else {
      scheduleRender();
    }
  }

  let renderQueued = false;
  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      renderPanel();
    });
  }

  function statusLabel() {
    return t("workflow.status." + (state.status || "idle"));
  }

  function stripTone() {
    if (state.status === "failed" || state.failCount > 0) return "is-err";
    if (state.status === "running" || state.status === "paused" || state.status === "stopping") return "is-run";
    return "is-ok";
  }

  function logPassesFilter(entry) {
    const filter = state.logFilter || "all";
    if (filter === "err") return entry.kind === "err";
    if (filter === "script") return entry.kind === "script";
    return true;
  }

  function formatClock(ts) {
    const d = new Date(ts || Date.now());
    const p = (n) => (n < 10 ? "0" : "") + n;
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }

  function kindLabel(kind) {
    if (kind === "ok") return "OK";
    if (kind === "err") return "ERR";
    if (kind === "script") return "JS";
    if (kind === "step") return "RUN";
    if (kind === "round") return "R";
    return "·";
  }

  function buildLogNode(entry) {
    const kind = entry.kind || "info";
    const line = el("div", {
      class: `hc-workflow-log-line is-${kind}${kind === "round" ? " is-sep" : ""}`,
      "data-log-id": entry.id || ""
    });
    line.append(el("span", { class: "hc-workflow-log-time", text: formatClock(entry.at) }));
    line.append(el("span", { class: "hc-workflow-log-kind", text: kindLabel(kind) }));
    const main = el("div", { class: "hc-workflow-log-main" });
    main.append(el("div", { class: "hc-workflow-log-text", text: entry.text }));
    if (entry.detail) {
      const detail = el("pre", { class: "hc-workflow-log-detail", hidden: true, text: entry.detail });
      const actions = el("div", { class: "hc-workflow-log-actions" }, [
        el("button", {
          type: "button",
          class: "hc-workflow-log-toggle",
          text: t("workflow.log.showBody"),
          on: {
            click: (event) => {
              const open = detail.hidden;
              detail.hidden = !open;
              event.currentTarget.textContent = open ? t("workflow.log.hideBody") : t("workflow.log.showBody");
            }
          }
        }),
        el("button", {
          type: "button",
          class: "hc-workflow-log-copy",
          text: t("action.copy"),
          on: {
            click: async () => {
              try {
                await bridge.copy(entry.detail);
                util.toast(t("toast.copied"));
              } catch (error) {
                util.toast(String((error && error.message) || error));
              }
            }
          }
        })
      ]);
      main.append(actions, detail);
    }
    line.append(main);
    return line;
  }

  function appendLogNode(entry, newestFirst) {
    if (!runDom || !runDom.logEl) return;
    if (!logPassesFilter(entry)) return;
    const empty = runDom.logEl.querySelector(".hc-workflow-log-empty");
    if (empty) empty.remove();
    const node = buildLogNode(entry);
    const scroller = runDom.logEl;
    const stickTop = newestFirst && scroller.scrollTop <= 8;
    if (newestFirst) scroller.insertBefore(node, scroller.firstChild);
    else scroller.appendChild(node);
    while (scroller.childElementCount > MAX_LOGS) {
      if (newestFirst) scroller.removeChild(scroller.lastChild);
      else scroller.removeChild(scroller.firstChild);
    }
    if (stickTop) scroller.scrollTop = 0;
  }

  function rebuildLogList() {
    if (!runDom || !runDom.logEl) return;
    util.clear(runDom.logEl);
    const rows = filteredLogs().slice().reverse();
    if (!rows.length) {
      runDom.logEl.append(el("div", { class: "hc-hint hc-workflow-log-empty", text: t("workflow.log.empty") }));
      return;
    }
    rows.forEach((entry) => appendLogNode(entry, false));
  }

  function patchStrip() {
    if (!runDom || !runDom.strip) return;
    runDom.strip.className = `hc-workflow-strip ${stripTone()}`;
    if (runDom.stripStatus) runDom.stripStatus.textContent = statusLabel();
    if (runDom.stripRound) runDom.stripRound.textContent = t("workflow.strip.round", { round: state.round || 0 });
    if (runDom.stripCounts) {
      runDom.stripCounts.textContent = t("workflow.strip.counts", { ok: state.okCount, fail: state.failCount });
    }
    if (runDom.stripMode) {
      runDom.stripMode.textContent = t("workflow.meta.mode", {
        mode: t("workflow.mode." + (state.mode || "once")),
        interval: state.intervalMs
      });
    }
  }

  function patchProgress() {
    if (!runDom || !runDom.progress) return;
    const list = runDom.progress;
    if (!state.stepProgress.length) {
      util.clear(list);
      list.append(el("div", { class: "hc-hint", text: t("workflow.progress.empty") }));
      return;
    }
    const existing = new Map();
    Array.from(list.querySelectorAll(".hc-workflow-progress-row")).forEach((node) => {
      existing.set(node.getAttribute("data-step-id"), node);
    });
    state.stepProgress.forEach((step, index) => {
      let row = existing.get(step.id);
      const statusText = step.state === "ok" ? String(step.status || "OK")
        : step.state === "err" ? String(step.status || "ERR")
          : step.state === "skip" ? t("workflow.progress.skip")
            : step.state === "running" ? "…"
              : "—";
      const meta = step.ms ? `${statusText} · ${step.ms}ms` : statusText;
      if (!row) {
        const badge = step.runPolicy === "once"
          ? el("span", { class: "hc-workflow-badge", text: t("workflow.runPolicy.onceShort") })
          : null;
        row = el("button", {
          type: "button",
          class: `hc-workflow-progress-row is-${step.state || "pending"}`,
          "data-step-id": step.id,
          title: t("workflow.progress.openStep"),
          on: { click: () => openStepRequest(step.id) }
        }, [
          el("span", { class: "hc-workflow-progress-dot", "aria-hidden": "true" }),
          el("span", { class: "hc-workflow-step-index", text: String(index + 1) }),
          el("span", { class: "hc-workflow-progress-main" }, [
            el("span", { class: "hc-workflow-step-name", text: `${step.method}  ${step.name}` }),
            badge
          ].filter(Boolean)),
          el("span", { class: "hc-workflow-progress-status", text: meta })
        ]);
        list.append(row);
      } else {
        row.className = `hc-workflow-progress-row is-${step.state || "pending"}`;
        const statusEl = row.querySelector(".hc-workflow-progress-status");
        if (statusEl) statusEl.textContent = meta;
        const indexEl = row.querySelector(".hc-workflow-step-index");
        if (indexEl) indexEl.textContent = String(index + 1);
        existing.delete(step.id);
      }
    });
    existing.forEach((node) => node.remove());
  }

  function patchAlert() {
    if (!runDom || !runDom.alertHost) return;
    util.clear(runDom.alertHost);
    if (state.lastError && (state.status === "failed" || state.failCount > 0)) {
      runDom.alertHost.append(el("div", { class: "hc-workflow-alert" }, [
        el("div", { class: "hc-workflow-alert-title", text: t("workflow.alert.failed") }),
        el("pre", { class: "hc-workflow-alert-body", text: state.lastError })
      ]));
    }
  }

  function isActiveRun() {
    return state.status === "running" || state.status === "paused" || state.status === "stopping";
  }

  function patchChrome() {
    if (!runDom) return;
    const active = isActiveRun();
    const pausing = state.status === "paused";
    const stopping = state.status === "stopping";
    if (runDom.pauseBtn) {
      runDom.pauseBtn.disabled = !active || stopping;
      runDom.pauseBtn.textContent = pausing ? t("workflow.resume") : t("workflow.pause");
    }
    if (runDom.stopBtn) {
      runDom.stopBtn.disabled = !active || stopping;
    }
    if (runDom.startBtn) {
      runDom.startBtn.disabled = active;
    }
    if (runDom.exportBtn) {
      runDom.exportBtn.disabled = !(state.logs || []).length && !(state.stepProgress || []).length;
    }
    if (runDom.intervalInput) {
      runDom.intervalInput.disabled = !(state.status === "running" || state.status === "paused");
    }
    if (runDom.intervalApply) {
      runDom.intervalApply.disabled = !(state.status === "running" || state.status === "paused");
    }
    if (runDom.liveControls) {
      runDom.liveControls.classList.toggle("is-disabled", !(state.status === "running" || state.status === "paused"));
    }
  }

  function refreshLiveParts() {
    if (panelMode !== "run" || !runDom) {
      scheduleRender();
      return;
    }
    patchStrip();
    patchProgress();
    patchAlert();
    patchChrome();
  }

  let lastVarsSignature = "";
  let varsEmitTimer = 0;
  function applyVariables(variables) {
    if (!variables || typeof variables !== "object") return;
    // The sidecar emits variables after every step. Skip no-op updates and
    // coalesce UI refreshes so long runs do not repaint the sidebar per step.
    const signature = JSON.stringify(variables);
    if (signature === lastVarsSignature) return;
    lastVarsSignature = signature;
    let environment = store.activeEnvironment();
    if (!environment) environment = store.createEnvironment(t("misc.scriptEnvironment"));
    const rows = environment.variables || (environment.variables = []);
    Object.keys(variables).forEach((key) => {
      const existing = rows.find((row) => row.key === key);
      if (existing) {
        existing.value = variables[key];
        existing.enabled = true;
      } else {
        rows.push({ key, value: variables[key], enabled: true });
      }
    });
    if (!rows.some((row) => !row.key)) rows.push({ key: "", value: "", enabled: true });
    store.schedulePersist();
    if (!varsEmitTimer) {
      varsEmitTimer = setTimeout(() => {
        varsEmitTimer = 0;
        store.emit("environments");
      }, 300);
    }
  }

  function ensureListeners() {
    if (!unsubProgress) {
      unsubProgress = bridge.onWorkflow((method, params) => {
        if (method === "workflow/progress") onProgress(params || {});
        else if (method === "workflow/variables") applyVariables((params || {}).variables);
      });
    }
  }

  function onProgress(params) {
    if (state.runId && params.runId && params.runId !== state.runId) return;
    if (params.runId) state.runId = params.runId;
    if (params.folderName) state.folderName = params.folderName;
    if (params.folderId) state.folderId = params.folderId;
    state.round = params.round || 0;
    state.stepIndex = typeof params.stepIndex === "number" ? params.stepIndex : state.stepIndex;
    state.stepName = params.stepName || state.stepName;
    state.okCount = params.okCount || 0;
    state.failCount = params.failCount || 0;
    state.stepCount = params.stepCount || state.stepCount;
    if (params.status) state.status = params.status;

    const phase = params.phase || "";
    if (phase === "starting") {
      pushLog({ kind: "info", text: t("workflow.log.starting", { name: state.folderName || "-" }) });
    } else if (phase === "round-start") {
      resetStepProgress(state.steps);
      pushLog({ kind: "round", text: t("workflow.log.roundStart", { round: state.round }) });
      if (params.datasetRow && typeof params.datasetRow === "object") {
        state.currentDatasetRow = params.datasetRow;
        const pairs = Object.keys(params.datasetRow)
          .map((key) => `${key}=${params.datasetRow[key]}`).join(", ");
        pushLog({
          kind: "info",
          text: t("dataset.row", {
            index: params.datasetIndex || 0,
            total: params.datasetTotal || 0,
            values: pairs
          })
        });
      } else {
        state.currentDatasetRow = null;
      }
      refreshLiveParts();
    } else if (phase === "step-start") {
      updateStepProgress(
        params.stepId || (state.stepProgress[state.stepIndex] && state.stepProgress[state.stepIndex].id),
        { state: "running", status: 0, ms: 0, error: "", bodyPreview: "" }
      );
      // Progress row shows current step — skip noisy "开始" log lines.
      refreshLiveParts();
    } else if (phase === "step-skip") {
      updateStepProgress(params.stepId || (state.stepProgress[state.stepIndex] && state.stepProgress[state.stepIndex].id), {
        state: "skip"
      });
      refreshLiveParts();
    } else if (phase === "paused") {
      state.status = "paused";
      pushLog({ kind: "info", text: t("workflow.log.paused") });
      refreshLiveParts();
    } else if (phase === "resumed") {
      state.status = "running";
      pushLog({ kind: "info", text: t("workflow.log.resumed") });
      refreshLiveParts();
    } else if (phase === "auth-retry") {
      pushLog({
        kind: "info",
        text: t("workflow.log.authRetry", {
          name: params.authStepName || params.authStepId || "-"
        })
      });
    } else if (phase === "step-done") {
      const ok = !!params.ok;
      const stepId = params.stepId || (state.stepProgress[state.stepIndex] && state.stepProgress[state.stepIndex].id);
      updateStepProgress(stepId, {
        state: ok ? "ok" : "err",
        status: params.status || 0,
        ms: params.durationMs || 0,
        error: params.error || "",
        bodyPreview: params.bodyPreview || "",
        tests: Array.isArray(params.tests) ? params.tests : []
      });
      if (!ok) {
        state.lastError = params.error
          || t("workflow.log.stepDone", {
            round: state.round,
            name: state.stepName || "-",
            status: params.status || "-",
            ms: params.durationMs || 0,
            error: ""
          });
        if (params.bodyPreview) state.lastError += "\n" + String(params.bodyPreview).slice(0, 400);
      }
      pushLog({
        kind: ok ? "ok" : "err",
        text: t("workflow.log.stepDone", {
          round: state.round,
          name: state.stepName || "-",
          status: params.status || "-",
          ms: params.durationMs || 0,
          error: params.error ? (" — " + params.error) : ""
        }),
        detail: !ok && params.bodyPreview ? String(params.bodyPreview) : "",
        stepId
      });
      (params.tests || []).forEach((test) => {
        pushLog({
          kind: test.ok ? "ok" : "err",
          text: (test.ok ? "PASS " : "FAIL ") + String(test.name || "test")
            + (test.message ? " — " + test.message : ""),
          stepId
        });
      });
      (params.scriptLogs || []).forEach((line) => {
        pushLog({ kind: "script", text: String(line) });
      });
      refreshLiveParts();
    } else if (phase === "round-done") {
      if (state.round === 1 || state.round % 10 === 0) {
        pushLog({ kind: "round", text: t("workflow.log.roundDone", { round: state.round }) });
      }
      refreshLiveParts();
    } else if (phase === "finished" || phase === "stopped" || phase === "failed") {
      state.status = phase;
      state.phase = "idle";
      if (phase === "failed" && params.message) state.lastError = params.message;
      if (phase === "finished" || phase === "stopped") state.lastError = state.lastError || "";
      pushLog({
        kind: phase === "finished" ? "ok" : (phase === "stopped" ? "info" : "err"),
        text: t("workflow.log." + phase, {
          ok: state.okCount,
          fail: state.failCount,
          message: params.message || ""
        })
      });
      // Keep the same DOM — only patch chrome/status (avoids footer pop-in flicker).
      refreshLiveParts();
    } else {
      refreshLiveParts();
    }
  }

  function openRunDialog(folderId) {
    ensureListeners();
    const packed = folderSteps(folderId);
    if (!packed.folder) {
      util.toast(t("workflow.err.noFolder"), "error");
      return;
    }
    if (!packed.steps.length) {
      util.toast(t("workflow.err.noSteps"), "error");
      return;
    }
    if (!bridge.backendReady) {
      util.toast(t("err.backendHint"), "error");
      return;
    }

    const prefs = packed.folder.workflowPrefs || {};
    state.open = true;
    state.phase = "configure";
    state.folderId = packed.folder.id;
    state.folderName = packed.folder.name;
    state.steps = packed.steps;
    state.stepCount = packed.steps.length;
    state.logs = [];
    state.lastError = "";
    state.status = "idle";
    state.mode = prefs.mode || "forever";
    state.rounds = Number(prefs.rounds) > 0 ? Number(prefs.rounds) : 10;
    state.intervalMs = Number.isFinite(Number(prefs.intervalMs)) ? Number(prefs.intervalMs) : 5000;
    state.onError = prefs.onError || "stop";
    state.datasetText = prefs.datasetText || "";
    state.dataset = parseDataset(state.datasetText).rows;
    state.currentDatasetRow = null;
    state.authStepId = (prefs.authStepId && packed.steps.some((step) => step.id === prefs.authStepId))
      ? prefs.authStepId
      : (packed.steps[0] ? packed.steps[0].id : "");
    state.round = 0;
    state.okCount = 0;
    state.failCount = 0;
    state.logFilter = "all";
    resetStepProgress(packed.steps);
    formApi = null;
    renderPanel();
    notifyLayout();
  }

  function saveFolderPrefs(folderId, prefs) {
    const located = store.locate(folderId);
    if (!located || located.item.kind !== "folder") return;
    located.item.workflowPrefs = Object.assign({}, located.item.workflowPrefs || {}, prefs || {});
    store.schedulePersist();
  }

  /** Data set editor accepts a JSON array, CSV with a header row, or
      one `key=value&key2=value2` line per record. */
  function parseDataset(text) {
    const raw = String(text || "").trim();
    if (!raw) return { rows: [], error: "" };
    if (raw.charAt(0) === "[" || raw.charAt(0) === "{") {
      try {
        const data = JSON.parse(raw);
        const arr = Array.isArray(data) ? data : [data];
        const rows = arr.map((item) => {
          const out = {};
          if (item && typeof item === "object" && !Array.isArray(item)) {
            Object.keys(item).forEach((key) => {
              out[key] = item[key] == null ? "" : String(item[key]);
            });
          } else if (Array.isArray(item)) {
            item.forEach((value, index) => {
              out[`col${index + 1}`] = value == null ? "" : String(value);
            });
          }
          return out;
        }).filter((row) => Object.keys(row).length);
        return rows.length ? { rows, error: "" } : { rows: [], error: t("dataset.empty") };
      } catch (error) {
        return { rows: [], error: t("dataset.invalidJson", { message: (error && error.message) || String(error) }) };
      }
    }
    const splitCsv = (line) => {
      const cells = [];
      let cell = "";
      let quoted = false;
      for (let i = 0; i < line.length; i += 1) {
        const ch = line.charAt(i);
        if (ch === '"') {
          if (quoted && line.charAt(i + 1) === '"') { cell += '"'; i += 1; }
          else quoted = !quoted;
        } else if (ch === "," && !quoted) { cells.push(cell); cell = ""; }
        else cell += ch;
      }
      cells.push(cell);
      return cells.map((value) => value.trim());
    };
    const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return { rows: [], error: "" };
    if (lines[0].indexOf(",") >= 0 && lines[0].indexOf("=") < 0) {
      const headers = splitCsv(lines[0]);
      const rows = lines.slice(1).map((line) => {
        const cells = splitCsv(line);
        const out = {};
        headers.forEach((key, index) => { if (key) out[key] = cells[index] || ""; });
        return out;
      }).filter((row) => Object.keys(row).length);
      return rows.length ? { rows, error: "" } : { rows: [], error: t("dataset.empty") };
    }
    const rows = lines.map((line) => {
      const out = {};
      line.split(/[&,]/).forEach((part) => {
        const at = part.indexOf("=");
        if (at < 0) return;
        const key = part.slice(0, at).trim();
        if (key) out[key] = part.slice(at + 1).trim();
      });
      return out;
    }).filter((row) => Object.keys(row).length);
    return rows.length ? { rows, error: "" } : { rows: [], error: t("dataset.empty") };
  }

  function readForm() {
    const base = !formApi ? {
      mode: state.mode,
      rounds: state.rounds,
      intervalMs: state.intervalMs,
      onError: state.onError,
      authStepId: state.authStepId
    } : {
      mode: formApi.mode.value || "once",
      rounds: Math.max(1, Number(formApi.rounds.value) || 1),
      intervalMs: Math.max(0, Number(formApi.interval.value) || 0),
      onError: formApi.onError.value || "stop",
      authStepId: formApi.auth.value || ""
    };
    const datasetText = formApi ? formApi.dataset.value : (state.datasetText || "");
    const parsed = parseDataset(datasetText);
    return Object.assign(base, {
      dataset: parsed.error ? [] : parsed.rows,
      datasetText,
      datasetError: parsed.error
    });
  }

  function persistStepPolicies(steps) {
    (steps || []).forEach((step) => {
      const located = store.locate(step.id);
      if (!located || located.item.kind !== "request") return;
      located.item.runPolicy = step.runPolicy === "once" ? "once" : "each";
    });
    store.schedulePersist();
    store.emit("sidebar");
  }

  async function startFromPanel() {
    const opts = readForm();
    if (opts.datasetError) {
      util.toast(opts.datasetError, "error");
      return;
    }
    Object.assign(state, opts);
    persistStepPolicies(state.steps);
    saveFolderPrefs(state.folderId, {
      mode: opts.mode,
      rounds: opts.rounds,
      intervalMs: opts.intervalMs,
      onError: opts.onError,
      authStepId: opts.authStepId,
      datasetText: opts.datasetText
    });
    await startRun({
      folderId: state.folderId,
      folderName: state.folderName,
      steps: state.steps,
      mode: opts.mode,
      rounds: opts.rounds,
      intervalMs: opts.intervalMs,
      onError: opts.onError,
      authStepId: opts.authStepId,
      dataset: opts.dataset
    });
  }

  async function startRun(options) {
    ensureListeners();
    state.open = true;
    state.phase = "running";
    state.logs = [];
    state.lastError = "";
    state.status = "running";
    state.folderId = options.folderId;
    state.folderName = options.folderName;
    state.mode = options.mode;
    state.rounds = options.rounds;
    state.intervalMs = options.intervalMs;
    state.onError = options.onError;
    state.authStepId = options.authStepId || "";
    state.dataset = Array.isArray(options.dataset) ? options.dataset : [];
    state.datasetText = options.datasetText || "";
    state.currentDatasetRow = null;
    state.round = 0;
    state.okCount = 0;
    state.failCount = 0;
    state.stepCount = options.steps.length;
    state.steps = options.steps;
    state.stepName = "";
    state.runId = util.uid("run");
    state.logFilter = "all";
    resetStepProgress(options.steps);
    formApi = null;
    // Force a fresh run shell (new logs / chrome), even if a finished run view is open.
    runDom = null;
    panelMode = "";
    renderPanel();
    notifyLayout();

    try {
      const result = await bridge.workflowStart({
        runId: state.runId,
        folderId: options.folderId,
        folderName: options.folderName,
        mode: options.mode,
        rounds: options.rounds,
        intervalMs: options.intervalMs,
        onError: options.onError,
        authStepId: options.authStepId || "",
        variables: store.variableMap(),
        dataset: state.dataset,
        steps: options.steps
      });
      if (result && result.runId) state.runId = result.runId;
      util.toast(t("workflow.started"), "success");
    } catch (error) {
      state.status = "failed";
      state.phase = "idle";
      pushLog({
        kind: "err",
        text: t("workflow.err.start", { message: (error && error.message) || String(error) })
      });
      util.toast(t("workflow.err.start", { message: (error && error.message) || String(error) }), "error");
    }
  }

  async function stopRun() {
    if (!state.runId) return;
    try {
      await bridge.workflowStop(state.runId);
      state.status = "stopping";
      refreshLiveParts();
    } catch (error) {
      util.toast(String((error && error.message) || error), "error");
    }
  }

  async function togglePause() {
    if (!state.runId) return;
    const pause = state.status !== "paused";
    try {
      await bridge.workflowPause(state.runId, pause);
      state.status = pause ? "paused" : "running";
      refreshLiveParts();
    } catch (error) {
      util.toast(String((error && error.message) || error), "error");
    }
  }

  async function applyLiveInterval() {
    if (!state.runId) return;
    const value = Math.max(0, Number(state.intervalMs) || 0);
    try {
      await bridge.workflowSetInterval(state.runId, value);
      saveFolderPrefs(state.folderId, { intervalMs: value });
      util.toast(t("workflow.intervalApplied"), "success");
    } catch (error) {
      util.toast(String((error && error.message) || error), "error");
    }
  }

  async function refreshStatus() {
    if (!bridge.backendReady) return;
    try {
      const status = await bridge.workflowStatus();
      if (status && status.active && status.run) {
        const run = status.run;
        state.open = true;
        state.phase = "running";
        state.runId = run.runId || state.runId;
        state.folderId = run.folderId || "";
        state.folderName = run.folderName || "";
        state.status = run.status || "running";
        state.mode = run.mode || state.mode;
        state.rounds = run.rounds || state.rounds;
        state.intervalMs = run.intervalMs || state.intervalMs;
        state.onError = run.onError || state.onError;
        state.round = run.round || 0;
        state.stepIndex = run.stepIndex || 0;
        state.stepName = run.stepName || "";
        state.okCount = run.okCount || 0;
        state.failCount = run.failCount || 0;
        state.stepCount = run.stepCount || 0;
        if (run.variables) applyVariables(run.variables);
        renderPanel();
      }
    } catch (error) {
      /* ignore — workbench may open before sidecar is ready */
    }
  }

  function closePanel() {
    state.open = false;
    state.fullscreen = false;
    state.phase = "idle";
    formApi = null;
    renderPanel();
    notifyLayout();
  }

  function toggleFullscreen() {
    state.fullscreen = !state.fullscreen;
    const pane = util.$("#workflow-pane");
    if (pane) pane.classList.toggle("is-fullscreen", state.fullscreen);
    if (runDom && runDom.fsBtn) {
      runDom.fsBtn.textContent = state.fullscreen
        ? t("workflow.exitFullscreen")
        : t("action.fullscreen");
      runDom.fsBtn.title = runDom.fsBtn.textContent;
    }
    notifyLayout();
  }

  function textToBase64(text) {
    const value = String(text || "");
    try {
      return btoa(unescape(encodeURIComponent(value)));
    } catch (error) {
      try { return btoa(value); } catch (err) { return ""; }
    }
  }

  function openStepRequest(stepId) {
    if (!stepId) return;
    const located = store.locate(stepId);
    if (!located || located.item.kind !== "request") return;
    store.openSavedRequest(located.collection.id, stepId);
    const step = state.stepProgress.find((item) => item.id === stepId);
    const tab = store.activeTab();
    if (tab && step) {
      const body = step.bodyPreview || "";
      const hasHttp = Number(step.status) > 0;
      if (!hasHttp && step.error && !body) {
        tab.response = {
          ok: false,
          error: { kind: "network", message: step.error },
          status: 0,
          statusText: "",
          durationMs: step.ms || 0,
          sizeBytes: 0,
          headers: [],
          url: tab.url || "",
          finalUrl: tab.url || ""
        };
      } else if (hasHttp || body || step.state === "ok" || step.state === "err") {
        const preview = body || (step.error ? String(step.error) : "");
        tab.response = {
          ok: step.state !== "err" || hasHttp,
          status: step.status || 0,
          statusText: step.state === "ok" ? "OK" : (step.error || ""),
          durationMs: step.ms || 0,
          sizeBytes: preview.length,
          bodyPreviewBase64: textToBase64(preview),
          bodyPreviewBytes: preview.length,
          contentType: "application/json",
          headers: [],
          url: tab.url || "",
          finalUrl: tab.url || "",
          truncated: false
        };
        if (step.state === "err" && !hasHttp) tab.response.ok = false;
      }
      tab.fullBody = null;
    }
    if (HC.viewRequest) HC.viewRequest.render();
    if (HC.viewResponse) HC.viewResponse.render();
    if (HC.viewSidebar && HC.viewSidebar.syncActive) HC.viewSidebar.syncActive();
  }

  function filteredLogs() {
    const filter = state.logFilter || "all";
    if (filter === "err") return state.logs.filter((item) => item.kind === "err");
    if (filter === "script") return state.logs.filter((item) => item.kind === "script");
    return state.logs;
  }

  function renderProgress(host) {
    const wrap = el("div", { class: "hc-workflow-section" }, [
      el("div", { class: "hc-workflow-section-label", text: t("workflow.progress.title") })
    ]);
    const list = el("div", { class: "hc-workflow-progress" });
    wrap.append(list);
    host.append(wrap);
    runDom.progress = list;
    patchProgress();
  }

  function renderLogLines(host) {
    const head = el("div", { class: "hc-workflow-log-head" }, [
      el("div", { class: "hc-workflow-section-label", text: t("workflow.log.title") })
    ]);
    const toolbar = el("div", { class: "hc-workflow-log-toolbar" });
    ["all", "err", "script"].forEach((key) => {
      toolbar.append(el("button", {
        type: "button",
        class: `hc-workflow-filter${state.logFilter === key ? " is-on" : ""}`,
        text: t("workflow.logFilter." + key),
        on: {
          click: () => {
            state.logFilter = key;
            Array.from(toolbar.querySelectorAll(".hc-workflow-filter")).forEach((btn, idx) => {
              btn.classList.toggle("is-on", ["all", "err", "script"][idx] === state.logFilter);
            });
            rebuildLogList();
          }
        }
      }));
    });
    head.append(toolbar);
    host.append(head);
    const log = el("div", { class: "hc-workflow-log" });
    host.append(log);
    runDom.logEl = log;
    rebuildLogList();
  }

  function renderConfigForm(host) {
    const modeDd = util.createSelect({
      className: "hc-dd-block",
      value: state.mode || "forever",
      items: [
        { value: "once", label: t("workflow.mode.once") },
        { value: "rounds", label: t("workflow.mode.rounds") },
        { value: "forever", label: t("workflow.mode.forever") }
      ],
      onChange: (value) => {
        state.mode = value;
        if (formApi && formApi.roundsRow) formApi.roundsRow.hidden = value !== "rounds";
      }
    });
    const roundsInput = el("input", {
      class: "hc-input", type: "number", min: "1", value: String(state.rounds || 10), step: "1"
    });
    const intervalInput = el("input", {
      class: "hc-input", type: "number", min: "0", value: String(state.intervalMs || 5000), step: "100"
    });
    const onErrorDd = util.createSelect({
      className: "hc-dd-block",
      value: state.onError || "stop",
      items: [
        { value: "stop", label: t("workflow.onError.stop") },
        { value: "continue", label: t("workflow.onError.continue") }
      ]
    });
    const authItems = [{ value: "", label: t("workflow.authStep.none") }].concat(
      (state.steps || []).map((step) => ({
        value: step.id,
        label: `${step.method || "GET"}  ${step.name}`
      }))
    );
    const authDd = util.createSelect({
      className: "hc-dd-block",
      value: state.authStepId || (state.steps[0] && state.steps[0].id) || "",
      items: authItems
    });

    const roundsRow = el("label", { class: "hc-field" }, [
      el("span", { class: "hc-field-label", text: t("workflow.rounds") }),
      roundsInput
    ]);
    roundsRow.hidden = modeDd.value !== "rounds";

    const form = el("div", { class: "hc-workflow-form" }, [
      el("div", {
        class: "hc-workflow-hint",
        text: t("workflow.dialogHint", { count: state.steps.length })
      })
    ]);
    form.append(el("div", {
      class: "hc-workflow-hint",
      text: t("workflow.orderHint")
    }));
    const list = el("div", { class: "hc-workflow-steps" });
    state.steps.forEach((step, index) => {
      if (!step.runPolicy) step.runPolicy = "each";
      const policyDd = util.createSelect({
        className: "hc-dd-block hc-workflow-policy",
        value: step.runPolicy === "once" ? "once" : "each",
        items: [
          { value: "each", label: t("workflow.runPolicy.each") },
          { value: "once", label: t("workflow.runPolicy.once") }
        ],
        onChange: (value) => {
          step.runPolicy = value === "once" ? "once" : "each";
        }
      });
      list.append(el("div", { class: "hc-workflow-step-row" }, [
        el("span", { class: "hc-workflow-step-index", text: String(index + 1) }),
        el("span", {
          class: "hc-workflow-step-name",
          text: `${step.method || "GET"}  ${step.name}`
        }),
        policyDd.root
      ]));
    });
    form.append(list);
    form.append(el("label", { class: "hc-field" }, [
      el("span", { class: "hc-field-label", text: t("workflow.mode") }),
      modeDd.root
    ]));
    form.append(roundsRow);
    form.append(el("label", { class: "hc-field" }, [
      el("span", { class: "hc-field-label", text: t("workflow.intervalMs") }),
      intervalInput
    ]));
    form.append(el("label", { class: "hc-field" }, [
      el("span", { class: "hc-field-label", text: t("workflow.onError") }),
      onErrorDd.root
    ]));
    form.append(el("label", { class: "hc-field" }, [
      el("span", { class: "hc-field-label", text: t("workflow.authStep") }),
      authDd.root
    ]));
    form.append(el("div", { class: "hc-workflow-hint", text: t("workflow.authStep.hint") }));
    form.append(el("div", { class: "hc-workflow-hint", text: t("workflow.preScript.hint") }));

    const datasetInput = el("textarea", {
      class: "hc-textarea hc-dataset-input",
      spellcheck: "false",
      value: state.datasetText || "",
      placeholder: t("dataset.placeholder")
    });
    const datasetInfo = el("div", { class: "hc-hint" });
    const refreshDatasetInfo = () => {
      const parsed = parseDataset(datasetInput.value);
      datasetInfo.textContent = parsed.error
        ? parsed.error
        : (parsed.rows.length
          ? t("dataset.rows", { count: parsed.rows.length })
          : t("dataset.hint"));
    };
    datasetInput.addEventListener("input", refreshDatasetInfo);
    refreshDatasetInfo();
    form.append(el("div", {
      class: "hc-field-label",
      style: { marginTop: "12px" },
      text: t("dataset.title")
    }));
    form.append(el("div", { class: "hc-hint", text: t("dataset.hint") }));
    form.append(datasetInput);
    form.append(datasetInfo);

    form.append(el("div", { class: "hc-workflow-footer" }, [
      el("button", {
        class: "hc-btn hc-btn-ghost", type: "button", text: t("action.cancel2"),
        on: { click: () => closePanel() }
      }),
      el("button", {
        class: "hc-btn hc-btn-primary", type: "button", text: t("workflow.start"),
        on: { click: () => startFromPanel() }
      })
    ]));

    formApi = {
      mode: modeDd,
      rounds: roundsInput,
      interval: intervalInput,
      onError: onErrorDd,
      auth: authDd,
      dataset: datasetInput,
      roundsRow
    };
    host.append(form);
  }

  function renderMeta(host) {
    const stripStatus = el("span", { class: "hc-workflow-strip-status", text: statusLabel() });
    const stripRound = el("span", { class: "hc-workflow-chip", text: t("workflow.strip.round", { round: state.round || 0 }) });
    const stripCounts = el("span", { class: "hc-workflow-chip", text: t("workflow.strip.counts", { ok: state.okCount, fail: state.failCount }) });
    const stripMode = el("span", {
      class: "hc-workflow-chip is-muted",
      text: t("workflow.meta.mode", {
        mode: t("workflow.mode." + (state.mode || "once")),
        interval: state.intervalMs
      })
    });
    const strip = el("div", { class: `hc-workflow-strip ${stripTone()}` }, [
      stripStatus, stripRound, stripCounts, stripMode
    ]);
    host.append(strip);
    const alertHost = el("div", { class: "hc-workflow-alert-host" });
    host.append(alertHost);

    const intervalInput = el("input", {
      class: "hc-input hc-input-sm",
      type: "number",
      min: "0",
      step: "100",
      value: String(state.intervalMs || 0)
    });
    intervalInput.addEventListener("change", () => {
      state.intervalMs = Math.max(0, Number(intervalInput.value) || 0);
    });
    const intervalApply = el("button", {
      class: "hc-btn hc-btn-ghost", type: "button", text: t("workflow.applyInterval"),
      on: { click: () => applyLiveInterval() }
    });
    const liveControls = el("div", { class: "hc-workflow-live-controls" }, [
      el("label", { class: "hc-field hc-field-inline" }, [
        el("span", { class: "hc-field-label", text: t("workflow.intervalMs") }),
        intervalInput
      ]),
      intervalApply
    ]);
    host.append(liveControls);

    runDom.strip = strip;
    runDom.stripStatus = stripStatus;
    runDom.stripRound = stripRound;
    runDom.stripCounts = stripCounts;
    runDom.stripMode = stripMode;
    runDom.alertHost = alertHost;
    runDom.liveControls = liveControls;
    runDom.intervalInput = intervalInput;
    runDom.intervalApply = intervalApply;
    patchAlert();
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function renderHtmlReport(report) {
    const stepRows = report.steps.map((step) => {
      const tests = (step.tests || []).map((test) => (
        `<li class="${test.ok ? "pass" : "fail"}">${test.ok ? "PASS" : "FAIL"} ${escapeHtml(test.name)}${test.message ? ` — ${escapeHtml(test.message)}` : ""}</li>`
      )).join("");
      return `<tr><td>${step.index}</td><td><code>${escapeHtml(step.method)}</code> ${escapeHtml(step.name)}</td>` +
        `<td class="${step.state === "err" ? "fail" : "pass"}">${escapeHtml(step.state)}</td>` +
        `<td>${escapeHtml(step.status || "-")}</td><td>${escapeHtml(step.ms || 0)} ms</td>` +
        `<td>${escapeHtml(step.error || "")}${tests ? `<ul class="tests">${tests}</ul>` : ""}</td></tr>`;
    }).join("");
    const logRows = report.logs.slice().reverse().map((entry) => {
      const time = entry.at ? new Date(entry.at).toISOString() : "";
      return `<li><time>${escapeHtml(time)}</time> <span class="kind">${escapeHtml(entry.kind || "info")}</span> ` +
        `${escapeHtml(entry.text)}${entry.detail ? `<pre>${escapeHtml(String(entry.detail).slice(0, 2000))}</pre>` : ""}</li>`;
    }).join("");
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>${escapeHtml(t("workflow.report.title"))} — ${escapeHtml(report.folderName || "-")}</title>` +
      `<style>
:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;padding:32px;background:#f7f8fa;color:#1f2329;font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
.wrap{max-width:980px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:28px}
h1{margin:0 0 6px;font-size:22px}h2{margin:28px 0 12px;font-size:16px;border-bottom:1px solid #e5e7eb;padding-bottom:6px}
.meta{display:flex;flex-wrap:wrap;gap:8px 20px;color:#5f6672;font-size:13px;margin-bottom:18px}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #eef0f2;vertical-align:top}
th{background:#fafbfc;color:#4b5563;font-weight:600}tr:nth-child(even) td{background:#fcfcfd}
code{background:#f1f3f5;padding:1px 5px;border-radius:4px;font-size:12px}
.pass{color:#137333}.fail{color:#c5221f}ul.tests{margin:6px 0 0;padding-left:18px}
.logs{list-style:none;padding:0;margin:0;font-size:12px}.logs li{padding:5px 0;border-bottom:1px dashed #eef0f2}
.logs time{color:#8a9099;margin-right:8px}.logs .kind{color:#5b6472;font-weight:600;margin-right:6px}
pre{white-space:pre-wrap;word-break:break-all;background:#f6f7f9;border-radius:6px;padding:8px;margin:6px 0 0;font-size:12px}
</style></head><body><div class="wrap">` +
      `<h1>${escapeHtml(t("workflow.report.title"))} — ${escapeHtml(report.folderName || "-")}</h1>` +
      `<div class="meta">` +
      `<span>${escapeHtml(t("workflow.report.status"))}: <b>${escapeHtml(report.status)}</b></span>` +
      `<span>${escapeHtml(t("workflow.report.rounds"))}: ${escapeHtml(report.rounds)}</span>` +
      `<span>${escapeHtml(t("workflow.report.counts"))}: ${escapeHtml(report.okCount)} / ${escapeHtml(report.failCount)}</span>` +
      `<span>${escapeHtml(t("workflow.report.interval"))}: ${escapeHtml(report.intervalMs)} ms</span>` +
      `<span>${escapeHtml(t("dataset.title"))}: ${escapeHtml(report.dataset.length)}</span>` +
      `<span>${escapeHtml(t("workflow.report.generated"))}: ${escapeHtml(report.generatedAt)}</span>` +
      `</div><h2>${escapeHtml(t("workflow.progress.title"))}</h2>` +
      `<table><thead><tr><th>#</th><th>${escapeHtml(t("workflow.report.step"))}</th><th>${escapeHtml(t("workflow.report.status"))}</th><th>HTTP</th><th>ms</th><th>${escapeHtml(t("workflow.report.tests"))}</th></tr></thead>` +
      `<tbody>${stepRows || `<tr><td colspan="6">-</td></tr>`}</tbody></table>` +
      `<h2>${escapeHtml(t("workflow.log.title"))}</h2><ul class="logs">${logRows || "<li>-</li>"}</ul>` +
      `</div></body></html>`;
  }

  function buildRunReport(format) {
    const report = {
      folderId: state.folderId,
      folderName: state.folderName,
      status: state.status,
      mode: state.mode,
      rounds: state.round,
      intervalMs: state.intervalMs,
      okCount: state.okCount,
      failCount: state.failCount,
      stepCount: state.stepCount,
      generatedAt: new Date().toISOString(),
      dataset: state.dataset || [],
      steps: (state.stepProgress || []).map((step, index) => ({
        index: index + 1,
        id: step.id,
        name: step.name,
        method: step.method,
        runPolicy: step.runPolicy,
        state: step.state,
        status: step.status,
        ms: step.ms,
        error: step.error || "",
        tests: step.tests || []
      })),
      logs: (state.logs || []).map((entry) => ({
        at: entry.at,
        kind: entry.kind,
        text: entry.text,
        detail: entry.detail || ""
      }))
    };
    if (format === "html") return renderHtmlReport(report);
    if (format === "markdown") {
      const lines = [];
      lines.push(`# ${t("workflow.report.title")} — ${report.folderName || "-"}`);
      lines.push("");
      lines.push(`- ${t("workflow.report.status")}: **${report.status}**`);
      lines.push(`- ${t("workflow.report.rounds")}: ${report.rounds}`);
      lines.push(`- ${t("workflow.report.counts")}: ${report.okCount} / ${report.failCount}`);
      lines.push(`- ${t("workflow.report.interval")}: ${report.intervalMs} ms`);
      lines.push(`- ${t("workflow.report.generated")}: ${report.generatedAt}`);
      if (report.dataset.length) {
        lines.push(`- ${t("dataset.title")}: ${t("dataset.rows", { count: report.dataset.length })}`);
      }
      lines.push("");
      lines.push(`## ${t("workflow.progress.title")}`);
      lines.push("");
      report.steps.forEach((step) => {
        lines.push(`- ${step.index}. \`${step.method}\` ${step.name} — ${step.state}${step.status ? ` ${step.status}` : ""}${step.ms ? ` (${step.ms}ms)` : ""}${step.error ? ` — ${step.error}` : ""}`);
        (step.tests || []).forEach((test) => {
          lines.push(`  - ${test.ok ? "PASS" : "FAIL"} ${test.name}${test.message ? ` — ${test.message}` : ""}`);
        });
      });
      lines.push("");
      lines.push(`## ${t("workflow.log.title")}`);
      lines.push("");
      report.logs.slice().reverse().forEach((entry) => {
        const time = entry.at ? new Date(entry.at).toISOString() : "";
        lines.push(`- \`${time}\` **${entry.kind || "info"}** ${entry.text}`);
        if (entry.detail) lines.push(`  \`\`\`\n  ${String(entry.detail).slice(0, 2000)}\n  \`\`\``);
      });
      lines.push("");
      return lines.join("\n");
    }
    return JSON.stringify(report, null, 2);
  }

  function exportRunReport(format) {
    const fmt = format === "markdown" ? "markdown" : format === "html" ? "html" : "json";
    const text = buildRunReport(fmt);
    const ext = fmt === "markdown" ? "md" : fmt === "html" ? "html" : "json";
    const filename = `workflow-report-${state.folderName || "run"}`
      .replace(/[\\/:*?"<>|]/g, "_").trim() + `.${ext}`;
    const textarea = el("textarea", {
      class: "hc-textarea",
      spellcheck: "false",
      value: text
    });
    const download = (api) => {
      const ok = util.downloadText(textarea.value, filename);
      util.toast(ok ? t("toast.downloaded") : t("toast.downloadFailed"), ok ? "success" : "error");
      api.close();
    };
    util.openModal({
      title: t("workflow.report.title"),
      render: (body) => {
        body.append(el("div", { class: "hc-hint", text: t("workflow.report.hint") }));
        body.append(textarea);
      },
      actions: [
        { label: t("action.close"), onClick: (api) => api.close() },
        { label: t("action.download"), onClick: download },
        {
          label: t("action.copy"), kind: "primary",
          onClick: async (api) => {
            const ok = await bridge.copy(textarea.value);
            util.toast(ok ? t("toast.copied") : t("toast.copyFailed"), ok ? "success" : "error");
            api.close();
          }
        }
      ]
    });
  }

  function renderRunFooter(host) {
    const closeBtn = el("button", {
      class: "hc-btn hc-btn-ghost", type: "button", text: t("workflow.closePanel"),
      on: { click: () => closePanel() }
    });
    const pauseBtn = el("button", {
      class: "hc-btn hc-btn-ghost", type: "button", text: t("workflow.pause"),
      on: { click: () => togglePause() }
    });
    const stopBtn = el("button", {
      class: "hc-btn hc-btn-danger", type: "button", text: t("workflow.stop"),
      on: { click: () => stopRun() }
    });
    const exportBtn = el("button", {
      class: "hc-btn hc-btn-ghost", type: "button", text: t("workflow.report.export"),
      on: {
        click: (event) => {
          util.openContextMenu(event, [
            { label: t("workflow.report.json"), onClick: () => exportRunReport("json") },
            { label: t("workflow.report.markdown"), onClick: () => exportRunReport("markdown") },
            { label: t("workflow.report.html"), onClick: () => exportRunReport("html") }
          ]);
        }
      }
    });
    const startBtn = el("button", {
      class: "hc-btn hc-btn-primary", type: "button", text: t("workflow.start"),
      on: {
        click: () => {
          if (isActiveRun()) return;
          state.phase = "configure";
          renderPanel();
        }
      }
    });
    const footer = el("div", { class: "hc-workflow-footer" }, [
      closeBtn, pauseBtn, stopBtn, exportBtn, startBtn
    ]);
    host.append(footer);
    runDom.closeBtn = closeBtn;
    runDom.pauseBtn = pauseBtn;
    runDom.stopBtn = stopBtn;
    runDom.exportBtn = exportBtn;
    runDom.startBtn = startBtn;
    patchChrome();
  }

  function renderPanel() {
    const host = util.$("#workflow-pane");
    if (!host) return;
    if (!state.open) {
      host.hidden = true;
      util.clear(host);
      formApi = null;
      runDom = null;
      panelMode = "";
      notifyLayout();
      return;
    }
    host.hidden = false;

    const configuring = state.phase === "configure";
    const nextMode = configuring ? "configure" : "run";
    // Reuse existing run DOM across running ↔ finished to avoid layout jump.
    if (nextMode === "run" && panelMode === "run" && runDom && runDom.logEl) {
      patchStrip();
      patchProgress();
      patchAlert();
      patchChrome();
      return;
    }

    util.clear(host);
    runDom = {};
    panelMode = nextMode;
    formApi = null;
    host.classList.toggle("is-fullscreen", !!state.fullscreen);

    const headTitle = configuring
      ? t("workflow.dialogTitle", { name: state.folderName || "-" })
      : (state.folderName || t("workflow.panelTitle"));
    const fsLabel = state.fullscreen ? t("workflow.exitFullscreen") : t("action.fullscreen");
    const fsBtn = el("button", {
      class: "hc-btn hc-btn-ghost", type: "button",
      title: fsLabel,
      text: fsLabel,
      on: { click: () => toggleFullscreen() }
    });
    runDom.fsBtn = fsBtn;
    const headActions = [fsBtn];
    if (configuring) {
      headActions.push(el("button", {
        class: "hc-btn hc-btn-ghost", type: "button",
        text: t("action.cancel2"),
        on: { click: () => closePanel() }
      }));
    }
    const head = el("div", { class: "hc-workflow-head" }, [
      el("div", { class: "hc-workflow-title" }, [
        el("strong", { text: headTitle }),
        configuring
          ? el("span", { class: "hc-muted", text: t("workflow.stepsCount", { count: state.stepCount }) })
          : null
      ].filter(Boolean)),
      el("div", { class: "hc-workflow-actions" }, headActions)
    ]);

    const body = el("div", { class: "hc-workflow-body" });
    if (configuring) {
      renderConfigForm(body);
    } else {
      renderMeta(body);
      const split = el("div", { class: "hc-workflow-run-split" });
      const left = el("div", { class: "hc-workflow-run-left" });
      renderProgress(left);
      const right = el("div", { class: "hc-workflow-run-right" });
      renderLogLines(right);
      split.append(left, right);
      body.append(split);
      renderRunFooter(body);
    }

    host.append(head, body);
    notifyLayout();
  }

  function init() {
    ensureListeners();
    refreshStatus();
  }

  window.HC.workflow = {
    openRunDialog,
    stopRun,
    refreshStatus,
    renderPanel,
    init,
    get state() { return state; }
  };
})();
