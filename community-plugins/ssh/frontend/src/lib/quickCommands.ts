// 快速命令栏：用户自定义常用命令片段（对标 tiny-rdm 快速命令）。
// 可全局或绑定 connectionId；单作用域上限 200 条。纯函数，持久化读写留在调用方。

import { normalizeTerminalInputText } from "./terminalInput";

export interface QuickCommand {
  id: string;
  name: string;
  command: string;
  /** Absent / empty = global (visible on every connection). */
  connectionId?: string;
  /** Optional user-defined group label (empty = ungrouped). */
  group?: string;
}

/** Per-scope cap (global bucket and each connectionId bucket). */
export const QUICK_COMMANDS_LIMIT = 200;
export const QUICK_COMMAND_GROUP_MAX_LENGTH = 40;
export const QUICK_COMMAND_NAME_MAX_LENGTH = 60;
export const QUICK_COMMAND_TEXT_MAX_LENGTH = 500;
/** Soft ceiling when normalizing a full store (many connections × per-scope cap). */
const NORMALIZE_STORE_CEILING = 2_000;

function nonEmptyString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isValidId(value: string): boolean {
  return value.length > 0 && value.length <= 80;
}

function normalizeConnectionId(value: unknown): string | undefined {
  const id = nonEmptyString(value);
  if (!id || id.length > 80) return undefined;
  return id;
}

/** 解析读回的快速命令：非法项丢弃、字段截断、按 id 去重。 */
export function normalizeQuickCommands(raw: unknown, limit = NORMALIZE_STORE_CEILING): QuickCommand[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: QuickCommand[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const id = nonEmptyString(record.id);
    const command = nonEmptyString(record.command).slice(0, QUICK_COMMAND_TEXT_MAX_LENGTH);
    if (!isValidId(id) || !command || seen.has(id)) continue;
    seen.add(id);
    const name = (nonEmptyString(record.name) || command).slice(0, QUICK_COMMAND_NAME_MAX_LENGTH);
    const connectionId = normalizeConnectionId(record.connectionId);
    const group = nonEmptyString(record.group).slice(0, QUICK_COMMAND_GROUP_MAX_LENGTH) || undefined;
    const entry: QuickCommand = {
      id,
      name,
      command,
      ...(connectionId ? { connectionId } : {}),
      ...(group ? { group } : {}),
    };
    out.push(entry);
    if (out.length >= limit) break;
  }
  return out;
}

/** Global entries plus those bound to `connectionId` (connection-scoped first). */
export function visibleQuickCommands(
  list: readonly QuickCommand[],
  connectionId: string,
): QuickCommand[] {
  const current = connectionId.trim();
  const bound: QuickCommand[] = [];
  const global: QuickCommand[] = [];
  for (const item of list) {
    const scope = item.connectionId?.trim() ?? "";
    if (!scope) {
      global.push(item);
      continue;
    }
    if (current && scope === current) bound.push(item);
  }
  return [...bound, ...global];
}

/** Count entries in one scope (`null` / empty = global). */
export function countQuickCommandsInScope(
  list: readonly QuickCommand[],
  connectionId: string | null | undefined,
): number {
  const scope = (connectionId ?? "").trim();
  return list.filter((item) => (item.connectionId?.trim() ?? "") === scope).length;
}

/** Whether a new entry can be added in the given scope. */
export function canAddQuickCommandInScope(
  list: readonly QuickCommand[],
  connectionId: string | null | undefined,
  limit = QUICK_COMMANDS_LIMIT,
): boolean {
  return countQuickCommandsInScope(list, connectionId) < limit;
}

/** 新增或按 id 更新；已存在则原位更新，新条目追加到末尾。按目标作用域封顶。 */
export function upsertQuickCommand(list: QuickCommand[], item: QuickCommand, limit = QUICK_COMMANDS_LIMIT): QuickCommand[] {
  const command = item.command.trim();
  if (!command) return [...list];
  const connectionId = normalizeConnectionId(item.connectionId);
  const group = (item.group?.trim() || "").slice(0, QUICK_COMMAND_GROUP_MAX_LENGTH) || undefined;
  const entry: QuickCommand = {
    id: item.id,
    name: (item.name.trim() || command).slice(0, QUICK_COMMAND_NAME_MAX_LENGTH),
    command: command.slice(0, QUICK_COMMAND_TEXT_MAX_LENGTH),
    ...(connectionId ? { connectionId } : {}),
    ...(group ? { group } : {}),
  };
  const index = list.findIndex((existing) => existing.id === entry.id);
  if (index >= 0) {
    const next = [...list];
    next[index] = entry;
    return next;
  }
  if (countQuickCommandsInScope(list, connectionId) >= limit) return [...list];
  return [...list, entry];
}

