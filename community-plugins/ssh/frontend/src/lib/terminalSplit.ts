/**
 * In-pane terminal split + sync-input helpers (Motty-style broadcast).
 * Layout state only — PTY open/close and xterm wiring stay in App.vue.
 */

export type TerminalSplitOrientation = "vertical" | "horizontal";

export const TERMINAL_SPLIT_ORIENTATION_KEY = "ssh-terminal-split-orientation";
export const TERMINAL_SYNC_INPUT_KEY = "ssh-terminal-sync-input";
/** Cap in-pane shells so one workbench cannot flood the sidecar. */
export const TERMINAL_SPLIT_MAX_PANES = 2;

export function sanitizeSplitOrientation(raw: string | null | undefined): TerminalSplitOrientation {
  return raw === "horizontal" ? "horizontal" : "vertical";
}

/** Sync input defaults off — typing into every pane by accident is dangerous. */
export function sanitizeSyncInputEnabled(raw: string | null | undefined): boolean {
  return raw === "true";
}

/** Session ids that should receive a keystroke when sync is on. */
export function resolveSyncInputTargets(options: {
  syncEnabled: boolean;
  primarySessionId: string | undefined;
  splitSessionId: string | undefined;
  sourceSessionId: string | undefined;
}): string[] {
  const primary = options.primarySessionId?.trim() || "";
  const split = options.splitSessionId?.trim() || "";
  if (!options.syncEnabled) {
    const source = options.sourceSessionId?.trim() || primary;
    return source ? [source] : [];
  }
  const ids: string[] = [];
  if (primary) ids.push(primary);
  if (split && split !== primary) ids.push(split);
  return ids;
}

export function canOpenTerminalSplit(options: {
  connected: boolean;
  primarySessionId: string | undefined;
  splitSessionId: string | undefined;
  protocolKind?: string | null;
}): boolean {
  if (!options.connected || !options.primarySessionId) return false;
  if (options.splitSessionId) return false;
  // Local / telnet / serial keep a single PTY per workbench for now.
  if (options.protocolKind && options.protocolKind !== "ssh") return false;
  return true;
}
