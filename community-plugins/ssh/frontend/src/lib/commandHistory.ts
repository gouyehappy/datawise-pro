// 命令历史：结构化条目（命令 / 置顶 / 时间 / 上次执行结果），兼容旧版纯字符串数组。
// 内存环形 + localStorage 只持久化非敏感命令；纯函数，读写留在调用方。

import { formatCommandDuration } from "./terminalCommandMarkers";

export const COMMAND_HISTORY_LIMIT = 100;
export const PERSISTED_COMMAND_MAX_LENGTH = 200;
/** Host label is display-only metadata; keep persisted records bounded. */
export const HISTORY_HOST_MAX_LENGTH = 80;
const SECRET_LIKE_PATTERN = /(?:password|passwd|passphrase|token|secret|api[-_]?key|access[-_]?key)\s*[:=]/i;

export type HistoryEntry = {
  command: string;
  pinned?: boolean;
  at?: number;
  /** Non-zero exit from OSC 633 D, when shell-integration is active. */
  failed?: boolean;
  /** Connection that recorded the command; used by per-connection history scope. */
  connectionId?: string;
  /** Last shell-integration exit code; undefined for legacy / unknown entries. */
  exitCode?: number;
  /** Last command duration in milliseconds; undefined when unknown. */
  durationMs?: number;
  /** Display label of the connection where the command last ran. */
  host?: string;
};

/** Result stamp emitted by shell integration (OSC 633 D). */
export interface HistoryResult {
  exitCode: number;
  durationMs?: number | null;
  host?: string | null;
}

function finiteInteger(raw: unknown): number | undefined {
  // Number(null) === 0: a missing value must stay "unknown", not become a
  // valid-looking exit code of 0.
  if (raw === null || raw === undefined || raw === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.trunc(value) : undefined;
}

function finiteNonNegative(raw: unknown): number | undefined {
  if (raw === null || raw === undefined || raw === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined;
}

/** Strip control characters and bound the length before it ever reaches storage/UI. */
function cleanHistoryHost(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const value = raw.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, HISTORY_HOST_MAX_LENGTH);
  return value || undefined;
}

export type CommandInputAction = "run" | "history-up" | "history-down" | "none";

/**
 * Resolves keyboard behavior for the multiline command editor. Ctrl/Cmd+Enter
 * submits; plain Enter remains available for shell scripts and backslash
 * continuations. History navigation only takes over at the corresponding edge
 * of the editor, so arrows keep their normal multiline editing behavior.
 */
export function commandInputAction(options: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  selectionStart: number;
  selectionEnd: number;
  valueLength: number;
}): CommandInputAction {
  if (options.key === "Enter" && (options.ctrlKey || options.metaKey) && !options.shiftKey) {
    return "run";
  }
  if (
    options.selectionStart !== options.selectionEnd ||
    options.ctrlKey ||
    options.metaKey ||
    options.shiftKey
  ) {
    return "none";
  }
  if (options.key === "ArrowUp" && options.selectionStart === 0) return "history-up";
  if (options.key === "ArrowDown" && options.selectionEnd === options.valueLength) return "history-down";
  return "none";
}

/**
 * Bastion / non-interactive exec noise that must never enter history
 * (e.g. JumpServer replies `No PTY requested.` when HISTFILE cannot be tailed).
 */
export function isNoiseHistoryLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^No PTY requested\.?$/i.test(trimmed)) return true;
  if (/^#\d{5,}$/.test(trimmed)) return true;
  return false;
}

/** Trim + reject empty/noise; null means "do not record". */
export function normalizeHistoryCommand(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed || isNoiseHistoryLine(trimmed)) return null;
  return trimmed;
}

/**
 * Choose what to record on Enter. Tab completion is applied by the remote
 * shell and only appears on the visible prompt line, so prefer that when it is
 * at least as complete as the local keystroke buffer.
 */
export function resolvePtySubmitCommand(pendingLine: string, visibleInput: string): string | null {
  const pending = normalizeHistoryCommand(pendingLine);
  const visible = normalizeHistoryCommand(visibleInput);
  if (!visible) return pending;
  if (!pending) return visible;
  if (visible === pending) return visible;
  if (visible.startsWith(pending) || visible.length >= pending.length) return visible;
  return pending;
}

/**
 * Best-effort PTY line buffer: printable keys append, Backspace deletes,
 * Enter/Ctrl+C clear. Escape chunks are ignored (arrow keys / CSI).
 */
export function applyPtyInputLine(
  line: string,
  data: string,
  resolveOnSubmit?: (pending: string) => string | null,
): { line: string; submitted: string[] } {
  if (!data || data.includes("\u001b")) return { line, submitted: [] };
  let next = line;
  const submitted: string[] = [];
  for (const character of data) {
    if (character === "\r" || character === "\n") {
      const raw = resolveOnSubmit ? resolveOnSubmit(next) : next;
      const command = normalizeHistoryCommand(raw ?? "");
      if (command) submitted.push(command);
      next = "";
    } else if (character === "\u0003") {
      next = "";
    } else if (character === "\u007f") {
      next = next.slice(0, -1);
    } else if (character >= " ") {
      next += character;
    }
  }
  return { line: next, submitted };
}