/** 按 id 移除；id 不存在时返回等价副本。 */
export function removeQuickCommand(list: QuickCommand[], id: string): QuickCommand[] {
  return list.filter((item) => item.id !== id);
}

/** 名称/命令/分组的大小写不敏感子串过滤；空查询返回全量。 */
export function filterQuickCommands(
  list: readonly QuickCommand[],
  query: string,
): QuickCommand[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...list];
  return list.filter(
    (item) =>
      item.name.toLowerCase().includes(needle) ||
      item.command.toLowerCase().includes(needle) ||
      (item.group ?? "").toLowerCase().includes(needle),
  );
}

/** Ungrouped virtual bucket id (empty group label). */
export const QUICK_COMMANDS_UNGROUPED_ID = "";

export interface QuickCommandGroupView {
  /** Empty string = ungrouped. */
  id: string;
  name: string;
  commands: QuickCommand[];
}

/**
 * Derive group sections from command labels: first-seen order, ungrouped first.
 * Callers localize the empty-name bucket.
 */
export function groupQuickCommands(list: readonly QuickCommand[]): QuickCommandGroupView[] {
  const groups = new Map<string, QuickCommandGroupView>();
  for (const item of list) {
    const id = (item.group ?? "").trim() || QUICK_COMMANDS_UNGROUPED_ID;
    let group = groups.get(id);
    if (!group) {
      group = { id, name: id, commands: [] };
      groups.set(id, group);
    }
    group.commands.push(item);
  }
  const views = [...groups.values()];
  views.sort((a, b) =>
    a.id === QUICK_COMMANDS_UNGROUPED_ID ? -1 : b.id === QUICK_COMMANDS_UNGROUPED_ID ? 1 : 0,
  );
  return views;
}

/** Count named groups (ungrouped excluded). */
export function quickCommandGroupCount(list: readonly QuickCommand[]): number {
  return new Set(
    list
      .map((item) => (item.group ?? "").trim())
      .filter((id) => id !== QUICK_COMMANDS_UNGROUPED_ID),
  ).size;
}

export type QuickCommandScopeGroup = {
  connectionId: string;
  commands: QuickCommand[];
};

/** Bound to a connection other than the current one (includes orphans). */
export function otherScopedQuickCommands(
  list: readonly QuickCommand[],
  connectionId: string,
): QuickCommand[] {
  const current = connectionId.trim();
  return list.filter((item) => {
    const scope = item.connectionId?.trim() ?? "";
    return !!scope && scope !== current;
  });
}

/** Group other-scoped commands by connectionId (stable insertion order of scopes). */
export function groupQuickCommandsByConnection(
  list: readonly QuickCommand[],
): QuickCommandScopeGroup[] {
  const groups: QuickCommandScopeGroup[] = [];
  const indexById = new Map<string, number>();
  for (const item of list) {
    const scope = item.connectionId?.trim() ?? "";
    if (!scope) continue;
    const existing = indexById.get(scope);
    if (existing === undefined) {
      indexById.set(scope, groups.length);
      groups.push({ connectionId: scope, commands: [item] });
    } else {
      groups[existing].commands.push(item);
    }
  }
  return groups;
}

/** Short label for a connection id in the “other connections” manager. */
export function shortenConnectionId(connectionId: string, max = 12): string {
  const trimmed = connectionId.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, Math.max(4, max - 1))}…`;
}

/**
 * 写入终端的命令文本：保留多行结构，并把换行统一成 PTY 的 Enter
 * （Run/Paste 共用）。保留换行对反斜杠续行尤其重要；折叠为空格会把
 * `command \\` 变成带转义空格的错误命令。
 */
export function quickCommandText(command: string): string {
  return normalizeTerminalInputText(command).trim();
}
