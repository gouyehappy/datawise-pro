import {
  normalizeHistoryCommand,
  pushCommandHistory,
  type HistoryEntry,
} from "./commandHistory";
import { scoreSubsequence } from "./commandSuggest";

/**
 * Warp-style history overlay keys: ↑↓ navigate, Esc cancel,
 * Enter/Tab fill, Ctrl/Cmd+Enter fill+run, Delete/Backspace remove.
 */
export type HistoryPanelKey =
  | { action: "ignore" }
  | { action: "move"; delta: number }
  | { action: "confirm" }
  | { action: "confirm-run" }
  | { action: "remove" }
  | { action: "pin" }
  | { action: "cancel" };

/** Ctrl/Cmd+R in the terminal opens the Warp-style history overlay. */
export function isHistoryOverlayShortcut(options: {
  type?: string;
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): boolean {
  if (options.type && options.type !== "keydown") return false;
  if (options.altKey || options.shiftKey) return false;
  if (!(options.ctrlKey || options.metaKey)) return false;
  return options.key === "r" || options.key === "R";
}

export function resolveHistoryPanelKey(options: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}): HistoryPanelKey {
  const mod = options.ctrlKey || options.metaKey;
  if (options.altKey) return { action: "ignore" };
  if (options.key === "ArrowUp" && !mod) return { action: "move", delta: 1 };
  if (options.key === "ArrowDown" && !mod) return { action: "move", delta: -1 };
  if (options.key === "Enter" && mod) return { action: "confirm-run" };
  if ((options.key === "Enter" || options.key === "Tab") && !mod) return { action: "confirm" };
  if (options.key === "Escape") return { action: "cancel" };
  if ((options.key === "Delete" || options.key === "Backspace") && !mod) return { action: "remove" };
  if ((options.key === "p" || options.key === "P") && mod) return { action: "pin" };
  return { action: "ignore" };
}

/**
 * Empty query keeps store order. Non-empty uses fzf-style subsequence scoring
 * (pinned rows get a small boost) so Ctrl+R finds `k gp` → `kubectl get pods`.
 */
export function filterHistory(history: readonly HistoryEntry[], query: string): HistoryEntry[] {
  const needle = query.trim();
  if (!needle) return [...history];
  const ranked: Array<{ entry: HistoryEntry; score: number }> = [];
  for (const entry of history) {
    const match = scoreSubsequence(needle, entry.command);
    if (!match) continue;
    ranked.push({
      entry,
      score: match.score + (entry.pinned ? 40 : 0),
    });
  }
  return ranked
    .sort((a, b) => b.score - a.score || (b.entry.at ?? 0) - (a.entry.at ?? 0) || a.entry.command.localeCompare(b.entry.command))
    .map((row) => row.entry);
}

/** Clamp highlight into the filtered list. index -1 means "no highlight". */
export function clampHistoryIndex(length: number, index: number, delta: number): number {
  if (length <= 0) return -1;
  if (index < 0) return delta > 0 ? 0 : length - 1;
  const next = index + delta;
  if (next < 0) return 0;
  if (next >= length) return length - 1;
  return next;
}

export function mergeRemoteHistory(
  local: readonly HistoryEntry[],
  remote: readonly string[],
  limit = 100,
): HistoryEntry[] {
  let next = [...local];
  for (const item of remote) {
    const trimmed = normalizeHistoryCommand(item);
    if (!trimmed) continue;
    if (next.some((entry) => entry.command === trimmed)) continue;
    next = pushCommandHistory(next, trimmed, limit);
  }
  return next.slice(0, limit);
}
