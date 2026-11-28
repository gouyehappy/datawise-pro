/* Central action registry for Ctrl+P. Every menu entry registers here once and
   becomes searchable; titles/groups are resolved lazily so a locale switch and
   the async host handshake never leave stale labels behind. */

(function () {
  const registry = new Map();

  function t(key, params) { return HC.i18n.t(key, params); }

  function register(id, action) {
    if (!id || !action || typeof action.run !== "function") return;
    registry.set(id, Object.assign({ id, group: "", keywords: "" }, action));
  }

  function unregister(id) { registry.delete(id); }

  function resolveValue(value) { return typeof value === "function" ? value() : value; }

  function list() {
    const items = Array.from(registry.values()).map((action) => ({
      id: action.id,
      title: resolveValue(action.title),
      group: resolveValue(action.group),
      badge: action.badge || "",
      keywords: action.keywords || "",
      run: action.run
    }));
    /* Environment switching is stateful, so generate those commands at query time. */
    const state = HC.store && HC.store.state;
    (state && state.environments || []).forEach((env) => {
      if (!env || !env.id) return;
      items.push({
        id: `env:${env.id}`,
        title: t("cmd.switchEnv", { name: env.name || "" }),
        group: t("cmd.group.data"),
        badge: "ENV",
        keywords: "environment env switch 环境 切换",
        run: () => {
          HC.store.setActiveEnvironment(env.id);
          if (HC.viewSidebar) HC.viewSidebar.render();
        }
      });
    });
    return items;
  }

  function run(id) {
    const action = list().find((item) => item.id === id);
    if (action) action.run();
  }

  function sideView(view) {
    HC.store.state.sideView = view;
    if (HC.viewSidebar) HC.viewSidebar.render();
    if (HC.viewEnv) HC.viewEnv.syncLayout();
  }

  function call(path) {
    const parts = path.split(".");
    let target = window.HC;
    for (const part of parts) {
      target = target && target[part];
      if (!target) return undefined;
    }
    if (typeof target !== "function") return undefined;
    return target.apply(null, Array.prototype.slice.call(arguments, 1));
  }

  function registerBuiltins() {
    const R = () => t("cmd.group.request");
    const I = () => t("cmd.group.import");
    const V = () => t("cmd.group.view");
    const D = () => t("cmd.group.data");

    const add = (id, titleKey, group, keywords, run, badge) => register(id, {
      title: () => t(titleKey), group, keywords, run, badge
    });

    add("new-request", "action.newRequest", R, "new http request 新建 请求", () => call("app.createHttpRequest"));
    add("paste-create", "action.pasteCreate", R, "clipboard curl url 粘贴 创建", () => call("app.createFromClipboard"));
    add("duplicate-tab", "action.duplicate", R, "duplicate clone tab 复制", () => call("app.duplicateActiveTab"));
    add("copy-curl", "action.copyCurl", R, "curl copy 复制 命令", () => call("app.copyCurl"));

    const protocols = [
      ["sse", "action.addSse", "SSE"],
      ["websocket", "action.addWs", "WS"],
      ["socketio", "action.addSio", "SIO"],
      ["grpc", "action.addGrpc", "GRPC"],
      ["graphql", "action.addGraphql", "GQL"],
      ["tcp", "action.addTcp", "TCP"],
      ["markdown", "action.addMarkdown", "MD"]
    ];
    protocols.forEach(([kind, labelKey, badge]) => {
      add(`new-${kind}`, labelKey, R, `${kind} ${badge} 新建`, () => call("app.createTypedRequest", kind), badge);
    });

    add("import-curl", "action.addImportCurl", I, "curl import 导入", () => call("app.openCurlImport"));
    add("import-postman", "action.addImportPostman", I, "postman import 导入", () => call("app.openPostmanImport"));
    add("import-har", "action.addImportHar", I, "har chrome devtools import 导入", () => call("app.openHarImport"));
    add("import-openapi", "action.addImportAi", I, "openapi swagger yaml import 导入", () => call("app.openOpenApiExtract"));
    add("import-paste", "action.addImportPaste", I, "json paste import 导入 粘贴", () => call("viewSidebar.openImportDialog"));
    /** The palette has no selection context, so all export commands target the
        first collection; openExportDialog takes an optional initial format. */
    const openFirstCollection = (format) => {
      const collections = HC.store.state.collections || [];
      if (!collections.length) {
        HC.util.toast(t("side.emptyCollections"), "error");
        return;
      }
      call("viewSidebar.openExportDialog", collections[0], format);
    };
    add("export-collection", "action.export", I, "export json postman 导出", () => openFirstCollection());
    add("export-docs-markdown", "docExport.markdown", I, "api docs markdown md 接口 文档 导出", () => openFirstCollection("markdown"));
    add("export-docs-html", "docExport.html", I, "api docs html 接口 文档 导出", () => openFirstCollection("html"));
    add("globals", "action.globals", D, "global variables globals 全局 变量", () => call("app.openGlobalsDialog"));
    add("cases", "cases.title", R, "cases use case 用例 参数组 批量", () => call("app.openCasesDialog"));

    add("layout-balanced", "pane.layoutBalanced", V, "layout reset balanced 布局 平衡 恢复", () => call("app.setPaneLayout", "balanced"));
    add("layout-request", "pane.layoutRequest", V, "layout maximize request 布局 最大化 请求", () => call("app.setPaneLayout", "request"));
    add("layout-response", "pane.layoutResponse", V, "layout maximize response 布局 最大化 响应", () => call("app.setPaneLayout", "response"));
    add("dynamic-vars", "action.dynamicVars", V, "dynamic variables 内置 变量 字典", () => call("util.openDynamicVarsDialog"));
    add("shortcuts", "shortcuts.title", V, "keyboard shortcuts 快捷键", () => call("shortcuts.openHelp"));
    add("settings", "action.settings", V, "settings preferences 设置", () => call("app.openSettings"));

    add("environments", "cmd.openEnvironments", D, "environment env 环境 管理", () => sideView("environments"));
    add("cookie-manager", "action.cookieManager", D, "cookie jar manager 管理", () => call("app.openCookieManager"));
    add("workflow", "cmd.runWorkflow", D, "workflow run folder 工作流 运行 文件夹", () => call("workflow.openRunDialog"));
    add("clear-history", "action.clearHistory", D, "history clear 清空 历史", () => call("store.clearHistory"));
  }

  registerBuiltins();

  window.HC.actions = { register, unregister, list, run };
})();
