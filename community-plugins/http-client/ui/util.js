/* DOM helpers, formatting, dialogs, toasts and the reusable key/value editor. */

(function () {
  const t = (key, params) => HC.i18n.t(key, params);

  function $(selector, root) { return (root || document).querySelector(selector); }
  function $$(selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }

  function el(tag, props, children) {
    const node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach((key) => {
        const value = props[key];
        if (value === undefined || value === null) return;
        if (key === "class") node.className = value;
        else if (key === "text") node.textContent = value;
        else if (key === "html") node.innerHTML = value;
        else if (key === "dataset") Object.assign(node.dataset, value);
        else if (key === "style") {
          if (typeof value === "string") node.style.cssText = value;
          else {
            Object.keys(value).forEach((prop) => {
              if (prop.startsWith("--")) node.style.setProperty(prop, value[prop]);
              else node.style[prop] = value[prop];
            });
          }
        }
        else if (key === "on") Object.keys(value).forEach((event) => node.addEventListener(event, value[event]));
        else if (key === "checked" || key === "disabled" || key === "selected" || key === "hidden") node[key] = !!value;
        else if (key === "value") node.value = value;
        else node.setAttribute(key, value);
      });
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach((child) => {
        if (child === null || child === undefined || child === false) return;
        node.append(child instanceof Node ? child : document.createTextNode(String(child)));
      });
    }
    return node;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

  let sequence = 0;
  function uid(prefix) {
    sequence += 1;
    return `${prefix || "id"}-${Date.now().toString(36)}-${sequence.toString(36)}`;
  }

  function escapeHtml(text, keepQuotes) {
    let out = String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    if (!keepQuotes) out = out.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    return out;
  }

  function escapeAttr(value) { return escapeHtml(value, true); }

  function formatBytes(size) {
    if (size === 0) return "0 B";
    if (!size || size < 0) return "—";
    const unit = 1024;
    if (size < unit) return `${size} B`;
    const units = ["KiB", "MiB", "GiB"];
    let value = size;
    let index = -1;
    while (value >= unit && index < units.length - 1) { value /= unit; index += 1; }
    return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
  }

  function formatDuration(ms) {
    if (ms === null || ms === undefined) return "—";
    if (ms < 1000) return `${ms} ms`;
    return `${(ms / 1000).toFixed(2)} s`;
  }

  function statusClass(status, ok) {
    if (!ok && !status) return "is-fail";
    if (status >= 500) return "is-5xx";
    if (status >= 400) return "is-4xx";
    if (status >= 300) return "is-3xx";
    if (status >= 200) return "is-2xx";
    return "is-fail";
  }

  /* ------------------------------------------------------------ clipboard -- */

  async function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (error) { /* fall through to the legacy path */ }
    try {
      const area = el("textarea", { value: text, style: { position: "fixed", opacity: "0" } });
      document.body.append(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch (error) {
      return false;
    }
  }

  /* --------------------------------------------------------------- toasts -- */

  function toast(message, kind) {
    const host = $("#toast-host");
    if (!host) return;
    while (host.children.length >= 3) host.firstChild.remove();
    const node = el("div", { class: `hc-toast${kind ? ` is-${kind}` : ""}`, text: message, title: t("action.close") });
    node.addEventListener("click", () => node.remove());
    host.append(node);
    setTimeout(() => {
      if (!node.isConnected) return;
      node.style.transition = "opacity .2s";
      node.style.opacity = "0";
      setTimeout(() => node.remove(), 220);
    }, kind === "error" ? 6000 : 2800);
  }

  /* --------------------------------------------------------------- modals -- */

  const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  let modalCloser = null;

  function closeModal(reason) {
    const host = $("#modal-host");
    const closer = modalCloser;
    modalCloser = null;
    if (host && !host.hidden) {
      host.hidden = true;
      clear(host);
    }
    if (typeof closer === "function" && closer !== closeModal) {
      try { closer(reason || "dismiss"); } catch (error) { /* ignore */ }
    }
  }

  function openModal(options) {
    const host = $("#modal-host");
    closeModal();
    // Record the element that opened the dialog so focus can be handed back.
    const previousFocus = document.activeElement;
    const titleId = uid("hc-modal-title");
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      if (options.onDismiss) options.onDismiss(value);
    };
    const restoreFocus = () => {
      if (previousFocus && previousFocus.isConnected && typeof previousFocus.focus === "function") {
        previousFocus.focus();
      }
    };
    const body = el("div", { class: "hc-modal-body" });
    const foot = el("div", { class: "hc-modal-foot" });
    const modal = el("div", {
      class: "hc-modal", role: "dialog", "aria-modal": "true", "aria-labelledby": titleId
    }, [
      el("div", { class: "hc-modal-head" }, [
        el("span", { class: "hc-grow", id: titleId, text: options.title }),
        el("button", {
          class: "hc-icon-btn", type: "button", title: t("action.close"), "aria-label": t("action.close"), text: "✕",
          on: { click: () => { settle("dismiss"); closeModal(); } }
        })
      ]),
      body,
      foot
    ]);
    host.append(modal);
    host.hidden = false;

    const api = {
      body,
      foot,
      close: () => closeModal(),
      modal,
      dismiss: () => { settle("dismiss"); closeModal(); }
    };
    // Keep Tab inside the dialog; Escape / backdrop dismissal stay unchanged.
    modal.addEventListener("keydown", (event) => {
      if (event.key !== "Tab") return;
      const nodes = $$(FOCUSABLE_SELECTOR, modal).filter((node) => node.getClientRects().length > 0);
      if (!nodes.length) { event.preventDefault(); return; }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || !modal.contains(active)) { event.preventDefault(); last.focus(); }
      } else if (active === last || !modal.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    });
    (options.actions || []).forEach((action) => {
      foot.append(el("button", {
        class: `hc-btn ${action.kind === "primary" ? "hc-btn-primary" : action.kind === "danger" ? "hc-btn-danger" : "hc-btn-ghost"}`,
        type: "button",
        text: action.label,
        disabled: action.disabled,
        on: { click: () => action.onClick(api) }
      }));
    });
    if (options.render) options.render(body, api);
    modalCloser = () => {
      settle("dismiss");
      const h = $("#modal-host");
      if (h && !h.hidden) {
        h.hidden = true;
        clear(h);
      }
      modalCloser = null;
      restoreFocus();
    };
    setTimeout(() => {
      const focusable = body.querySelector("input, textarea, select, .hc-dd-trigger");
      if (focusable) focusable.focus();
    }, 20);
    return api;
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modalCloser) { event.preventDefault(); modalCloser(); }
  });
  document.addEventListener("click", (event) => {
    if (event.target && event.target.id === "modal-host") {
      if (modalCloser) modalCloser();
      else closeModal();
    }
  });

  function confirmDialog(options) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (value) => {
        if (done) return;
        done = true;
        resolve(value);
      };
      openModal({
        title: options.title,
        onDismiss: () => finish(false),
        render: (body) => {
          body.append(el("div", { text: options.message }));
          if (options.detail) body.append(el("div", { class: "hc-hint", text: options.detail }));
        },
        actions: [
          { label: t("action.cancel2"), onClick: (api) => { finish(false); api.close(); } },
          { label: options.confirmLabel || t("action.delete"), kind: options.kind || "danger", onClick: (api) => { finish(true); api.close(); } }
        ]
      });
    });
  }

  function promptDialog(options) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (value) => {
        if (done) return;
        done = true;
        resolve(value);
      };
      const input = options.multiline
        ? el("textarea", {
            class: "hc-textarea", rows: "10", spellcheck: "false",
            value: options.value || "", placeholder: options.placeholder || ""
          })
        : el("input", { class: "hc-input", type: "text", value: options.value || "", placeholder: options.placeholder || "" });
      const submit = (api) => {
        const value = input.value.trim();
        if (!value && options.required !== false) { input.focus(); return; }
        finish(value);
        api.close();
      };
      openModal({
        title: options.title,
        onDismiss: () => finish(null),
        render: (body, api) => {
          body.append(el("label", { class: "hc-field" }, [
            el("span", { class: "hc-field-label", text: options.label || t("dialog.name") }), input
          ]));
          if (options.hint) body.append(el("div", { class: "hc-hint", text: options.hint }));
          input.addEventListener("keydown", (event) => {
            if (event.key === "Enter" && !options.multiline) { event.preventDefault(); submit(api); }
          });
          if (options.multiline) requestAnimationFrame(() => input.focus());
        },
        actions: [
          { label: t("action.cancel2"), onClick: (api) => { finish(null); api.close(); } },
          { label: t("action.confirm"), kind: "primary", onClick: submit }
        ]
      });
    });
  }

  /* --------------------------------------------------- key/value editor --- */

  function emptyRow() {
    return { key: "", value: "", description: "", type: "string", enabled: true };
  }

  /* ---------------------------------------------------- {{var}} field tips */

  const varTips = (function createVarTips() {
    let tipNode = null;
    let tipToken = null;
    let tipTimer = null;
    let measureCtx = null;

    function parseTokens(text) {
      const source = String(text || "");
      const tokens = [];
      const re = /\{\{\s*([^{}]+?)\s*\}\}/g;
      let last = 0;
      let match;
      while ((match = re.exec(source))) {
        if (match.index > last) {
          tokens.push({ type: "text", start: last, end: match.index, text: source.slice(last, match.index) });
        }
        tokens.push({
          type: "var",
          start: match.index,
          end: match.index + match[0].length,
          text: match[0],
          name: match[1].trim()
        });
        last = match.index + match[0].length;
      }
      if (last < source.length) {
        tokens.push({ type: "text", start: last, end: source.length, text: source.slice(last) });
      }
      return tokens;
    }

    function lookup(name) {
      if (!name) return { ok: false, value: "", kind: "missing", key: "" };
      const store = HC.store;
      if (!store) return { ok: false, value: "", kind: "missing", key: name };
      if (name.startsWith("$")) {
        const preview = store.resolve(`{{${name}}}`);
        const ok = preview !== `{{${name}}}`;
        return { ok, value: ok ? preview : "", kind: "dynamic", key: name };
      }
      const map = store.variableMap();
      if (Object.prototype.hasOwnProperty.call(map, name)) {
        return { ok: true, value: map[name] == null ? "" : String(map[name]), kind: "env", key: name };
      }
      const found = Object.keys(map).find((key) => key.toLowerCase() === name.toLowerCase());
      if (found) {
        return { ok: true, value: map[found] == null ? "" : String(map[found]), kind: "env", key: found };
      }
      return { ok: false, value: "", kind: "missing", key: name };
    }

    // getComputedStyle forces a style recalculation; do it once per event, not
    // once per character (long URLs used to drop frames on every mousemove).
    function measureContext(input) {
      if (!measureCtx) {
        const canvas = document.createElement("canvas");
        measureCtx = canvas.getContext("2d");
      }
      const style = window.getComputedStyle(input);
      const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      if (measureCtx.font !== font) measureCtx.font = font;
      return { ctx: measureCtx, paddingLeft: parseFloat(style.paddingLeft) || 0 };
    }

    function measureTextWidth(input, text) {
      return measureContext(input).ctx.measureText(text || "").width;
    }

    function charIndexAt(input, clientX) {
      const { ctx, paddingLeft } = measureContext(input);
      const x = clientX - input.getBoundingClientRect().left - paddingLeft + (input.scrollLeft || 0);
      const value = input.value || "";
      let width = 0;
      for (let index = 0; index < value.length; index += 1) {
        const next = ctx.measureText(value[index]).width;
        if (width + next / 2 >= x) return index;
        width += next;
      }
      return value.length;
    }

    function hide() {
      if (tipTimer) {
        clearTimeout(tipTimer);
        tipTimer = null;
      }
      tipToken = null;
      if (tipNode) {
        tipNode.remove();
        tipNode = null;
      }
    }

    async function goEdit(name) {
      hide();
      const store = HC.store;
      if (!store) return;
      let environment = store.activeEnvironment();
      if (!environment) environment = store.createEnvironment(t("misc.environment"));
      const rows = environment.variables || (environment.variables = []);
      let row = rows.find((item) => item.key === name);
      if (!row) {
        row = rows.find((item) => item.key && item.key.toLowerCase() === String(name || "").toLowerCase());
      }
      const isNew = !row;
      if (isNew) {
        const value = await promptDialog({
          title: t("urlVar.defineTitle"),
          label: name || t("urlVar.value"),
          value: "",
          placeholder: t("urlVar.definePlaceholder"),
          required: false,
          hint: t("urlVar.undefinedHint")
        });
        if (value === null) return;
        const blank = rows.find((item) => !item.key);
        if (blank) {
          blank.key = name;
          blank.value = value;
          blank.enabled = true;
          row = blank;
        } else {
          row = { key: name, value: value, description: "", type: "string", enabled: true };
          rows.push(row);
        }
        if (!rows.some((item) => !item.key)) rows.push(emptyRow());
        store.schedulePersist();
        toast(t("urlVar.defined", { name }), "success");
      }
      store.state.sideView = "environments";
      $$(".hc-side-tab").forEach((button) => {
        button.classList.toggle("is-active", button.dataset.sideView === "environments");
      });
      if (HC.viewSidebar) HC.viewSidebar.render();
      if (HC.viewEnv && HC.viewEnv.openEnvironment) HC.viewEnv.openEnvironment(environment.id);
      else store.setActiveEnvironment(environment.id);
      store.emit("environments");
      if (HC.viewEnv && HC.viewEnv.syncLayout) HC.viewEnv.syncLayout();
    }

    function show(token, input) {
      if (!token || token.type !== "var") {
        hide();
        return;
      }
      const info = lookup(token.name);
      const key = `${token.start}:${token.name}:${info.ok ? "1" : "0"}:${info.value}`;
      if (tipNode && tipToken === key) return;
      hide();
      tipToken = key;

      const tip = el("div", {
        class: `hc-url-var-tip${info.ok ? "" : " is-missing"}`,
        role: "tooltip"
      });
      if (!info.ok) {
        tip.append(el("div", { class: "hc-url-var-tip-head" }, [
          el("span", { class: "hc-url-var-tip-badge", text: "!" }),
          el("span", { class: "hc-url-var-tip-name", text: token.name })
        ]));
        tip.append(el("div", { class: "hc-url-var-tip-title", text: t("urlVar.undefined") }));
        tip.append(el("div", { class: "hc-url-var-tip-desc", text: t("urlVar.undefinedHint") }));
        tip.append(el("div", { class: "hc-url-var-tip-foot" }, [
          el("button", {
            type: "button",
            class: "hc-url-var-tip-edit",
            text: t("urlVar.define"),
            on: { click: () => goEdit(token.name) }
          })
        ]));
      } else {
        tip.append(el("div", { class: "hc-url-var-tip-head" }, [
          el("span", { class: "hc-url-var-tip-badge", text: info.kind === "dynamic" ? "$" : "G" }),
          el("span", { class: "hc-url-var-tip-name", text: info.key || token.name })
        ]));
        const valueRow = el("div", { class: "hc-url-var-tip-row" });
        valueRow.append(el("span", { class: "hc-url-var-tip-label", text: t("urlVar.value") }));
        valueRow.append(el("div", { class: "hc-url-var-tip-value", text: info.value }));
        valueRow.append(el("button", {
          type: "button",
          class: "hc-url-var-tip-copy",
          title: t("urlVar.copy"),
          text: "⧉",
          on: {
            click: async () => {
              const ok = await copyText(info.value);
              if (ok) toast(t("toast.copied"), "success");
              else toast(t("err.invoke", { message: "copy failed" }), "error");
            }
          }
        }));
        tip.append(valueRow);
        tip.append(el("div", { class: "hc-url-var-tip-row" }, [
          el("span", { class: "hc-url-var-tip-label", text: t("urlVar.scope") }),
          el("div", {
            class: "hc-url-var-tip-value",
            text: info.kind === "dynamic" ? t("urlVar.scopeDynamic") : t("urlVar.scopeEnv")
          })
        ]));
        if (info.kind === "env") {
          tip.append(el("div", { class: "hc-url-var-tip-foot" }, [
            el("button", {
              type: "button",
              class: "hc-url-var-tip-edit",
              text: t("urlVar.edit"),
              on: { click: () => goEdit(info.key || token.name) }
            })
          ]));
        }
      }

      document.body.append(tip);
      tipNode = tip;

      const style = window.getComputedStyle(input);
      const paddingLeft = parseFloat(style.paddingLeft) || 0;
      const rect = input.getBoundingClientRect();
      const prefix = (input.value || "").slice(0, token.start);
      const left = rect.left + paddingLeft + measureTextWidth(input, prefix) - (input.scrollLeft || 0);
      const tipWidth = tip.offsetWidth;
      const maxLeft = window.innerWidth - tipWidth - 8;
      tip.style.left = `${Math.max(8, Math.min(left, maxLeft))}px`;
      tip.style.top = `${rect.bottom + 6}px`;

      tip.addEventListener("mouseenter", () => {
        if (tipTimer) { clearTimeout(tipTimer); tipTimer = null; }
      });
      tip.addEventListener("mouseleave", () => {
        tipTimer = setTimeout(hide, 120);
      });
    }

    function renderHighlight(input, host) {
      if (!host) return;
      const text = input.value || "";
      const tokens = parseTokens(text);
      const hasVars = tokens.some((token) => token.type === "var");
      input.classList.toggle("is-rich", hasVars);
      clear(host);
      const track = el("div", { class: "hc-var-field-track" });
      tokens.forEach((token) => {
        if (token.type !== "var") {
          track.append(document.createTextNode(token.text));
          return;
        }
        const info = lookup(token.name);
        const klass = info.ok
          ? (info.kind === "dynamic" ? "hc-url-var is-dynamic" : "hc-url-var is-ok")
          : "hc-url-var is-missing";
        track.append(el("span", { class: klass, text: token.text }));
      });
      host.append(track);
      track.style.transform = `translateX(${-(input.scrollLeft || 0)}px)`;
    }

    function bindShell(shell, input, highlight) {
      if (input.dataset.varBound === "1") return;
      input.dataset.varBound = "1";

      const sync = () => renderHighlight(input, highlight);
      input.addEventListener("input", sync);
      input.addEventListener("scroll", () => {
        const track = highlight && highlight.querySelector(".hc-var-field-track");
        if (track) track.style.transform = `translateX(${-(input.scrollLeft || 0)}px)`;
      });
      shell.addEventListener("mousemove", (event) => {
        if (tipNode && tipNode.contains(event.target)) return;
        const index = charIndexAt(input, event.clientX);
        const token = parseTokens(input.value || "").find((item) => (
          item.type === "var" && index >= item.start && index < item.end
        ));
        if (token) show(token, input);
        else if (!tipNode || !tipNode.matches(":hover")) {
          if (tipTimer) clearTimeout(tipTimer);
          tipTimer = setTimeout(hide, 80);
        }
      });
      shell.addEventListener("mouseleave", (event) => {
        if (tipNode && event.relatedTarget && tipNode.contains(event.relatedTarget)) return;
        tipTimer = setTimeout(hide, 120);
      });
      input.addEventListener("blur", () => {
        tipTimer = setTimeout(hide, 160);
      });
      sync();
    }

    function wrapInput(input, extras) {
      const shell = el("div", {
        class: `hc-var-field${extras && extras.key ? " is-key" : ""}${extras && extras.value ? " is-value" : ""}`
      });
      const highlight = el("div", { class: "hc-var-field-highlight", "aria-hidden": "true" });
      input.classList.add("hc-var-field-input");
      shell.append(highlight, input);
      bindShell(shell, input, highlight);
      return shell;
    }

    return {
      parseTokens,
      lookup,
      measureTextWidth,
      charIndexAt,
      show,
      hide,
      goEdit,
      renderHighlight,
      wrapInput,
      bindShell
    };
  })();

  function createKVEditor(host, options) {
    const rows = options.rows;
    const allowFiles = !!options.allowFiles;
    const showEquals = !!options.showEquals;
    const showType = !!options.showType;
    const showDescription = options.showDescription !== false;
    const onChange = options.onChange || function () {};
    clear(host);
    host.className = "hc-kv";
    if (options.narrow) host.classList.add("is-narrow");
    if (allowFiles) host.classList.add("is-files");
    if (showEquals) host.classList.add("is-equals");
    if (showType) host.classList.add("is-typed");
    if (showDescription) host.classList.add("is-desc");

    const headCells = [el("span", { class: "hc-kv-col-check" })];
    const keyHead = el("span", { class: "hc-kv-col-key", text: options.keyLabel || t("kv.key") });
    const bulkButton = el("button", {
      class: "hc-icon-btn hc-kv-bulk", type: "button", text: "⇥",
      title: t("kv.bulkPaste"), "aria-label": t("kv.bulkPaste")
    });
    bulkButton.addEventListener("click", async () => {
      const text = await promptDialog({
        title: t("kv.bulkPaste"),
        label: t("kv.bulkPasteHint"),
        placeholder: "Authorization: Bearer xxx\npage: 1",
        multiline: true,
        required: false
      });
      if (text == null) return;
      applyBulkRows(parseBulkRows(text));
    });
    keyHead.append(bulkButton);
    headCells.push(keyHead);
    if (showType) headCells.push(el("span", { class: "hc-kv-col-type", text: options.typeLabel || t("kv.type") }));
    if (showEquals) headCells.push(el("span", { class: "hc-kv-col-eq", text: "=" }));
    if (allowFiles) headCells.push(el("span", { class: "hc-kv-col-ftype", text: t("body.fieldType") }));
    headCells.push(el("span", { class: "hc-kv-col-value", text: options.valueLabel || t("kv.value") }));
    if (showDescription) {
      headCells.push(el("span", { class: "hc-kv-col-desc", text: options.descriptionLabel || t("kv.description") }));
    }
    headCells.push(el("span", { class: "hc-kv-col-del" }));
    host.append(el("div", { class: "hc-kv-head" }, headCells));
    const body = el("div", { class: "hc-kv-body" });
    host.append(body);
    let syncGuard = false;

    function parseBulkRows(text) {
      return String(text || "").split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const cleaned = line.replace(/^-H\s+/, "");
          let separator = cleaned.indexOf("\t");
          if (separator < 0) separator = cleaned.indexOf(":");
          if (separator < 0) separator = cleaned.indexOf("=");
          const key = (separator >= 0 ? cleaned.slice(0, separator) : cleaned).trim();
          const value = (separator >= 0 ? cleaned.slice(separator + 1) : "").trim();
          return { key, value, description: "", type: "string", enabled: true };
        })
        .filter((row) => row.key);
    }

    function applyBulkRows(parsed) {
      if (!parsed.length) return;
      rows.length = 0;
      parsed.forEach((row) => rows.push(row));
      clear(body);
      rows.forEach((row) => body.append(buildRow(row)));
      emit();
    }

    function ensureTail() {
      const last = rows[rows.length - 1];
      if (!last || last.key || last.value || last.fileName || last.description) {
        const row = emptyRow();
        rows.push(row);
        body.append(buildRow(row));
      }
    }

    function buildRow(row) {
      if (!row.type) row.type = "string";
      if (row.description == null) row.description = "";
      const wrap = el("div", { class: "hc-kv-row" });
      if (allowFiles && row.kind === "file") wrap.classList.add("is-file");
      const checkbox = el("input", { type: "checkbox", checked: row.enabled !== false });
      if (row.enabled === false) wrap.classList.add("is-off");
      checkbox.addEventListener("change", () => {
        row.enabled = checkbox.checked;
        wrap.classList.toggle("is-off", !checkbox.checked);
        emit();
      });
      wrap.append(el("label", { class: "hc-kv-check" }, [checkbox]));

      let valueInput = null;
      const keyInput = el("input", {
        type: "text",
        class: "hc-kv-input is-key",
        value: row.key || "",
        placeholder: options.keyPlaceholder || t("kv.keyPlaceholder"),
        spellcheck: "false"
      });
      keyInput.addEventListener("input", () => {
        row.key = keyInput.value;
        if (valueInput) applyMask();
        emit();
      });
      keyInput.addEventListener("paste", (event) => {
        const clipboard = event.clipboardData || window.clipboardData;
        const text = clipboard && clipboard.getData("text");
        if (!text || !/[\r\n]/.test(text.trim())) return;
        const parsed = parseBulkRows(text);
        if (parsed.length < 2) return;
        event.preventDefault();
        applyBulkRows(parsed);
      });
      wrap.append(varTips.wrapInput(keyInput, { key: true }));

      if (showType) {
        const typeDd = createSelect({
          className: "hc-dd-chip hc-kv-type-chip",
          compact: true,
          value: row.type || "string",
          items: ["string", "integer", "number", "boolean", "array", "object"],
          onChange: (value) => {
            row.type = value;
            emit();
          }
        });
        wrap.append(typeDd.root);
      }

      if (showEquals) {
        wrap.append(el("span", { class: "hc-kv-eq", text: "=", "aria-hidden": "true" }));
      }

      if (allowFiles) {
        const typeDd = createSelect({
          className: "hc-dd-chip hc-kv-type",
          compact: true,
          value: row.kind === "file" ? "file" : "text",
          items: [
            { value: "text", label: t("body.fieldText") },
            { value: "file", label: t("body.fieldFile") }
          ],
          onChange: (value) => {
            row.kind = value === "file" ? "file" : "text";
            if (row.kind !== "file") {
              row.fileName = "";
              row.dataBase64 = "";
              row.size = 0;
              row.contentType = "";
            }
            const next = buildRow(row);
            wrap.replaceWith(next);
            emit();
          }
        });
        wrap.append(typeDd.root);
      }

      if (allowFiles && row.kind === "file") {
        const fileInput = el("input", { type: "file", style: { display: "none" } });
        const label = el("div", { class: "hc-kv-file" });
        const name = el("span", {
          class: "hc-kv-file-name ellipsis",
          text: row.fileName ? `${row.fileName} (${formatBytes(row.size || 0)})` : t("body.noFile")
        });
        const pick = el("button", {
          class: "hc-btn hc-btn-sm hc-btn-ghost", type: "button", text: t("body.chooseFile")
        });
        const drop = el("button", {
          class: "hc-icon-btn", type: "button", text: "✕", title: t("body.clearFile"), hidden: !row.fileName
        });
        pick.addEventListener("click", () => fileInput.click());
        drop.addEventListener("click", () => {
          row.fileName = ""; row.dataBase64 = ""; row.size = 0;
          name.textContent = t("body.noFile"); drop.hidden = true; emit();
        });
        fileInput.addEventListener("change", async () => {
          const file = fileInput.files && fileInput.files[0];
          if (!file) return;
          if (file.size > 1024 * 1024) { toast(t("toast.fileTooLarge"), "error"); fileInput.value = ""; return; }
          row.fileName = file.name; row.size = file.size; row.contentType = file.type || "";
          row.dataBase64 = await readFileBase64(file);
          name.textContent = `${file.name} (${formatBytes(file.size)})`;
          drop.hidden = false; emit();
        });
        label.append(pick, name, drop, fileInput);
        wrap.append(label);
      } else {
        valueInput = el("input", {
          type: "text",
          class: "hc-kv-input is-value",
          value: row.value || "",
          placeholder: options.valuePlaceholder || t("kv.valuePlaceholder"),
          spellcheck: "false"
        });
        // Mask credential-like values by default; double-click to reveal.
        const sensitiveKey = () => /(token|secret|password|passwd|api[_-]?key|authorization|credential|cookie)/i
          .test(row.key || "");
        const applyMask = () => {
          valueInput.type = sensitiveKey() ? "password" : "text";
          valueInput.title = sensitiveKey() ? t("kv.secretHint") : "";
        };
        applyMask();
        valueInput.addEventListener("dblclick", () => {
          if (!sensitiveKey()) return;
          valueInput.type = valueInput.type === "password" ? "text" : "password";
        });
        valueInput.addEventListener("input", () => { row.value = valueInput.value; emit(); });
        wrap.append(varTips.wrapInput(valueInput, { value: true }));
      }

      if (showDescription) {
        const descInput = el("input", {
          type: "text",
          class: "hc-kv-input is-desc",
          value: row.description || "",
          placeholder: options.descriptionPlaceholder || t("kv.descriptionPlaceholder"),
          spellcheck: "true"
        });
        descInput.addEventListener("input", () => { row.description = descInput.value; emit(); });
        wrap.append(descInput);
      }

      const remove = el("button", {
        class: "hc-kv-del", type: "button", text: "✕", title: t("action.delete")
      });
      remove.addEventListener("click", () => {
        const index = rows.indexOf(row);
        if (index >= 0) rows.splice(index, 1);
        wrap.remove();
        ensureTail();
        emit();
      });
      wrap.append(remove);
      return wrap;
    }

    function emit() {
      if (syncGuard) return;
      syncGuard = true;
      ensureTail();
      syncGuard = false;
      onChange(rows);
    }

    rows.forEach((row) => body.append(buildRow(row)));
    ensureTail();
    return { rows, refresh: () => createKVEditor(host, options), element: host };
  }

  function readFileBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        resolve(result.slice(result.indexOf(",") + 1));
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  /* ------------------------------------------------------- highlighting --- */

  function highlightJson(text) {
    return highlightSource(text, "json");
  }

  const JS_KEYWORDS = /^(var|let|const|function|return|if|else|for|while|do|switch|case|break|continue|new|typeof|instanceof|this|try|catch|finally|throw|class|extends|import|export|default|async|await|of|in|pm|apt|expect|console)$/;

  /** Syntax highlight for JSONC / JS editors (comments, strings, keys, literals). */
  function highlightSource(text, mode) {
    const src = String(text == null ? "" : text);
    const js = mode === "js";
    let html = "";
    let i = 0;

    const push = (chunk, cls) => {
      const escaped = escapeHtml(chunk, true);
      html += cls ? `<span class="${cls}">${escaped}</span>` : escaped;
    };

    while (i < src.length) {
      const ch = src[i];
      const next = src[i + 1];

      if (ch === "/" && next === "/") {
        let j = i + 2;
        while (j < src.length && src[j] !== "\n" && src[j] !== "\r") j += 1;
        push(src.slice(i, j), "hc-code-comment");
        i = j;
        continue;
      }
      if (ch === "/" && next === "*") {
        let j = i + 2;
        while (j < src.length && !(src[j] === "*" && src[j + 1] === "/")) j += 1;
        if (j < src.length) j += 2;
        push(src.slice(i, j), "hc-code-comment");
        i = j;
        continue;
      }

      if (ch === "\"" || (js && (ch === "'" || ch === "`"))) {
        const quote = ch;
        let j = i + 1;
        let esc = false;
        while (j < src.length) {
          const c = src[j];
          if (esc) { esc = false; j += 1; continue; }
          if (c === "\\") { esc = true; j += 1; continue; }
          if (c === quote) { j += 1; break; }
          if (quote !== "`" && (c === "\n" || c === "\r")) break;
          j += 1;
        }
        const str = src.slice(i, j);
        if (!js && quote === "\"") {
          let k = j;
          while (k < src.length && /[ \t\r\n]/.test(src[k])) k += 1;
          if (src[k] === ":") {
            push(str, "hc-json-key");
            i = j;
            continue;
          }
        }
        push(str, "hc-json-string");
        i = j;
        continue;
      }

      if ((ch === "-" && next && /[0-9]/.test(next)) || /[0-9]/.test(ch)) {
        const before = i > 0 ? src[i - 1] : "";
        if (!/[A-Za-z_$]/.test(before)) {
          let j = i + 1;
          while (j < src.length && /[0-9.eE+-]/.test(src[j])) j += 1;
          push(src.slice(i, j), "hc-json-number");
          i = j;
          continue;
        }
      }

      if (/[A-Za-z_$]/.test(ch)) {
        let j = i + 1;
        while (j < src.length && /[A-Za-z0-9_$]/.test(src[j])) j += 1;
        const word = src.slice(i, j);
        if (word === "true" || word === "false" || word === "null" || word === "undefined") {
          push(word, "hc-json-literal");
        } else if (js && JS_KEYWORDS.test(word)) {
          push(word, "hc-code-keyword");
        } else {
          push(word, "");
        }
        i = j;
        continue;
      }

      push(ch, "");
      i += 1;
    }
    return html;
  }

  /**
   * Transparent textarea over a highlighted <pre> so comments / JSON tokens show colors.
   * Returns { root, textarea, setValue, refresh }.
   */
  function createHighlightedEditor(options) {
    const opts = options || {};
    const mode = opts.mode === "js" ? "js" : "json";
    const root = el("div", {
      class: ["hc-code-editor", opts.className || ""].filter(Boolean).join(" ")
    });
    const backdrop = el("pre", { class: "hc-code-editor-backdrop", "aria-hidden": "true" });
    const code = el("code", {});
    backdrop.appendChild(code);
    const textarea = el("textarea", {
      class: ["hc-textarea", "hc-code-editor-input", opts.inputClass || ""].filter(Boolean).join(" "),
      spellcheck: "false",
      placeholder: opts.placeholder || "",
      value: opts.value || ""
    });

    function paint() {
      const value = textarea.value;
      code.innerHTML = highlightSource(value, mode) + (value.endsWith("\n") ? "\n" : "");
    }

    function syncScroll() {
      backdrop.scrollTop = textarea.scrollTop;
      backdrop.scrollLeft = textarea.scrollLeft;
    }

    // Coalesce highlight repaints: typing in a large JSON body used to rebuild
    // the whole highlighted DOM on every keystroke.
    let paintFrame = 0;
    function schedulePaint() {
      if (paintFrame) return;
      paintFrame = requestAnimationFrame(() => {
        paintFrame = 0;
        if (root.isConnected) paint();
      });
    }

    function emit() {
      schedulePaint();
      if (typeof opts.onChange === "function") opts.onChange(textarea.value);
    }

    textarea.addEventListener("input", emit);
    textarea.addEventListener("scroll", syncScroll);
    bindCommentShortcut(textarea, emit);
    paint();
    root.append(backdrop, textarea);

    return {
      root,
      textarea,
      setValue: (value) => {
        textarea.value = value == null ? "" : String(value);
        paint();
      },
      refresh: paint
    };
  }

  /** True when Content-Type is JSON (incl. +json / charset). */
  function isJsonContentType(contentType) {
    const type = String(contentType || "").toLowerCase().split(";")[0].trim();
    return type === "application/json" || type === "text/json" || /\+json$/.test(type);
  }

  /** Strip line/block comments outside JSON strings (JSONC). Block comments → one space. */
  function stripJsonComments(text) {
    const src = String(text == null ? "" : text);
    let out = "";
    let i = 0;
    let inString = false;
    let escape = false;
    while (i < src.length) {
      const ch = src[i];
      const next = src[i + 1];
      if (inString) {
        out += ch;
        if (escape) escape = false;
        else if (ch === "\\") escape = true;
        else if (ch === "\"") inString = false;
        i += 1;
        continue;
      }
      if (ch === "\"") {
        inString = true;
        out += ch;
        i += 1;
        continue;
      }
      if (ch === "/" && next === "/") {
        i += 2;
        while (i < src.length && src[i] !== "\n" && src[i] !== "\r") i += 1;
        continue;
      }
      if (ch === "/" && next === "*") {
        i += 2;
        while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i += 1;
        if (i < src.length) i += 2;
        out += " ";
        continue;
      }
      out += ch;
      i += 1;
    }
    return out;
  }

  function parseJsonc(text) {
    return JSON.parse(stripJsonComments(text));
  }

  /** Tokenize JSONC (strings / numbers / literals / punct / comments). Skips whitespace. */
  function tokenizeJsonc(text) {
    const src = String(text == null ? "" : text);
    const tokens = [];
    let i = 0;
    while (i < src.length) {
      const ch = src[i];
      const next = src[i + 1];
      if (/\s/.test(ch)) { i += 1; continue; }
      if (ch === "/" && next === "/") {
        let j = i + 2;
        while (j < src.length && src[j] !== "\n" && src[j] !== "\r") j += 1;
        tokens.push({ type: "lineComment", value: src.slice(i, j) });
        i = j;
        continue;
      }
      if (ch === "/" && next === "*") {
        let j = i + 2;
        while (j < src.length && !(src[j] === "*" && src[j + 1] === "/")) j += 1;
        if (j < src.length) j += 2;
        tokens.push({ type: "blockComment", value: src.slice(i, j) });
        i = j;
        continue;
      }
      if (ch === "\"") {
        let j = i + 1;
        let esc = false;
        while (j < src.length) {
          const c = src[j];
          if (esc) { esc = false; j += 1; continue; }
          if (c === "\\") { esc = true; j += 1; continue; }
          if (c === "\"") { j += 1; break; }
          if (c === "\n" || c === "\r") break;
          j += 1;
        }
        tokens.push({ type: "string", value: src.slice(i, j) });
        i = j;
        continue;
      }
      if (ch === "{" || ch === "}" || ch === "[" || ch === "]" || ch === ":" || ch === ",") {
        tokens.push({ type: ch, value: ch });
        i += 1;
        continue;
      }
      if (ch === "-" || /[0-9]/.test(ch)) {
        let j = i + 1;
        while (j < src.length && /[0-9.eE+-]/.test(src[j])) j += 1;
        tokens.push({ type: "number", value: src.slice(i, j) });
        i = j;
        continue;
      }
      if (/[A-Za-z_]/.test(ch)) {
        let j = i + 1;
        while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j += 1;
        tokens.push({ type: "literal", value: src.slice(i, j) });
        i = j;
        continue;
      }
      i += 1;
    }
    return tokens;
  }

  function isJsoncCommentToken(token) {
    return token && (token.type === "lineComment" || token.type === "blockComment");
  }

  /** Pretty-print JSONC while keeping comments. Null if not a valid JSONC object/array. */
  function formatJsoncPreserve(text) {
    try {
      const parsed = parseJsonc(text);
      if (parsed === null || typeof parsed !== "object") return null;
    } catch (error) {
      return null;
    }
    const tokens = tokenizeJsonc(text);
    if (!tokens.length) return null;

    let out = "";
    let depth = 0;
    let atLineStart = true;

    const pad = () => "  ".repeat(depth);
    const ensureLine = () => {
      if (!atLineStart) {
        out += "\n";
        atLineStart = true;
      }
    };
    const writeIndent = () => {
      if (atLineStart) {
        out += pad();
        atLineStart = false;
      }
    };

    for (let i = 0; i < tokens.length; i += 1) {
      const tok = tokens[i];

      if (isJsoncCommentToken(tok)) {
        if (tok.type === "lineComment") {
          if (atLineStart) writeIndent();
          else out += " ";
          out += tok.value;
          out += "\n";
          atLineStart = true;
        } else if (atLineStart) {
          writeIndent();
          out += tok.value;
          out += "\n";
          atLineStart = true;
        } else {
          out += " " + tok.value;
        }
        continue;
      }

      if (tok.type === "{" || tok.type === "[") {
        writeIndent();
        out += tok.value;
        depth += 1;
        const closer = tok.type === "{" ? "}" : "]";
        if (tokens[i + 1] && tokens[i + 1].type === closer) {
          /* empty {} / [] stay compact on one line */
        } else {
          out += "\n";
          atLineStart = true;
        }
        continue;
      }

      if (tok.type === "}" || tok.type === "]") {
        depth = Math.max(0, depth - 1);
        const opener = tok.type === "}" ? "{" : "[";
        if (out.endsWith(opener)) {
          out += tok.value;
        } else {
          ensureLine();
          writeIndent();
          out += tok.value;
        }
        atLineStart = false;
        continue;
      }

      if (tok.type === ",") {
        out += ",\n";
        atLineStart = true;
        continue;
      }

      if (tok.type === ":") {
        out += ": ";
        atLineStart = false;
        continue;
      }

      writeIndent();
      out += tok.value;
      atLineStart = false;
    }

    return out.replace(/[ \t]+$/gm, "").replace(/\n+$/, "") + "\n";
  }

  function tryFormatJson(text) {
    return formatJsoncPreserve(text);
  }

  /**
   * Fullscreen code editor modal. Live-syncs via onChange; syncs back through onClose(value).
   * options: { title, value, mode, placeholder, showFormat, onChange, onClose }
   */
  function openCodeEditorFullscreen(options) {
    const opts = options || {};
    const mode = opts.mode === "js" ? "js" : "json";
    let latest = opts.value == null ? "" : String(opts.value);

    openModal({
      title: opts.title || t("action.fullscreen"),
      onDismiss: () => {
        if (typeof opts.onClose === "function") opts.onClose(latest);
      },
      render: (body, api) => {
        if (api.modal) api.modal.classList.add("is-fullscreen");
        body.classList.add("is-fill");

        const fsEditor = createHighlightedEditor({
          className: "hc-code-editor-fs",
          mode,
          value: latest,
          placeholder: opts.placeholder || "",
          onChange: (value) => {
            latest = value;
            if (typeof opts.onChange === "function") opts.onChange(value);
          }
        });

        const toolbar = el("div", { class: "hc-body-toolbar" });
        if (opts.showFormat !== false && mode === "json") {
          toolbar.append(el("button", {
            class: "hc-btn hc-btn-sm hc-btn-ghost",
            type: "button",
            text: t("action.format"),
            on: {
              click: () => {
                const formatted = tryFormatJson(fsEditor.textarea.value) || tryFormatXml(fsEditor.textarea.value);
                if (!formatted) return;
                fsEditor.setValue(formatted);
                latest = formatted;
                if (typeof opts.onChange === "function") opts.onChange(formatted);
              }
            }
          }));
        }
        toolbar.append(el("span", { class: "hc-hint", text: t("editor.fullscreenHint") }));
        body.append(toolbar, fsEditor.root);
        api._fsEditor = fsEditor;
      },
      actions: [
        {
          label: t("action.close"),
          kind: "primary",
          onClick: (api) => {
            if (typeof opts.onClose === "function") opts.onClose(latest);
            api.close();
          }
        }
      ]
    });
  }

  function looksLikeJson(text) {
    const stripped = stripJsonComments(text).trim();
    return stripped.startsWith("{") || stripped.startsWith("[");
  }

  /**
   * Toggle // line comments for the current selection (Ctrl+/ / ⌘+/).
   * Returns { value, selectionStart, selectionEnd } or null if unchanged.
   */
  function toggleLineComments(value, selStart, selEnd) {
    const text = String(value == null ? "" : value);
    const start = Math.max(0, Math.min(Number(selStart) || 0, text.length));
    let end = Math.max(start, Math.min(Number(selEnd) || 0, text.length));
    if (end > start && text[end - 1] === "\n") end -= 1;
    const lineStart = text.lastIndexOf("\n", start - 1) + 1;
    const lineEndIdx = text.indexOf("\n", end);
    const lineEnd = lineEndIdx < 0 ? text.length : lineEndIdx;
    const block = text.slice(lineStart, lineEnd);
    const lines = block.split("\n");
    if (!lines.length) return null;
    const commentable = lines.filter((line) => line.trim().length > 0);
    if (!commentable.length) return null;
    const allCommented = commentable.every((line) => /^\s*\/\//.test(line));
    const nextLines = lines.map((line) => {
      if (!line.trim()) return line;
      if (allCommented) return line.replace(/^(\s*)\/\/ ?/, "$1");
      const indent = (line.match(/^\s*/) || [""])[0];
      return indent + "// " + line.slice(indent.length);
    });
    const newBlock = nextLines.join("\n");
    return {
      value: text.slice(0, lineStart) + newBlock + text.slice(lineEnd),
      selectionStart: lineStart,
      selectionEnd: lineStart + newBlock.length
    };
  }

  /** Bind Ctrl+/ (⌘+/) line-comment toggle on a textarea. */
  function bindCommentShortcut(textarea, onChange) {
    if (!textarea || textarea.__hcCommentBound) return;
    textarea.__hcCommentBound = true;
    textarea.addEventListener("keydown", (event) => {
      if (event.key !== "/" || !(event.ctrlKey || event.metaKey) || event.altKey) return;
      event.preventDefault();
      const next = toggleLineComments(textarea.value, textarea.selectionStart, textarea.selectionEnd);
      if (!next) return;
      textarea.value = next.value;
      try {
        textarea.setSelectionRange(next.selectionStart, next.selectionEnd);
      } catch (_) { /* ignore */ }
      if (typeof onChange === "function") onChange(textarea.value);
    });
  }

  function tryFormatXml(text) {
    const trimmed = String(text || "").trim();
    if (!trimmed.startsWith("<")) return null;
    let depth = 0;
    const tokens = trimmed.replace(/>\s*</g, ">\n<").split("\n");
    return tokens.map((token) => {
      const line = token.trim();
      if (/^<\//.test(line)) depth = Math.max(0, depth - 1);
      const out = "  ".repeat(depth) + line;
      if (/^<[^!?/][^>]*[^/]>$/.test(line) && !/<\/[^>]+>$/.test(line)) depth += 1;
      return out;
    }).join("\n");
  }

  function isTextual(contentType) {
    const type = String(contentType || "").toLowerCase();
    return !type || /^(text\/|application\/(json|xml|javascript|x-www-form-urlencoded|graphql|yaml|x-yaml|sql)|image\/svg)/.test(type);
  }

  function isImage(contentType) {
    return /^image\/(?!svg)/.test(String(contentType || "").toLowerCase());
  }

  function debounce(fn, wait) {
    let timer = null;
    return function () {
      const args = arguments;
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(null, args), wait);
    };
  }

  function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function decodeText(base64) {
    try { return new TextDecoder("utf-8", { fatal: false }).decode(base64ToBytes(base64)); }
    catch (error) { return ""; }
  }

  /** Clickable catalog of {{$…}} built-ins (copy token on click).
   *  options.detailed → table with description + live sample preview. */
  function renderDynamicVarCatalog(options) {
    const detailed = !!(options && options.detailed);
    const t = (key, params) => HC.i18n.t(key, params);
    const catalog = (HC.store && HC.store.listDynamicVariables)
      ? HC.store.listDynamicVariables()
      : [];
    const wrap = el("div", { class: detailed ? "hc-dynvars is-detailed" : "hc-dynvars" });
    wrap.append(el("div", { class: "hc-dynvars-title", text: t("misc.dynamicVars") }));
    wrap.append(el("div", { class: "hc-hint", text: t("misc.dynamicHint") }));
    if (!catalog.length) return wrap;

    const groups = {};
    catalog.forEach((item) => {
      const group = item.group || "random";
      if (!groups[group]) groups[group] = [];
      groups[group].push(item);
    });
    ["id", "time", "random"].forEach((group) => {
      const items = groups[group];
      if (!items || !items.length) return;
      const section = el("div", { class: "hc-dynvars-group" });
      section.append(el("div", { class: "hc-dynvars-label", text: t(`misc.dynamicGroup.${group}`) }));
      if (detailed) {
        const table = el("div", { class: "hc-dynvars-table" });
        items.forEach((item) => {
          const token = `{{${item.name}}}`;
          const descKey = `misc.dynamic.${item.name}`;
          const desc = t(descKey);
          const sample = HC.store && HC.store.resolve
            ? HC.store.resolve(token)
            : "";
          const row = el("div", { class: "hc-dynvars-row" });
          row.append(el("button", {
            class: "hc-dynvar-chip",
            type: "button",
            text: token,
            title: t("misc.dynamicCopyHint"),
            on: {
              click: async () => {
                const ok = await copyText(token);
                toast(ok ? t("misc.dynamicCopy", { name: token }) : t("toast.copyFailed"), ok ? "success" : "error");
              }
            }
          }));
          row.append(el("span", {
            class: "hc-dynvars-desc",
            text: desc && desc !== descKey ? desc : ""
          }));
          row.append(el("code", {
            class: "hc-dynvars-sample",
            text: sample,
            title: t("misc.dynamicSampleHint")
          }));
          table.append(row);
        });
        section.append(table);
      } else {
        const chips = el("div", { class: "hc-dynvars-chips" });
        items.forEach((item) => {
          const token = `{{${item.name}}}`;
          const descKey = `misc.dynamic.${item.name}`;
          const desc = t(descKey);
          const title = desc && desc !== descKey ? `${token} — ${desc}` : token;
          chips.append(el("button", {
            class: "hc-dynvar-chip",
            type: "button",
            text: token,
            title,
            on: {
              click: async () => {
                const ok = await copyText(token);
                toast(ok ? t("misc.dynamicCopy", { name: token }) : t("toast.copyFailed"), ok ? "success" : "error");
              }
            }
          }));
        });
        section.append(chips);
      }
      wrap.append(section);
    });
    return wrap;
  }

  function openDynamicVarsDialog() {
    const t = (key, params) => HC.i18n.t(key, params);
    openModal({
      title: t("dialog.dynamicVarsTitle"),
      render: (body, api) => {
        if (api && api.modal) api.modal.classList.add("is-wide");
        body.append(renderDynamicVarCatalog({ detailed: true }));
      },
      actions: [
        {
          label: t("action.close"),
          kind: "primary",
          onClick: (api) => api.close()
        }
      ]
    });
  }

  /** Insert text at the caret of a textarea and optionally notify. */
  function insertTextAtCursor(textarea, text, onChange) {
    if (!textarea) return;
    const start = textarea.selectionStart == null ? textarea.value.length : textarea.selectionStart;
    const end = textarea.selectionEnd == null ? start : textarea.selectionEnd;
    const value = textarea.value;
    const next = value.slice(0, start) + text + value.slice(end);
    textarea.value = next;
    const pos = start + String(text).length;
    try { textarea.focus(); textarea.setSelectionRange(pos, pos); } catch (_) { /* ignore */ }
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    if (typeof onChange === "function") onChange(next);
  }

  /** Built-in parameter dictionary (ApiPost-style 字典库 starters). */
  const PARAM_DICTIONARY = [
    { key: "appId", descriptionKey: "paramHelper.dict.appId" },
    { key: "page", descriptionKey: "paramHelper.dict.page" },
    { key: "token", descriptionKey: "paramHelper.dict.token" },
    { key: "email", descriptionKey: "paramHelper.dict.email" },
    { key: "password", descriptionKey: "paramHelper.dict.password" },
    { key: "username", descriptionKey: "paramHelper.dict.username" },
    { key: "telephone", descriptionKey: "paramHelper.dict.telephone" },
    { key: "tel", descriptionKey: "paramHelper.dict.tel" },
    { key: "mobile", descriptionKey: "paramHelper.dict.mobile" }
  ];

  const paramHelperUi = { open: false, wide: false, tab: "dict", query: "" };

  /**
   * ApiPost-like 参数助手 rail next to a code editor.
   * options: { getTextarea, onInsert(text), className }
   * Returns { root, refresh }.
   */
  function createParamHelper(options) {
    const opts = options || {};
    const t = (key, params) => HC.i18n.t(key, params);
    const root = el("aside", {
      class: ["hc-param-helper", opts.className || ""].filter(Boolean).join(" "),
      "aria-label": t("paramHelper.title")
    });

    function insertToken(token) {
      const textarea = typeof opts.getTextarea === "function" ? opts.getTextarea() : null;
      if (textarea) {
        insertTextAtCursor(textarea, token, (value) => {
          if (typeof opts.onInsert === "function") opts.onInsert(token, value);
        });
      } else if (typeof opts.onInsert === "function") {
        opts.onInsert(token, null);
      }
      toast(t("paramHelper.inserted", { name: token }), "success");
    }

    function dictRows() {
      const rows = [];
      const seen = new Set();
      const environment = HC.store && HC.store.activeEnvironment ? HC.store.activeEnvironment() : null;
      (environment && environment.variables ? environment.variables : []).forEach((row) => {
        if (!row || row.enabled === false || !row.key) return;
        const key = String(row.key).trim();
        if (!key || seen.has(key)) return;
        seen.add(key);
        rows.push({
          key,
          token: `{{${key}}}`,
          detail: row.description || row.value || "",
          source: "env"
        });
      });
      PARAM_DICTIONARY.forEach((item) => {
        if (seen.has(item.key)) return;
        seen.add(item.key);
        const desc = t(item.descriptionKey);
        rows.push({
          key: item.key,
          token: `{{${item.key}}}`,
          detail: desc && desc !== item.descriptionKey ? desc : "",
          source: "dict"
        });
      });
      return rows;
    }

    function dynamicRows() {
      const catalog = (HC.store && HC.store.listDynamicVariables)
        ? HC.store.listDynamicVariables()
        : [];
      return catalog.map((item) => {
        const token = `{{${item.name}}}`;
        const descKey = `misc.dynamic.${item.name}`;
        const desc = t(descKey);
        const sample = HC.store && HC.store.resolve ? HC.store.resolve(token) : "";
        return {
          key: item.name,
          token,
          detail: desc && desc !== descKey ? desc : sample,
          source: "dynamic",
          group: item.group
        };
      });
    }

    function matchesQuery(row, query) {
      if (!query) return true;
      const q = query.toLowerCase();
      return String(row.key).toLowerCase().includes(q)
        || String(row.detail || "").toLowerCase().includes(q)
        || String(row.token || "").toLowerCase().includes(q);
    }

    function paint() {
      clear(root);
      root.classList.toggle("is-open", !!paramHelperUi.open);
      root.classList.toggle("is-wide", !!(paramHelperUi.open && paramHelperUi.wide));

      if (!paramHelperUi.open) {
        const rail = el("button", {
          type: "button",
          class: "hc-param-helper-rail",
          title: t("paramHelper.openHint"),
          on: { click: () => { paramHelperUi.open = true; paint(); } }
        });
        rail.append(el("span", {
          class: "hc-param-helper-rail-mid",
          html: `<span class="hc-param-helper-rail-label"><span class="hc-param-helper-rail-chevron" aria-hidden="true">«</span><span class="hc-param-helper-rail-text">${escapeHtml(t("paramHelper.title"))}</span></span>`
        }));
        root.append(rail);
        return;
      }

      const panel = el("div", { class: "hc-param-helper-panel" });
      const head = el("div", { class: "hc-param-helper-head" });
      const tabs = el("div", { class: "hc-param-helper-tabs" }, [
        el("button", {
          type: "button",
          class: `hc-param-helper-tab${paramHelperUi.tab === "dict" ? " is-on" : ""}`,
          text: t("paramHelper.tab.dict"),
          on: { click: () => { paramHelperUi.tab = "dict"; paint(); } }
        }),
        el("button", {
          type: "button",
          class: `hc-param-helper-tab${paramHelperUi.tab === "dynamic" ? " is-on" : ""}`,
          text: t("paramHelper.tab.dynamic"),
          on: { click: () => { paramHelperUi.tab = "dynamic"; paint(); } }
        })
      ]);
      const tools = el("div", { class: "hc-param-helper-tools" }, [
        el("button", {
          type: "button",
          class: "hc-icon-btn hc-param-helper-tool",
          title: paramHelperUi.wide ? t("paramHelper.narrow") : t("paramHelper.widen"),
          html: paramHelperUi.wide
            ? "<svg width=\"14\" height=\"14\" viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\"><path d=\"M6 3H3v3M10 3h3v3M6 13H3v-3M10 13h3v-3M3 3l4 4M13 3L9 7M3 13l4-4M13 13l-4-4\"/></svg>"
            : "<svg width=\"14\" height=\"14\" viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\"><path d=\"M9.5 2.5H13.5V6.5M6.5 13.5H2.5V9.5M13.5 2.5L9 7M2.5 13.5L7 9\"/></svg>",
          on: { click: () => { paramHelperUi.wide = !paramHelperUi.wide; paint(); } }
        }),
        el("button", {
          type: "button",
          class: "hc-icon-btn hc-param-helper-tool",
          title: t("action.collapse"),
          text: "«",
          on: { click: () => { paramHelperUi.open = false; paint(); } }
        })
      ]);
      head.append(tabs, tools);

      const search = el("input", {
        class: "hc-input hc-param-helper-search",
        type: "search",
        placeholder: t("paramHelper.search"),
        value: paramHelperUi.query || ""
      });
      search.addEventListener("input", () => {
        paramHelperUi.query = search.value;
        paintList();
      });

      const list = el("div", { class: "hc-param-helper-list" });
      function paintList() {
        clear(list);
        const query = String(paramHelperUi.query || "").trim();
        const rows = (paramHelperUi.tab === "dynamic" ? dynamicRows() : dictRows())
          .filter((row) => matchesQuery(row, query));
        if (!rows.length) {
          list.append(el("div", { class: "hc-param-helper-empty", text: t("paramHelper.empty") }));
          return;
        }
        rows.forEach((row) => {
          const item = el("button", {
            type: "button",
            class: "hc-param-helper-item",
            title: t("paramHelper.insertHint", { name: row.token }),
            on: { click: () => insertToken(row.token) }
          });
          item.append(el("span", { class: "hc-param-helper-key", text: row.key }));
          item.append(el("span", { class: "hc-param-helper-detail", text: row.detail || "" }));
          list.append(item);
        });
      }
      paintList();

      const foot = el("div", { class: "hc-param-helper-foot" }, [
        el("span", { class: "hc-param-helper-foot-label", text: t("paramHelper.title") }),
        el("button", {
          type: "button",
          class: "hc-link-btn",
          text: t("paramHelper.howTo"),
          on: {
            click: () => toast(t("paramHelper.howToDetail"), "success")
          }
        })
      ]);

      panel.append(head, search, list, foot);
      root.append(panel);
    }

    paint();
    return { root, refresh: paint };
  }

  /**
   * Wrap a code editor with the param-helper rail on the right.
   * Returns { root, editor, helper }.
   */
  function wrapEditorWithParamHelper(editor, options) {
    const opts = options || {};
    const row = el("div", { class: "hc-editor-with-helper" });
    const helper = createParamHelper({
      getTextarea: () => editor && editor.textarea,
      onInsert: (token, value) => {
        if (value != null && editor && typeof editor.setValue === "function") {
          // setValue would reset caret; value already applied via insertTextAtCursor
          if (typeof opts.onChange === "function") opts.onChange(value);
        } else if (typeof opts.onChange === "function" && editor) {
          opts.onChange(editor.textarea.value);
        }
      }
    });
    row.append(editor.root, helper.root);
    return { root: row, editor, helper };
  }

  const ICON_FORMAT = "<svg width=\"1em\" height=\"1em\" viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 4h10M3 8h7M3 12h10\"/><path d=\"M12.5 6.5l1.5 1.5-1.5 1.5\"/></svg>";
  /* Corners-style maximize — cleaner than diagonal expand arrows */
  const ICON_FULLSCREEN = "<svg width=\"1em\" height=\"1em\" viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 6V3h3M10 3h3v3M13 10v3h-3M6 13H3v-3\"/></svg>";
  /* Clipboard-with-check: insert a ready-made assertion snippet. */
  const ICON_SNIPPETS = "<svg width=\"1em\" height=\"1em\" viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"3\" y=\"2.5\" width=\"10\" height=\"12\" rx=\"1.5\"/><path d=\"M5.5 6.5h5M5.5 9h5M5.5 11.5h2.5\"/></svg>";

  /**
   * Float format / fullscreen icon buttons at the top-right of a code editor.
   * options: { onFormat?, onFullscreen? }
   */
  function mountEditorFloatActions(editor, options) {
    const opts = options || {};
    if (!editor || !editor.root) return null;
    const host = el("div", { class: "hc-editor-float-actions", role: "toolbar" });
    const t = (key, params) => HC.i18n.t(key, params);

    if (typeof opts.onFormat === "function") {
      host.append(el("button", {
        type: "button",
        class: "hc-editor-float-btn",
        title: t("action.format"),
        "aria-label": t("action.format"),
        html: ICON_FORMAT,
        on: { click: (event) => { event.preventDefault(); opts.onFormat(); } }
      }));
    }
    if (typeof opts.onFullscreen === "function") {
      host.append(el("button", {
        type: "button",
        class: "hc-editor-float-btn",
        title: t("editor.fullscreenHint"),
        "aria-label": t("action.fullscreen"),
        html: ICON_FULLSCREEN,
        on: { click: (event) => { event.preventDefault(); opts.onFullscreen(); } }
      }));
    }
    if (typeof opts.onSnippets === "function") {
      host.append(el("button", {
        type: "button",
        class: "hc-editor-float-btn",
        title: t("scripts.snippets"),
        "aria-label": t("scripts.snippets"),
        html: ICON_SNIPPETS,
        on: { click: (event) => { event.preventDefault(); opts.onSnippets(event); } }
      }));
    }
    editor.root.append(host);
    editor.root.classList.add("has-float-actions");
    return host;
  }

  /* ------------------------------------------------------- custom select -- */

  let openSelectApi = null;

  function closeOpenSelect() {
    if (openSelectApi) openSelectApi.close();
  }

  function createSelect(options) {
    const opts = options || {};
    let items = (opts.items || []).map((item) => (
      typeof item === "string" ? { value: item, label: item } : item
    ));
    let value = opts.value != null ? String(opts.value) : (items[0] ? String(items[0].value) : "");
    let disabled = !!opts.disabled;
    let menuNode = null;

    const extraClass = String(opts.className || "")
      .split(/\s+/)
      .filter((name) => name && name !== "hc-dd")
      .join(" ");
    const root = el("div", {
      class: `hc-dd${extraClass ? ` ${extraClass}` : ""}${opts.compact ? " is-compact" : ""}${disabled ? " is-disabled" : ""}`
    });
    const trigger = el("button", {
      type: "button",
      class: "hc-dd-trigger",
      "aria-haspopup": "listbox",
      "aria-expanded": "false",
      disabled: disabled || undefined
    }, [
      el("span", { class: "hc-dd-label" }),
      el("span", { class: "hc-dd-caret", "aria-hidden": "true" })
    ]);
    root.append(trigger);
    const labelNode = trigger.querySelector(".hc-dd-label");

    function labelFor(val) {
      const hit = items.find((item) => String(item.value) === String(val));
      if (hit) return hit.label;
      return opts.placeholder || "";
    }

    function syncLabel() {
      const text = labelFor(value);
      labelNode.textContent = text || opts.placeholder || "—";
      root.classList.toggle("is-empty", !text);
    }

    function close() {
      if (menuNode) {
        menuNode.remove();
        menuNode = null;
      }
      trigger.setAttribute("aria-expanded", "false");
      root.classList.remove("is-open");
      if (openSelectApi === api) openSelectApi = null;
    }

    function placeMenu(menu) {
      const rect = trigger.getBoundingClientRect();
      const width = Math.max(rect.width, opts.minMenuWidth || 0);
      menu.style.minWidth = `${width}px`;
      menu.style.width = opts.stretchMenu === false ? "auto" : `${width}px`;
      document.body.append(menu);
      const menuRect = menu.getBoundingClientRect();
      let top = rect.bottom + 4;
      let left = rect.left;
      if (top + menuRect.height > window.innerHeight - 8) {
        top = Math.max(8, rect.top - menuRect.height - 4);
      }
      if (left + menuRect.width > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - menuRect.width - 8);
      }
      menu.style.top = `${top}px`;
      menu.style.left = `${left}px`;
    }

    function open() {
      if (disabled) return;
      closeOpenSelect();
      const menu = el("div", {
        class: `hc-dd-menu${opts.menuClass ? ` ${opts.menuClass}` : ""}`,
        role: "listbox"
      });
      items.forEach((item) => {
        const selected = String(item.value) === String(value);
        const btn = el("button", {
          type: "button",
          class: `hc-dd-option${selected ? " is-active" : ""}${item.disabled ? " is-disabled" : ""}`,
          role: "option",
          "aria-selected": selected ? "true" : "false",
          disabled: item.disabled ? "true" : undefined,
          text: item.label
        });
        btn.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (item.disabled) return;
          const next = String(item.value);
          close();
          if (next === String(value)) return;
          value = next;
          syncLabel();
          if (typeof opts.onChange === "function") opts.onChange(value, api);
        });
        menu.append(btn);
      });
      if (!items.length) {
        menu.append(el("div", { class: "hc-dd-empty", text: opts.emptyText || "—" }));
      }
      menuNode = menu;
      placeMenu(menu);
      trigger.setAttribute("aria-expanded", "true");
      root.classList.add("is-open");
      openSelectApi = api;
    }

    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (menuNode) close();
      else open();
    });

    syncLabel();

    const api = {
      root,
      get value() { return value; },
      set value(next) {
        value = next == null ? "" : String(next);
        syncLabel();
      },
      setOptions(nextItems, keepValue) {
        items = (nextItems || []).map((item) => (
          typeof item === "string" ? { value: item, label: item } : item
        ));
        if (!keepValue || !items.some((item) => String(item.value) === String(value))) {
          value = items[0] ? String(items[0].value) : "";
        }
        syncLabel();
        if (menuNode) {
          close();
        }
      },
      setDisabled(next) {
        disabled = !!next;
        trigger.disabled = disabled;
        root.classList.toggle("is-disabled", disabled);
        if (disabled) close();
      },
      focus() { trigger.focus(); },
      close,
      open
    };
    root._hcSelect = api;
    return api;
  }

  document.addEventListener("click", (event) => {
    if (!openSelectApi) return;
    if (event.target.closest && event.target.closest(".hc-dd-menu")) return;
    if (event.target.closest && event.target.closest(".hc-dd") === openSelectApi.root) return;
    closeOpenSelect();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeOpenSelect();
  });
  window.addEventListener("resize", closeOpenSelect);
  window.addEventListener("scroll", closeOpenSelect, true);

  let activeContextMenu = null;

  function closeContextMenu() {
    if (activeContextMenu) {
      activeContextMenu.remove();
      activeContextMenu = null;
    }
  }

  function formatMenuShortcut(keys) {
    const text = String(keys || "").trim();
    if (!text) return "";
    const mac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || "")
      || /Mac OS X/i.test(navigator.userAgent || "");
    if (!mac) return text;
    return text
      .replace(/Ctrl/g, "⌘")
      .replace(/Alt/g, "⌥")
      .replace(/Shift/g, "⇧");
  }

  function appendContextLabel(btn, item, trailing) {
    btn.append(el("span", { class: "hc-context-label", text: item.label }));
    if (item.shortcut) {
      btn.append(el("span", {
        class: "hc-context-shortcut",
        text: formatMenuShortcut(item.shortcut)
      }));
    }
    if (trailing) btn.append(trailing);
  }

  function appendContextItems(menu, items, closeAll) {
    (items || []).forEach((item) => {
      if (!item) return;
      if (item.separator) {
        menu.append(el("div", { class: "hc-context-sep" }));
        return;
      }
      if (item.children && item.children.length) {
        const wrap = el("div", { class: "hc-context-subwrap" });
        const btn = el("button", {
          type: "button",
          class: `hc-context-item has-sub${item.disabled ? " is-disabled" : ""}`,
          disabled: item.disabled ? "true" : undefined
        });
        appendContextLabel(btn, item, el("span", {
          class: "hc-context-caret",
          "aria-hidden": "true",
          text: "›"
        }));
        const sub = el("div", { class: "hc-context-submenu", hidden: true });
        appendContextItems(sub, item.children, closeAll);
        let hideTimer = 0;
        const hide = () => {
          hideTimer = window.setTimeout(() => { sub.hidden = true; }, 120);
        };
        const show = () => {
          if (item.disabled) return;
          if (hideTimer) {
            window.clearTimeout(hideTimer);
            hideTimer = 0;
          }
          const root = wrap.closest(".hc-context-menu") || wrap.parentElement;
          if (root) {
            Array.prototype.forEach.call(root.querySelectorAll(".hc-context-submenu"), (node) => {
              if (node !== sub) node.hidden = true;
            });
          }
          sub.hidden = false;
          sub.classList.remove("is-left");
          const rect = btn.getBoundingClientRect();
          const subW = Math.max(sub.offsetWidth || 0, 148);
          if (rect.right + subW > window.innerWidth - 8) sub.classList.add("is-left");
        };
        wrap.addEventListener("mouseenter", show);
        wrap.addEventListener("mouseleave", hide);
        btn.addEventListener("click", (clickEvent) => {
          clickEvent.stopPropagation();
          if (item.disabled) return;
          if (sub.hidden) show();
          else hide();
        });
        wrap.append(btn, sub);
        menu.append(wrap);
        return;
      }
      const btn = el("button", {
        type: "button",
        class: `hc-context-item${item.danger ? " is-danger" : ""}${item.disabled ? " is-disabled" : ""}`,
        disabled: item.disabled ? "true" : undefined
      });
      appendContextLabel(btn, item);
      btn.addEventListener("click", async (clickEvent) => {
        clickEvent.stopPropagation();
        if (item.disabled) return;
        closeAll();
        if (item.onClick) await item.onClick();
      });
      menu.append(btn);
    });
  }

  function openContextMenu(event, items, options) {
    if (event && event.preventDefault) event.preventDefault();
    if (event && event.stopPropagation) event.stopPropagation();
    closeContextMenu();
    const opts = options || {};
    const menu = el("div", {
      class: `hc-context-menu${opts.className ? ` ${opts.className}` : ""}`,
      id: opts.id || "hc-context-menu"
    });
    appendContextItems(menu, items, closeContextMenu);
    document.body.append(menu);
    const width = Math.max(menu.offsetWidth || 168, opts.minWidth || 188);
    const height = menu.offsetHeight || ((items || []).length * 32 + 12);
    const x = event && typeof event.clientX === "number" ? event.clientX : 8;
    const y = event && typeof event.clientY === "number" ? event.clientY : 8;
    const left = Math.max(8, Math.min(x, window.innerWidth - width - 8));
    const top = Math.max(8, Math.min(y, window.innerHeight - height - 8));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    activeContextMenu = menu;
    return menu;
  }

  document.addEventListener("click", (event) => {
    if (!activeContextMenu) return;
    if (event.target.closest && event.target.closest(".hc-context-menu")) return;
    closeContextMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeContextMenu();
  });
  window.addEventListener("resize", closeContextMenu);
  window.addEventListener("scroll", closeContextMenu, true);

  /** Save text as a file. Shared by the collection export and run-report dialogs.
      Returns false when the host frame blocks downloads (Copy still works). */
  function downloadText(text, filename) {
    try {
      const blob = new Blob([String(text == null ? "" : text)], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename || "download.txt";
      anchor.style.display = "none";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      return true;
    } catch (error) {
      console.error("downloadText failed", error);
      return false;
    }
  }

  window.HC.util = {
    $, $$, el, clear, uid, escapeHtml, escapeAttr,
    formatBytes, formatDuration, statusClass,
    copyText, toast, openModal, closeModal, confirmDialog, promptDialog,
    openContextMenu, closeContextMenu,
    createSelect, closeOpenSelect,
    createKVEditor, emptyRow, readFileBase64, varTips, renderDynamicVarCatalog, openDynamicVarsDialog,
    insertTextAtCursor, createParamHelper, wrapEditorWithParamHelper, mountEditorFloatActions,
    highlightJson, highlightSource, createHighlightedEditor, openCodeEditorFullscreen,
    tryFormatJson, formatJsoncPreserve, tryFormatXml, isTextual, isImage, looksLikeJson,
    isJsonContentType, stripJsonComments, parseJsonc, tokenizeJsonc,
    toggleLineComments, bindCommentShortcut,
    debounce, decodeText, base64ToBytes, downloadText
  };
})();

