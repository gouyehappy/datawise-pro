import { createApp, type App as VueApp } from "vue";
import App from "./App.vue";
import "@xterm/xterm/css/xterm.css";
import "./style.css";
import "./styles/tailwind.css";
import { installHostThemeBridge } from "../../shared/frontend/themeSync";
import { initUiStorage } from "./lib/uiStorage";

function showBootFailure(cause: unknown): void {
  const message = cause instanceof Error ? cause.message : String(cause);
  const root = document.getElementById("app");
  if (!root) return;
  root.innerHTML = "";
  const panel = document.createElement("div");
  panel.setAttribute("role", "alert");
  panel.style.cssText = [
    "box-sizing:border-box",
    "min-height:100%",
    "margin:0",
    "padding:24px",
    "font:14px/1.45 ui-sans-serif,system-ui,sans-serif",
    "color:#e5e7eb",
    "background:#131416",
  ].join(";");
  panel.innerHTML = [
    "<h1 style=\"margin:0 0 8px;font-size:16px\">SSH workbench failed to start</h1>",
    `<pre style="white-space:pre-wrap;word-break:break-word;margin:0;color:#fca5a5">${message
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")}</pre>`,
  ].join("");
  root.appendChild(panel);
}

function mountApp(): VueApp<Element> {
  const app = createApp(App);
  app.config.errorHandler = (err) => {
    console.error("[ssh-ui]", err);
  };
  app.mount("#app");
  return app;
}

try {
  installHostThemeBridge({
    "--ui-font-family": 'var(--font-sans, "Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif)',
    "--terminal-font-family": 'var(--font-mono, "Cascadia Mono", Consolas, monospace)',
  });
} catch (cause) {
  console.error("[ssh-ui] theme bridge failed", cause);
}

// Mount first so the host cover can reveal; hydrate storage in the background.
// Waiting on host.storage.getAll previously left a blank light paint-guard forever.
try {
  mountApp();
} catch (cause) {
  console.error("[ssh-ui] mount failed", cause);
  showBootFailure(cause);
}

void initUiStorage().catch((cause) => {
  console.error("[ssh-ui] ui storage init failed", cause);
});
