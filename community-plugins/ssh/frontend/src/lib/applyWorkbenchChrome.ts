// Apply host appearance colors onto documentElement for non-terminal roots
// (MonitorPanel, etc.). App.vue keeps a richer path that also drives xterm.
//
// Surface colors intentionally use the scheme palette (not host --color-* tokens):
// the theme bridge maps --foreground → var(--color-foreground), and a dark iframe
// can receive light-scheme foreground tokens → dark-on-dark. Inline palette values
// beat the bridge and keep Monitor readable.
import {
  HOST_APPEARANCE_PALETTES,
  HOST_POPOVER,
  resolveAppearance,
  type DatawisePluginAppearanceInput,
} from "./appearance";
import { isHostPluginTheme, onHostThemeChange, themeToAppearance } from "./hostTheme";

export function applyWorkbenchChrome(next?: DatawisePluginAppearanceInput | null): void {
  const resolved = resolveAppearance(next ?? undefined);
  const colors = HOST_APPEARANCE_PALETTES[resolved.colorScheme];
  const root = document.documentElement;
  root.dataset.theme = resolved.colorScheme;
  root.style.colorScheme = resolved.colorScheme;
  root.style.setProperty("--background", colors.background);
  root.style.setProperty("--foreground", colors.foreground);
  root.style.setProperty("--muted", colors.muted);
  root.style.setProperty("--muted-foreground", colors.mutedForeground);
  root.style.setProperty("--accent", colors.accent);
  root.style.setProperty("--accent-foreground", colors.accentForeground);
  root.style.setProperty("--border", colors.border);
  root.style.setProperty("--destructive", colors.destructive);
  root.style.setProperty("--popover", HOST_POPOVER[resolved.colorScheme]);
  root.style.setProperty("--card", HOST_POPOVER[resolved.colorScheme]);
  if (resolved.ui?.fontFamily) {
    root.style.setProperty("--ui-font-family", resolved.ui.fontFamily);
  }
  if (resolved.ui?.fontSize) {
    root.style.setProperty("--dw-font-size", resolved.ui.fontSize);
  }
}

/** Subscribe to host appearance/theme; returns an unsubscribe. */
export function bindWorkbenchChrome(api: typeof window.datawisePlugin | undefined): () => void {
  let stopped = false;
  let unsubAppearance: (() => void) | undefined;
  let unsubTheme: (() => void) | undefined;
  let pollTimer: number | undefined;

  const attach = (plugin: NonNullable<typeof window.datawisePlugin>) => {
    if (stopped) return;
    unsubAppearance?.();
    unsubTheme?.();
    if (plugin.appearance) applyWorkbenchChrome(plugin.appearance);
    else if (isHostPluginTheme(plugin.theme)) applyWorkbenchChrome(themeToAppearance(plugin.theme));
    else applyWorkbenchChrome();

    unsubAppearance = plugin.onAppearanceChange?.(applyWorkbenchChrome);
    if (!unsubAppearance) {
      unsubTheme = onHostThemeChange((theme) => applyWorkbenchChrome(themeToAppearance(theme)));
    }
  };

  if (api) {
    attach(api);
  } else {
    // Monitor often mounts from URL before postMessage injects the host API.
    applyWorkbenchChrome();
    unsubTheme = onHostThemeChange((theme) => applyWorkbenchChrome(themeToAppearance(theme)));
    const started = Date.now();
    pollTimer = window.setInterval(() => {
      if (stopped) return;
      const late = window.datawisePlugin;
      if (late) {
        window.clearInterval(pollTimer);
        pollTimer = undefined;
        attach(late);
      } else if (Date.now() - started > 10_000) {
        window.clearInterval(pollTimer);
        pollTimer = undefined;
      }
    }, 50);
  }

  return () => {
    stopped = true;
    if (pollTimer !== undefined) window.clearInterval(pollTimer);
    unsubAppearance?.();
    unsubTheme?.();
  };
}
