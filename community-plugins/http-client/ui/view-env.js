/* Right-pane environment editor — open tabs like request tabs (not all at once). */

(function () {
  const util = HC.util;
  const store = HC.store;
  const t = (key, params) => HC.i18n.t(key, params);
  const el = util.el;

  /** Environment ids currently open as tabs (sidebar click opens one). */
  let openIds = [];
  let activeOpenId = "";

  function isEnvView() {
    return store.state.sideView === "environments";
  }

  function pruneOpen() {
    const alive = new Set((store.state.environments || []).map((item) => item.id));
    openIds = openIds.filter((id) => alive.has(id));
    if (activeOpenId && !alive.has(activeOpenId)) activeOpenId = "";
    if (activeOpenId && openIds.indexOf(activeOpenId) < 0) activeOpenId = "";
    if (!activeOpenId && openIds.length) activeOpenId = openIds[openIds.length - 1];
  }

  function openEnvironment(id) {
    if (!id) return;
    const exists = (store.state.environments || []).some((item) => item.id === id);
    if (!exists) return;
    if (openIds.indexOf(id) < 0) openIds.push(id);
    activeOpenId = id;
    if (store.state.activeEnvironmentId !== id) store.setActiveEnvironment(id);
    else {
      renderTabs();
      render();
    }
  }

  function closeEnvironment(id) {
    const index = openIds.indexOf(id);
    if (index < 0) return;
    openIds.splice(index, 1);
    if (activeOpenId === id) {
      activeOpenId = openIds[Math.min(index, openIds.length - 1)] || "";
      if (activeOpenId) store.setActiveEnvironment(activeOpenId);
    }
    renderTabs();
    render();
  }

  function setActiveOpen(id) {
    if (openIds.indexOf(id) < 0) return;
    activeOpenId = id;
    store.setActiveEnvironment(id);
    renderTabs();
    render();
  }

  function syncLayout() {
    pruneOpen();
    const envPane = util.$("#env-pane");
    const request = util.$("#request-pane");
    const response = util.$("#response-pane");
    const splitter = util.$("#pane-splitter");
    const showEnv = isEnvView();
    if (envPane) envPane.hidden = !showEnv;
    if (request) request.hidden = showEnv;
    if (response) response.hidden = showEnv;
    if (splitter) splitter.hidden = showEnv;
    if (showEnv) {
      // Prefer the globally active env if nothing open yet.
      if (!openIds.length && store.state.activeEnvironmentId) {
        openEnvironment(store.state.activeEnvironmentId);
        return;
      }
      renderTabs();
      render();
    }
  }

  function renderTabs() {
    const host = util.$("#tabstrip");
    if (!host || !isEnvView()) return;
    util.clear(host);
    pruneOpen();
    openIds.forEach((id) => {
      const environment = store.state.environments.find((item) => item.id === id);
      if (!environment) return;
      const active = id === activeOpenId;
      const node = el("div", {
        class: `hc-tab${active ? " is-active" : ""}`,
        title: environment.name
      }, [
        el("span", { class: "hc-tab-label", text: environment.name }),
        el("button", {
          class: "hc-tab-close", type: "button", text: "✕", title: t("action.close"),
          on: {
            click: (event) => {
              event.stopPropagation();
              closeEnvironment(id);
            }
          }
        })
      ]);
      node.addEventListener("click", () => setActiveOpen(id));
      node.addEventListener("auxclick", (event) => {
        if (event.button === 1) closeEnvironment(id);
      });
      host.append(node);
    });
    requestAnimationFrame(() => {
      if (HC.app && HC.app.updateTabstripOverflow) HC.app.updateTabstripOverflow();
    });
  }

  function countEnabledVars(environment) {
    return (environment.variables || []).filter((row) => row && row.enabled !== false && String(row.key || "").trim()).length;
  }

  function render() {
    const host = util.$("#env-pane");
    if (!host) return;
    util.clear(host);
    if (!isEnvView()) return;
    pruneOpen();

    if (!store.state.environments.length) {
      host.append(el("div", { class: "hc-env-empty" }, [
        el("div", { class: "hc-env-empty-title", text: t("side.emptyEnvironments") }),
        el("div", { class: "hc-hint", text: t("env.emptyHint") }),
        el("button", {
          type: "button",
          class: "hc-btn hc-btn-primary",
          text: t("env.new"),
          on: {
            click: async () => {
              const name = await util.promptDialog({ title: t("env.new"), label: t("dialog.name") });
              if (!name) return;
              const created = store.createEnvironment(name);
              openEnvironment(created.id);
            }
          }
        })
      ]));
      return;
    }

    const environment = store.state.environments.find((item) => item.id === activeOpenId)
      || store.activeEnvironment();
    if (!environment || openIds.indexOf(environment.id) < 0) {
      host.append(el("div", { class: "hc-env-empty" }, [
        el("div", { class: "hc-env-empty-title", text: t("env.pickOne") }),
        el("div", { class: "hc-hint", text: t("env.pickOneHint") })
      ]));
      return;
    }

    if (!environment.variables || !environment.variables.length) {
      environment.variables = [util.emptyRow()];
    }
    const enabled = countEnabledVars(environment);

    const nameInput = el("input", {
      class: "hc-input hc-env-name-input",
      type: "text",
      value: environment.name || "",
      spellcheck: "false",
      title: t("action.rename")
    });
    nameInput.addEventListener("change", () => {
      const next = String(nameInput.value || "").trim() || t("misc.environment");
      environment.name = next;
      nameInput.value = next;
      store.persist();
      store.emit("environments");
      renderTabs();
    });

    const head = el("div", { class: "hc-env-head" });
    const top = el("div", { class: "hc-env-head-row" }, [
      nameInput,
      el("span", {
        class: "hc-env-count",
        text: t("env.varCount", { count: enabled })
      }),
      el("span", { class: "hc-grow" }),
      el("button", {
        type: "button",
        class: "hc-btn hc-btn-sm hc-btn-ghost",
        text: t("action.dynamicVars"),
        title: t("env.builtinHint"),
        on: { click: () => util.openDynamicVarsDialog() }
      }),
      el("button", {
        type: "button",
        class: "hc-btn hc-btn-sm hc-btn-ghost",
        text: t("action.duplicate"),
        title: t("env.duplicateHint"),
        on: {
          click: () => {
            const copy = store.createEnvironment(t("tab.copySuffix", { name: environment.name }));
            copy.variables = JSON.parse(JSON.stringify(environment.variables || []));
            store.persist();
            store.emit("environments");
            openEnvironment(copy.id);
            util.toast(t("env.duplicated"), "success");
          }
        }
      })
    ]);
    head.append(top);
    head.append(el("div", { class: "hc-hint hc-env-head-hint", text: t("env.variablesHintShort") }));
    host.append(head);

    // Scroll shell must stay outside createKVEditor — it overwrites host.className.
    const kvScroll = el("div", { class: "hc-env-kv" });
    const kvEditor = el("div");
    kvScroll.append(kvEditor);
    host.append(kvScroll);
    util.createKVEditor(kvEditor, {
      rows: environment.variables,
      keyLabel: t("kv.keyName"),
      valueLabel: t("kv.valueName"),
      descriptionLabel: t("kv.description"),
      keyPlaceholder: t("kv.keyPlaceholder"),
      valuePlaceholder: t("kv.valuePlaceholder"),
      descriptionPlaceholder: t("kv.descriptionPlaceholder"),
      onChange: () => {
        store.schedulePersist();
        const chip = util.$(".hc-env-count");
        if (chip) chip.textContent = t("env.varCount", { count: countEnabledVars(environment) });
        if (HC.viewRequest && store.activeTab()) HC.viewRequest.updateUrlFlag(store.activeTab());
        const sideMeta = util.$(`.hc-env-row[data-env-id="${environment.id}"] .hc-env-meta`);
        if (sideMeta) sideMeta.textContent = String(countEnabledVars(environment));
      }
    });
  }

  window.HC.viewEnv = {
    render,
    renderTabs,
    syncLayout,
    openEnvironment,
    closeEnvironment
  };
})();
