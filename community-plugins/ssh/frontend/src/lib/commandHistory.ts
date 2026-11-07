// 命令历史：结构化条目（命令 / 置顶 / 时间），兼容旧版纯字符串数组。
// 内存环形 + localStorage 只持久化非敏感命令；纯函数，读写留在调用方。

export const COMMAND_HISTORY_LIMIT = 100;
export const PERSISTED_COMMAND_MAX_LENGTH = 200;
const SECRET_LIKE_PATTERN = /(?:password|passwd|passphrase|token|secret|api[-_]?key|access[-_]?key)\s*[:=]/i;

export type HistoryEntry = {
  command: string;
  pinned?: boolean;
  at?: number;
  /** Non-zero exit from OSC 633 D, when shell-integration is active. */
  failed?: boolean;
  /** Connection that recorded the command; used by per-connection history scope. */
  connectionId?: string;
};

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
  return sortHistoryEntries([entry, ...history.filter((item) => item.command !== trimmed)]).slice(0, limit);
}

/** Stamp the latest matching command with a failed/ok exit from shell-integration. */
export function markHistoryExit(
  history: readonly HistoryEntry[],
  command: string,
  exitCode: number,
  connectionId?: string,
): HistoryEntry[] {
  const trimmed = normalizeHistoryCommand(command);
  if (!trimmed) return [...history];
  const failed = exitCode !== 0;
  let updated = false;
  const next = history.map((entry) => {
    if (updated) return entry;
    if (entry.command !== trimmed) return entry;
    if (connectionId && entry.connectionId && entry.connectionId !== connectionId) return entry;
    updated = true;
    return { ...entry, failed };
  });
  return updated ? next : history.slice();
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
  const record = raw as { command?: unknown; pinned?: unknown; at?: unknown; failed?: unknown; connectionId?: unknown };
  const command = typeof record.command === "string" ? normalizeHistoryCommand(record.command) : null;
  if (!command || !isPersistableCommand(command)) return null;
  const at = typeof record.at === "number" && Number.isFinite(record.at) ? record.at : undefined;
  const connectionId = typeof record.connectionId === "string" && record.connectionId.trim() ? record.connectionId.trim() : undefined;
  return {
    command,
    pinned: record.pinned === true,
    at,
    failed: record.failed === true,
    connectionId,
  };
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
