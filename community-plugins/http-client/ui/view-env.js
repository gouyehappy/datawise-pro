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
    host.append(el("button", {
      class: "hc-icon-btn", type: "button", text: "+", title: t("env.new"),
      on: {
        click: async () => {
          const name = await util.promptDialog({ title: t("env.new"), label: t("dialog.name") });
          if (!name) return;
          const created = store.createEnvironment(name);
          openEnvironment(created.id);
        }
      }
    }));
  }

  function render() {
    const host = util.$("#env-pane");
    if (!host) return;
    util.clear(host);
    if (!isEnvView()) return;
    pruneOpen();

    if (!store.state.environments.length) {
      host.append(el("div", { class: "hc-env-empty", text: t("side.emptyEnvironments") }));
      host.append(util.renderDynamicVarCatalog());
      return;
    }

    const environment = store.state.environments.find((item) => item.id === activeOpenId)
      || store.activeEnvironment();
    if (!environment || openIds.indexOf(environment.id) < 0) {
      host.append(el("div", { class: "hc-env-empty", text: t("env.pickOne") }));
      host.append(util.renderDynamicVarCatalog());
      return;
    }

    host.append(el("div", { class: "hc-env-head" }, [
      el("div", { class: "hc-env-title", text: `${t("env.variables")} · ${environment.name}` }),
      el("div", { class: "hc-hint", text: t("env.variablesHint") })
    ]));

    host.append(util.renderDynamicVarCatalog());

    const kvHost = el("div", { class: "hc-env-kv" });
    host.append(kvHost);
    if (!environment.variables || !environment.variables.length) {
      environment.variables = [util.emptyRow()];
    }
    util.createKVEditor(kvHost, {
      rows: environment.variables,
      keyLabel: t("kv.keyName"),
      valueLabel: t("kv.valueName"),
      descriptionLabel: t("kv.description"),
      keyPlaceholder: t("kv.keyPlaceholder"),
      valuePlaceholder: t("kv.valuePlaceholder"),
      descriptionPlaceholder: t("kv.descriptionPlaceholder"),
      onChange: () => {
        store.schedulePersist();
        if (HC.viewRequest && store.activeTab()) HC.viewRequest.updateUrlFlag(store.activeTab());
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
