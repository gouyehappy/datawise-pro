/* Interactive JSON tree with path + “save as env var”. */

(function () {
  const util = HC.util;
  const t = (key, params) => HC.i18n.t(key, params);
  const el = util.el;

  function pathJoin(base, key, isIndex) {
    if (!base) return isIndex ? `[${key}]` : String(key);
    if (isIndex) return `${base}[${key}]`;
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return `${base}.${key}`;
    return `${base}[${JSON.stringify(String(key))}]`;
  }

  function valuePreview(value) {
    if (value === null) return "null";
    if (typeof value === "string") {
      const text = value.length > 80 ? `${value.slice(0, 80)}…` : value;
      return JSON.stringify(text);
    }
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (Array.isArray(value)) return `Array(${value.length})`;
    if (typeof value === "object") return `Object(${Object.keys(value).length})`;
    return String(value);
  }

  function scalarText(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "object") {
      try { return JSON.stringify(value); } catch (error) { return String(value); }
    }
    return String(value);
  }

  function suggestName(path) {
    const parts = String(path || "").replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
    const last = parts[parts.length - 1] || "value";
    return String(last).replace(/[^A-Za-z0-9_]/g, "_").replace(/^(\d)/, "_$1") || "value";
  }

  async function saveAsEnvVar(path, value) {
    const store = HC.store;
    const nameInput = el("input", {
      class: "hc-input",
      type: "text",
      value: suggestName(path),
      spellcheck: "false"
    });
    const preview = el("pre", {
      class: "hc-code hc-extract-preview",
      text: scalarText(value).slice(0, 4000)
    });
    util.openModal({
      title: t("extract.title"),
      render: (body) => {
        body.append(el("div", { class: "hc-hint", text: t("extract.pathHint", { path }) }));
        body.append(el("label", { class: "hc-field" }, [
          el("span", { class: "hc-field-label", text: t("extract.varName") }),
          nameInput
        ]));
        body.append(el("div", { class: "hc-field-label", text: t("extract.value") }));
        body.append(preview);
      },
      actions: [
        { label: t("action.cancel2"), onClick: (api) => api.close() },
        {
          label: t("extract.save"),
          kind: "primary",
          onClick: (api) => {
            const key = String(nameInput.value || "").trim();
            if (!key) {
              util.toast(t("extract.nameRequired"), "error");
              return;
            }
            let environment = store.activeEnvironment();
            if (!environment) environment = store.createEnvironment(t("misc.scriptEnvironment"));
            const rows = environment.variables || (environment.variables = []);
            const existing = rows.find((row) => row.key === key);
            const next = scalarText(value);
            if (existing) {
              existing.value = next;
              existing.enabled = true;
            } else {
              rows.push({ key, value: next, enabled: true });
            }
            if (!rows.some((row) => !row.key)) rows.push({ key: "", value: "", enabled: true });
            store.persist();
            store.emit("environments");
            util.toast(t("extract.saved", { name: key }), "success");
            api.close();
          }
        }
      ]
    });
    setTimeout(() => { nameInput.focus(); nameInput.select(); }, 30);
  }

  function leafMenu(path, value) {
    return [
      { label: t("extract.setEnv"), onClick: () => saveAsEnvVar(path, value) },
      { label: t("action.copy"), onClick: async () => {
        const ok = await HC.bridge.copy(scalarText(value));
        util.toast(ok ? t("toast.copied") : t("toast.copyFailed"), ok ? "success" : "error");
      } },
      { label: t("extract.copyPath"), onClick: async () => {
        const ok = await HC.bridge.copy(path || "$");
        util.toast(ok ? t("toast.copied") : t("toast.copyFailed"), ok ? "success" : "error");
      } }
    ];
  }

  function renderLeaf(keyLabel, path, value) {
    const type = value === null ? "null" : typeof value;
    const leaf = el("div", {
      class: "hc-json-leaf",
      title: t("extract.leafHint"),
      dataset: { path }
    }, [
      el("span", { class: "hc-json-key", text: keyLabel }),
      el("span", { class: "hc-json-sep", text: ": " }),
      el("span", { class: `hc-json-val is-${type}`, text: valuePreview(value) })
    ]);
    leaf.addEventListener("contextmenu", (event) => util.openContextMenu(event, leafMenu(path, value)));
    leaf.addEventListener("dblclick", () => saveAsEnvVar(path, value));
    return leaf;
  }

  function renderNode(value, path, depth) {
    const isObject = value !== null && typeof value === "object";
    if (!isObject) {
      const label = path.includes(".") || path.includes("[")
        ? (path.match(/([^.[\]]+)$/) || [path, path])[1]
        : (path || "value");
      return renderLeaf(label, path, value);
    }

    const entries = Array.isArray(value)
      ? value.map((item, index) => [index, item, true])
      : Object.keys(value).map((key) => [key, value[key], false]);
    const details = el("details", { class: "hc-json-node", open: depth < 2 ? true : undefined });
    const summary = el("summary", { class: "hc-json-summary" }, [
      el("span", { class: "hc-json-key", text: path || (Array.isArray(value) ? "[]" : "{}") }),
      el("span", { class: "hc-json-meta", text: valuePreview(value) })
    ]);
    summary.addEventListener("contextmenu", (event) => {
      util.openContextMenu(event, [
        { label: t("extract.setEnv"), onClick: () => saveAsEnvVar(path || "$", value) },
        { label: t("extract.copyPath"), onClick: async () => {
          const ok = await HC.bridge.copy(path || "$");
          util.toast(ok ? t("toast.copied") : t("toast.copyFailed"), ok ? "success" : "error");
        } }
      ]);
    });
    details.append(summary);
    const kids = el("div", { class: "hc-json-children" });
    entries.slice(0, 500).forEach(([key, child, isIndex]) => {
      const childPath = pathJoin(path, key, isIndex);
      const row = el("div", { class: "hc-json-child" });
      if (child !== null && typeof child === "object") {
        row.append(renderNode(child, childPath, depth + 1));
      } else {
        row.append(renderLeaf(isIndex ? `[${key}]` : String(key), childPath, child));
      }
      kids.append(row);
    });
    if (entries.length > 500) {
      kids.append(el("div", { class: "hc-hint", text: t("extract.truncated", { count: entries.length }) }));
    }
    details.append(kids);
    return details;
  }

  function render(host, rawText) {
    let parsed;
    try {
      parsed = JSON.parse(String(rawText || ""));
    } catch (error) {
      host.append(el("div", { class: "hc-hint", text: t("extract.notJson") }));
      return false;
    }
    host.append(el("div", { class: "hc-hint hc-json-tree-hint", text: t("extract.treeHint") }));
    host.append(el("div", { class: "hc-json-tree" }, [renderNode(parsed, "", 0)]));
    return true;
  }

  window.HC.jsonTree = { render, saveAsEnvVar, pathJoin, suggestName };
})();
