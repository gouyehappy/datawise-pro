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
