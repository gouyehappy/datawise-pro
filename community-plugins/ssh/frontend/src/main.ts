import { createApp, type App as VueApp } from "vue";
import App from "./App.vue";
import MonitorPanel from "./components/MonitorPanel.vue";
import "@xterm/xterm/css/xterm.css";
import "./style.css";
import "./styles/tailwind.css";
import { installHostThemeBridge } from "../../shared/frontend/themeSync";
import { initUiStorage } from "./lib/uiStorage";
import { isMonitorContext, isMonitorContribution, MONITOR_CONTRIBUTION_ID } from "./lib/pluginContext";

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

function readUrlContributionId(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get("dwContributionId")?.trim() || "";
    if (fromQuery) return fromQuery;
    // Some hosts put the ticket URL under a hash / nested query.
    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
    if (hash.includes("=")) {
      const hashParams = new URLSearchParams(hash.startsWith("?") ? hash.slice(1) : hash);
      return hashParams.get("dwContributionId")?.trim() || "";
    }
  } catch {
    // ignore
  }
  return "";
}

async function waitForHostApi(timeoutMs = 8000): Promise<typeof window.datawisePlugin | undefined> {
  const deadline = Date.now() + timeoutMs;
  while (!window.datawisePlugin && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return window.datawisePlugin;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(undefined);
    }, ms);
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(value);
      },
      () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(undefined);
      },
    );
  });
}

function resolveContributionId(context: Record<string, unknown>): string {
  const fromUrl = readUrlContributionId();
  if (fromUrl) return fromUrl;
  const api = window.datawisePlugin as { contributionId?: string } | undefined;
  if (typeof api?.contributionId === "string" && api.contributionId) return api.contributionId;
  if (typeof context.contributionId === "string" && context.contributionId) return context.contributionId;
  return "";
}

function shouldMountMonitor(context: Record<string, unknown>, contributionId: string): boolean {
  return isMonitorContribution(contributionId) || isMonitorContext(context) || contributionId === MONITOR_CONTRIBUTION_ID;
}

function mountRoutedApp(context: Record<string, unknown>): VueApp<Element> {
  const contributionId = resolveContributionId(context);
  const app = shouldMountMonitor(context, contributionId)
    ? createApp(MonitorPanel, { context })
    : createApp(App);
  app.config.errorHandler = (err) => {
    console.error("[ssh-ui]", err);
  };
  app.mount("#app");
  return app;
}

async function resolveBootContext(api: typeof window.datawisePlugin | undefined): Promise<Record<string, unknown>> {
  const injected = (api?.context && typeof api.context === "object" ? api.context : {}) as Record<string, unknown>;
  const urlContributionId = readUrlContributionId();
  // URL contribution id is authoritative and available before postMessage — mount immediately.
  if (isMonitorContribution(urlContributionId)) {
    return {
      ...injected,
      contributionId: urlContributionId,
      plugin: { mode: "monitor", ...(typeof injected.plugin === "object" && injected.plugin && !Array.isArray(injected.plugin) ? injected.plugin : {}) },
    };
  }

  const ready = api ? ((await withTimeout(api.ready, 3000)) ?? {}) : {};
  let fromRequest: Record<string, unknown> = {};
  if (api?.request) {
    try {
      const result = await withTimeout(api.request<Record<string, unknown>>("host.getContext"), 2000);
      if (result && typeof result === "object") fromRequest = result;
    } catch {
      // ignore
    }
  }
  let context = { ...injected, ...ready, ...fromRequest };
  if (urlContributionId && !context.contributionId) context = { ...context, contributionId: urlContributionId };

  // Brief poll: openMonitorPanel may land context a tick after ready.
  if (!shouldMountMonitor(context, resolveContributionId(context))) {
    const deadline = Date.now() + 1200;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const live = (api?.context && typeof api.context === "object" ? api.context : {}) as Record<string, unknown>;
      context = { ...context, ...live };
      if (shouldMountMonitor(context, resolveContributionId(context))) break;
    }
  }
  return context;
}

async function boot(): Promise<void> {
  // Prefer sync URL route so monitor never mounts App (which would open+flap SSH).
  const urlContributionId = readUrlContributionId();
  if (isMonitorContribution(urlContributionId)) {
    mountRoutedApp({
      contributionId: urlContributionId,
      plugin: { mode: "monitor" },
      ...(window.datawisePlugin?.context && typeof window.datawisePlugin.context === "object"
        ? (window.datawisePlugin.context as Record<string, unknown>)
        : {}),
    });
    // Refresh context after host ready without remounting.
    void waitForHostApi().then(async (api) => {
      const ctx = await resolveBootContext(api);
      // MonitorPanel already running; context updates via host events if needed.
      void ctx;
    });
    return;
  }

  const api = await waitForHostApi();
  const context = await resolveBootContext(api);
  mountRoutedApp(context);
}

try {
  installHostThemeBridge({
    "--ui-font-family": 'var(--font-sans, "Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif)',
    "--terminal-font-family": 'var(--font-mono, "Cascadia Mono", Consolas, monospace)',
  });
} catch (cause) {
  console.error("[ssh-ui] theme bridge failed", cause);
}

void boot().catch((cause) => {
  console.error("[ssh-ui] mount failed", cause);
  showBootFailure(cause);
});

void initUiStorage().catch((cause) => {
  console.error("[ssh-ui] ui storage init failed", cause);
});