export function historyCommands(entries: readonly HistoryEntry[]): string[] {
  return entries.map((entry) => entry.command);
}

export function sortHistoryEntries(entries: readonly HistoryEntry[]): HistoryEntry[] {
  return [...entries].sort((a, b) => {
    const pinA = a.pinned ? 1 : 0;
    const pinB = b.pinned ? 1 : 0;
    if (pinA !== pinB) return pinB - pinA;
    return (b.at ?? 0) - (a.at ?? 0);
  });
}

/** 记录一条命令：去重后置顶（保留 pin），截断到上限。 */
export function pushCommandHistory(
  history: readonly HistoryEntry[],
  command: string,
  limit = COMMAND_HISTORY_LIMIT,
  extra: { connectionId?: string } = {},
): HistoryEntry[] {
  const trimmed = normalizeHistoryCommand(command);
  if (!trimmed) return [...history];
  const prev = history.find((entry) => entry.command === trimmed);
  const entry: HistoryEntry = {
    command: trimmed,
    pinned: prev?.pinned,
    at: Date.now(),
    failed: prev?.failed,
    connectionId: extra.connectionId || prev?.connectionId,
  };
  // Re-running a command keeps its last known result until the next OSC 633 D
  // frame replaces it (same semantics as the pre-existing `failed` flag).
  if (prev?.exitCode !== undefined) entry.exitCode = prev.exitCode;
  if (prev?.durationMs !== undefined) entry.durationMs = prev.durationMs;
  if (prev?.host !== undefined) entry.host = prev.host;
  return sortHistoryEntries([entry, ...history.filter((item) => item.command !== trimmed)]).slice(0, limit);
}

/**
 * Stamp the latest matching command with a full shell-integration result.
 * Only fields actually supplied are overwritten, so a D frame without a
 * duration never erases a previously known one.
 */
export function markHistoryResult(
  history: readonly HistoryEntry[],
  command: string,
  result: HistoryResult,
  connectionId?: string,
): HistoryEntry[] {
  const trimmed = normalizeHistoryCommand(command);
  const exitCode = finiteInteger(result.exitCode);
  if (!trimmed || exitCode === undefined) return [...history];
  const durationMs = finiteNonNegative(result.durationMs);
  const host = cleanHistoryHost(result.host);
  let updated = false;
  const next = history.map((entry) => {
    if (updated || entry.command !== trimmed) return entry;
    if (connectionId && entry.connectionId && entry.connectionId !== connectionId) return entry;
    updated = true;
    const stamped: HistoryEntry = { ...entry, exitCode, failed: exitCode !== 0 };
    if (durationMs !== undefined) stamped.durationMs = durationMs;
    if (host !== undefined) stamped.host = host;
    return stamped;
  });
  return updated ? next : history.slice();
}

/** Backwards-compatible helper used by callers that only know the exit code. */
export function markHistoryExit(
  history: readonly HistoryEntry[],
  command: string,
  exitCode: number,
  connectionId?: string,
): HistoryEntry[] {
  return markHistoryResult(history, command, { exitCode }, connectionId);
}

export function historyForScope(
  history: readonly HistoryEntry[],
  scope: "global" | "connection",
  connectionId: string,
): HistoryEntry[] {
  if (scope !== "connection" || !connectionId) return [...history];
  return history.filter((entry) => !entry.connectionId || entry.connectionId === connectionId);
}

export function togglePinHistory(history: readonly HistoryEntry[], command: string): HistoryEntry[] {
  const trimmed = normalizeHistoryCommand(command);
  if (!trimmed) return [...history];
  return sortHistoryEntries(
    history.map((entry) =>
      entry.command === trimmed ? { ...entry, pinned: !entry.pinned } : entry,
    ),
  );
}

export function removeHistoryEntry(history: readonly HistoryEntry[], command: string): HistoryEntry[] {
  const trimmed = normalizeHistoryCommand(command);
  if (!trimmed) return [...history];
  return history.filter((entry) => entry.command !== trimmed);
}

/** 该命令是否适合写入 localStorage（非空、不超长、无内嵌凭据痕迹）。 */
export function isPersistableCommand(command: string, maxLength = PERSISTED_COMMAND_MAX_LENGTH): boolean {
  const trimmed = command.trim();
  if (!trimmed || isNoiseHistoryLine(trimmed) || trimmed.length > maxLength || /\n|\r/.test(trimmed)) return false;
  return !SECRET_LIKE_PATTERN.test(trimmed);
}

export function isPersistableEntry(entry: HistoryEntry, maxLength = PERSISTED_COMMAND_MAX_LENGTH): boolean {
  return isPersistableCommand(entry.command, maxLength);
}

/** ↑↓ 浏览历史：index 为 -1 表示未处于浏览态。 */
export function browseCommandHistory(
  history: readonly HistoryEntry[],
  index: number,
  direction: "up" | "down",
  fallbackDraft = "",
): { index: number; draft: string } {
  if (!history.length) return { index: -1, draft: fallbackDraft };
  if (direction === "up") {
    const next = Math.min(index + 1, history.length - 1);
    return { index: next, draft: history[next].command };
  }
  if (index <= 0) return { index: -1, draft: fallbackDraft };
  return { index: index - 1, draft: history[index - 1].command };
}

