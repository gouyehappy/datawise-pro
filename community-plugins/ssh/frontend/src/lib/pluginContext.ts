/** Resolve the current workbench id from the host plugin bridge. */

export function resolveWorkbenchId(
  context?: Record<string, unknown> | null,
): string {
  const fromContext =
    (typeof context?.workbenchId === "string" && context.workbenchId) ||
    (typeof context?.workbench_id === "string" && context.workbench_id) ||
    "";
  if (fromContext) return fromContext;
  try {
    const api = window.datawisePlugin as {
      context?: { workbenchId?: string };
    };
    return api?.context?.workbenchId?.trim() || "";
  } catch {
    return "";
  }
}

/**
 * Reads `context.plugin.mode`; missing/non-object/array payloads or a non-string
 * mode return empty string.
 */
export function readPluginMode(context: Record<string, unknown> | undefined | null): string {
  const plugin = context?.plugin;
  if (!plugin || typeof plugin !== "object" || Array.isArray(plugin)) return "";
  const mode = (plugin as Record<string, unknown>).mode;
  return typeof mode === "string" ? mode : "";
}

/**
 * Multi-server monitor workbench contribution id (manifest contributions).
 * Host tabs that open this contribution (or inject plugin.mode=monitor) route
 * to MonitorPanel in main.ts.
 */
export const MONITOR_CONTRIBUTION_ID = "io.datawise.community.ssh.monitor";

export function isMonitorContribution(contributionId: string | undefined | null): boolean {
  return contributionId === MONITOR_CONTRIBUTION_ID;
}

/**
 * Toolbar openMonitorPanel injects plugin.mode="monitor" so routing still lands
 * on MonitorPanel when the host init message lacks a usable contributionId.
 */
export function isMonitorContext(context: Record<string, unknown> | undefined | null): boolean {
  return readPluginMode(context) === "monitor";
}
