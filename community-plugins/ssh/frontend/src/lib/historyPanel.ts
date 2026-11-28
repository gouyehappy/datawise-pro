import {
  HISTORY_HOST_MAX_LENGTH,
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

/** Motty: Ctrl/Cmd+Shift+H opens the history overlay. */
export function isHistoryOverlayShortcut(options: {
  type?: string;
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): boolean {
  if (options.type && options.type !== "keydown") return false;
  if (options.altKey || !options.shiftKey) return false;
  if (!(options.ctrlKey || options.metaKey)) return false;
  return options.key === "h" || options.key === "H";
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
 * A command that last exited 0 is a safer default than one that last failed.
 * Deliberately tiny: the fzf subsequence score and the pinned boost (+40)
 * still dominate, so this only breaks near-ties instead of reordering results.
 */
export const HISTORY_SUCCESS_BOOST = 6;

export function historySuccessBoost(entry: HistoryEntry): number {
  return entry.exitCode === 0 ? HISTORY_SUCCESS_BOOST : 0;
}

/**
 * Optional overlay filters driven by the OSC 633 result metadata (beta.42).
 * Both fields are additive and independent; an empty/unknown value means "no
 * filter on this axis". Kept as a plain object so it can live in a Vue ref and
 * be passed straight into the pure helpers below.
 */
export interface HistoryFilter {
  /** Only keep commands whose last known execution failed. */
  failedOnly?: boolean;
  /** Exact host label. `null` / `undefined` / `""` = all hosts. */
  host?: string | null;
}

/** Select option value for "all hosts" — an empty string cannot collide with a real label. */
export const HISTORY_ALL_HOSTS = "";

/**
 * A command counts as failed only when we actually know it failed. Legacy
 * entries (`failed: true`) still qualify; unknown / exit 0 never do. Filtering
 * must never silently invent failures from missing metadata.
 */
export function historyEntryFailed(entry: HistoryEntry): boolean {
  const code = entry.exitCode;
  // exitCode is the newer, authoritative field (beta.42). When present it wins
  // over the legacy `failed` boolean, so a later successful run is not stuck
  // being reported as a failure forever.
  if (typeof code === "number" && Number.isFinite(code)) return code !== 0;
  return entry.failed === true;
}

function cleanHost(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, HISTORY_HOST_MAX_LENGTH);
}

/** Distinct, display-safe host labels for the overlay dropdown; stable order. */
export function historyHosts(history: readonly HistoryEntry[]): string[] {
  const seen = new Set<string>();
  for (const entry of history) {
    const host = cleanHost(entry.host);
    if (host) seen.add(host);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

/** Apply host / failure filters before any scoring. Never mutates the input. */
export function applyHistoryFilter(
  history: readonly HistoryEntry[],
  filter?: HistoryFilter | null,
): HistoryEntry[] {
  const failedOnly = filter?.failedOnly === true;
  const host = cleanHost(filter?.host);
  if (!failedOnly && !host) return [...history];
  return history.filter((entry) => {
    if (failedOnly && !historyEntryFailed(entry)) return false;
    if (host && cleanHost(entry.host) !== host) return false;
    return true;
  });
}

/**
 * Empty query keeps store order. Non-empty uses fzf-style subsequence scoring
 * (pinned rows get a small boost) so Ctrl+Shift+H finds `k gp` → `kubectl get pods`.
 * An optional filter narrows the candidate set first; the two-argument form
 * stays byte-for-byte compatible with every existing caller.
 */
export function filterHistory(
  history: readonly HistoryEntry[],
  query: string,
  filter?: HistoryFilter | null,
): HistoryEntry[] {
  const scoped = applyHistoryFilter(history, filter);
  const needle = query.trim();
  if (!needle) return scoped;
  const ranked: Array<{ entry: HistoryEntry; score: number }> = [];
  for (const entry of scoped) {
    const match = scoreSubsequence(needle, entry.command);
    if (!match) continue;
    ranked.push({
      entry,
      score: match.score + (entry.pinned ? 40 : 0) + historySuccessBoost(entry),
    });
  }
  return ranked
    .sort((a, b) => b.score - a.score || (b.entry.at ?? 0) - (a.entry.at ?? 0) || a.entry.command.localeCompare(b.entry.command))
    .map((row) => row.entry);
}

/**
 * Browse-mode sorting for the history overlay (beta.44). Only applied when the
 * search box is empty — a live fzf query must stay ranked by relevance.
 */
export type HistorySortMode = "recent" | "durationDesc" | "durationAsc" | "host";

export const HISTORY_SORT_DEFAULT: HistorySortMode = "recent";
export const HISTORY_SORT_MODES: readonly HistorySortMode[] = [
  "recent", "durationDesc", "durationAsc", "host",
];
/** Group label for entries with no recorded host. */
export const HISTORY_UNKNOWN_HOST = "";

/** Defensive coercion for a persisted / host-supplied sort value. */
export function coerceHistorySortMode(raw: unknown): HistorySortMode {
  return typeof raw === "string" && (HISTORY_SORT_MODES as readonly string[]).includes(raw)
    ? (raw as HistorySortMode)
    : HISTORY_SORT_DEFAULT;
}

function knownDuration(entry: HistoryEntry): number | null {
  const ms = entry.durationMs;
  return typeof ms === "number" && Number.isFinite(ms) && ms >= 0 ? ms : null;
}

/**
 * Stable display sort. Pinned rows always stay on top; entries with unknown
 * duration never float above measured ones in either direction. Never mutates
 * the input (the overlay keyboard index still refers to the flat result).
 */
export function sortHistoryView(
  entries: readonly HistoryEntry[],
  mode: HistorySortMode = HISTORY_SORT_DEFAULT,
): HistoryEntry[] {
  if (mode === "recent") return [...entries];
  const rows = entries.map((entry, index) => ({
    entry,
    index,
    duration: knownDuration(entry),
    host: cleanHost(entry.host),
  }));
  rows.sort((a, b) => {
    const pinA = a.entry.pinned ? 1 : 0;
    const pinB = b.entry.pinned ? 1 : 0;
    if (pinA !== pinB) return pinB - pinA;
    if (mode === "host") {
      if (a.host !== b.host) {
        if (!a.host) return 1; // unknown host sinks to its own last group
        if (!b.host) return -1;
        const cmp = a.host.localeCompare(b.host);
        if (cmp) return cmp;
      }
      return a.index - b.index;
    }
    if (a.duration === null && b.duration === null) return a.index - b.index;
    if (a.duration === null) return 1;
    if (b.duration === null) return -1;
    if (a.duration !== b.duration) {
      return mode === "durationDesc" ? b.duration - a.duration : a.duration - b.duration;
    }
    return a.index - b.index;
  });
  return rows.map((row) => row.entry);
}

/**
 * Group header for a row in `host` mode. `null` = continue the current group;
 * `HISTORY_UNKNOWN_HOST` (empty string) = the "unknown host" group, which the
 * caller renders through an i18n label. Never produces headers in other modes.
 */
export function historyGroupLabel(
  entries: readonly HistoryEntry[],
  index: number,
  mode: HistorySortMode = HISTORY_SORT_DEFAULT,
): string | null {
  if (mode !== "host" || index < 0 || index >= entries.length) return null;
  const current = cleanHost(entries[index].host);
  if (index > 0 && current === cleanHost(entries[index - 1].host)) return null;
  return current || HISTORY_UNKNOWN_HOST;
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