function coerceEntry(raw: unknown): HistoryEntry | null {
  if (typeof raw === "string") {
    const command = normalizeHistoryCommand(raw);
    if (!command || !isPersistableCommand(command)) return null;
    return { command };
  }
  if (!raw || typeof raw !== "object") return null;
  const record = raw as {
    command?: unknown;
    pinned?: unknown;
    at?: unknown;
    failed?: unknown;
    connectionId?: unknown;
    exitCode?: unknown;
    durationMs?: unknown;
    host?: unknown;
  };
  const command = typeof record.command === "string" ? normalizeHistoryCommand(record.command) : null;
  if (!command || !isPersistableCommand(command)) return null;
  const at = typeof record.at === "number" && Number.isFinite(record.at) ? record.at : undefined;
  const connectionId = typeof record.connectionId === "string" && record.connectionId.trim() ? record.connectionId.trim() : undefined;
  const entry: HistoryEntry = {
    command,
    pinned: record.pinned === true,
    at,
    failed: record.failed === true,
    connectionId,
  };
  // Metadata is display-only, but still validate hard: a poisoned localStorage
  // value must never produce NaN / unbounded strings in the history overlay.
  const exitCode = finiteInteger(record.exitCode);
  const durationMs = finiteNonNegative(record.durationMs);
  const host = cleanHistoryHost(record.host);
  if (exitCode !== undefined) entry.exitCode = exitCode;
  if (durationMs !== undefined) entry.durationMs = durationMs;
  if (host !== undefined) entry.host = host;
  return entry;
}

/** 解析 localStorage：兼容 string[] 与 HistoryEntry[]。 */
export function sanitizeCommandHistory(raw: unknown, limit = COMMAND_HISTORY_LIMIT): HistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: HistoryEntry[] = [];
  for (const item of raw) {
    const entry = coerceEntry(item);
    if (!entry || seen.has(entry.command)) continue;
    seen.add(entry.command);
    out.push(entry);
    if (out.length >= limit) break;
  }
  return sortHistoryEntries(out);
}

export type HistoryAgeLabels = {
  justNow: string;
  minutes: string;
  hours: string;
  days: string;
};

/** Compact relative age for history rows. */
export function formatHistoryAge(at: number | undefined, now: number, labels: HistoryAgeLabels): string {
  if (!at || !Number.isFinite(at) || at <= 0) return "";
  const delta = Math.max(0, now - at);
  if (delta < 60_000) return labels.justNow;
  if (delta < 3_600_000) return labels.minutes.replace("{n}", String(Math.floor(delta / 60_000)));
  if (delta < 86_400_000) return labels.hours.replace("{n}", String(Math.floor(delta / 3_600_000)));
  return labels.days.replace("{n}", String(Math.floor(delta / 86_400_000)));
}

/** Truncate mid for list rows; full text stays on title/hover. */
export function truncateHistoryCommand(command: string, max = 72): string {
  const trimmed = command.trim();
  if (trimmed.length <= max) return trimmed;
  const head = Math.max(24, Math.floor(max * 0.65));
  const tail = Math.max(12, max - head - 1);
  return `${trimmed.slice(0, head)}…${trimmed.slice(-tail)}`;
}

export interface HistoryResultLabels {
  /** e.g. `exit {code}` / `退出码 {code}`; used for non-zero exits. */
  exit: string;
  /** e.g. `ok` / `成功`; used for a zero exit. */
  ok: string;
  /** Separator for the combined tooltip; defaults to ` · `. */
  separator?: string;
}

export interface HistoryResultBadge {
  tone: "ok" | "fail" | "neutral";
  exitText: string;
  durationText: string;
  hostText: string;
  /** Combined human-readable line for the row tooltip. */
  text: string;
}

/**
 * Build the display model for a history row's result metadata. Pure so the
 * overlay never has to reason about undefined / NaN / oversized host labels.
 * Returns null when the entry carries no result metadata at all.
 */
export function historyResultBadge(entry: HistoryEntry, labels: HistoryResultLabels): HistoryResultBadge | null {
  const exitCode = finiteInteger(entry.exitCode);
  const durationMs = finiteNonNegative(entry.durationMs);
  const host = cleanHistoryHost(entry.host);
  if (exitCode === undefined && durationMs === undefined && host === undefined) return null;
  const tone: HistoryResultBadge["tone"] =
    exitCode === undefined ? "neutral" : exitCode === 0 ? "ok" : "fail";
  const exitText =
    exitCode === undefined ? "" : exitCode === 0 ? labels.ok : labels.exit.replace("{code}", String(exitCode));
  const durationText = durationMs === undefined ? "" : formatCommandDuration(durationMs);
  const hostText = host ?? "";
  const separator = labels.separator ?? " · ";
  return {
    tone,
    exitText,
    durationText,
    hostText,
    text: [exitText, durationText, hostText].filter(Boolean).join(separator),
  };
}
