/* Ctrl+P command palette: jump to any request, tab or frequent action. */

(function () {
  const util = HC.util;
  const store = HC.store;
  const t = (key, params) => HC.i18n.t(key, params);
  const el = util.el;

  function flatten(items, prefix, out) {
    (items || []).forEach((item) => {
      if (!item) return;
      const title = prefix ? `${prefix}/${item.name || ""}` : (item.name || "");
      if (item.items) flatten(item.items, title, out);
      else if (item.id) out.push({ id: item.id, title, method: item.method || "GET" });
    });
  }

  function requestItems() {
    const out = [];
    (store.state.collections || []).forEach((collection) => {
      flatten(collection.items, collection.name || "", out);
    });
    return out;
  }

  /* Every menu entry registers in HC.actions; the palette is just a view over
     that registry. Fall back to a minimal list if the registry is unavailable. */
  function commandItems() {
    if (HC.actions && typeof HC.actions.list === "function") return HC.actions.list();
    return [
      { id: "new-request", title: t("cmd.newRequest"), group: t("cmd.commands"),
        run: () => { if (HC.app) HC.app.createHttpRequest(); } },
      { id: "shortcuts", title: t("cmd.shortcuts"), group: t("cmd.commands"),
        run: () => { if (HC.shortcuts) HC.shortcuts.openHelp(); } }
    ];
  }

  function open() {
    const requests = requestItems().map((item) => ({
      id: `saved:${item.id}`,
      title: item.title,
      group: t("cmd.requests"),
      badge: item.method,
      run: () => {
        if (store.state.sideView === "environments") store.state.sideView = "collections";
        store.openSavedRequest(item.id);
      }
    }));
    (store.state.tabs || []).forEach((tab) => {
      requests.unshift({
        id: `tab:${tab.id}`,
        title: `${tab.name || store.requestTitle(tab)}`,
        group: t("cmd.tabs"),
        badge: tab.method || "GET",
        run: () => {
          store.setActiveTab(tab.id);
          if (HC.viewRequest) HC.viewRequest.render();
          if (HC.viewResponse) HC.viewResponse.render();
        }
      });
    });
    const all = requests.concat(commandItems());
    let filtered = all.slice();
    let selected = 0;

    util.openModal({
      title: t("cmd.title"),
      className: "hc-command-palette",
      actions: [],
      render: (body, api) => {
        if (api && api.modal) api.modal.classList.add("hc-command-palette");
        const input = el("input", {
          class: "hc-input hc-command-input",
          type: "text",
          placeholder: t("cmd.placeholder"),
          spellcheck: "false"
        });
        const list = el("div", { class: "hc-command-list", role: "listbox" });
        const empty = el("div", { class: "hc-command-empty", text: t("cmd.empty"), hidden: true });
        body.append(input, list, empty);

        function draw() {
          util.clear(list);
          filtered.forEach((item, index) => {
            const row = el("button", {
              type: "button",
              class: `hc-command-row${index === selected ? " is-selected" : ""}`,
              role: "option",
              "aria-selected": index === selected ? "true" : "false"
            }, [
              el("span", { class: "hc-command-group", text: item.group || "" }),
              el("span", { class: "hc-command-title", text: item.title }),
              item.badge ? el("span", { class: "hc-command-badge", text: item.badge }) : null
            ]);
            row.addEventListener("click", () => {
              api.close();
              item.run();
            });
            row.addEventListener("mousemove", () => {
              if (selected === index) return;
              selected = index;
              list.querySelectorAll(".hc-command-row").forEach((node, i) => {
                node.classList.toggle("is-selected", i === selected);
              });
            });
            list.append(row);
          });
          empty.hidden = filtered.length > 0;
        }

        function choose() {
          const item = filtered[selected];
          if (!item) return;
          api.close();
          item.run();
        }

        input.addEventListener("input", () => {
          const query = String(input.value || "").toLowerCase().trim();
          filtered = query
            ? all.filter((item) => `${item.title} ${item.group || ""} ${item.keywords || ""}`.toLowerCase().includes(query))
            : all.slice();
          selected = 0;
          draw();
        });
        input.addEventListener("keydown", (event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!filtered.length) return;
            selected = (selected + (event.key === "ArrowDown" ? 1 : -1) + filtered.length) % filtered.length;
            list.querySelectorAll(".hc-command-row").forEach((node, i) => {
              node.classList.toggle("is-selected", i === selected);
              if (i === selected) node.scrollIntoView({ block: "nearest" });
            });
          } else if (event.key === "Enter") {
            event.preventDefault();
            choose();
          }
        });
        draw();
        requestAnimationFrame(() => input.focus());
      }
    });
  }

  window.HC.commandPalette = { open };
})();
