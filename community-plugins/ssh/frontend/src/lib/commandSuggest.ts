/**
 * Inline PATH/command completion while typing in the PTY.
 * Keyboard + data sources mirror datawise-plugin-ssh (without Fig engine):
 * - History + quick-command fuzzy search (fzf subsequence) on the full typed line.
 * - PATH catalog / remote file prefix matches for the current token.
 * - Enter always runs the typed line; Tab fills when prefix or ↑↓-armed;
 *   → / Ctrl+F / Ctrl+E accept fish-style ghost remainder.
 */

import { isBastionMenuContext } from "./bastionContext";

export const COMMAND_SUGGEST_LIMIT = 12;
export const COMMAND_SUGGEST_MIN_PREFIX = 1;
export const COMMAND_SUGGEST_MAX_PREFIX = 64;

/** Used only until the connection's remote catalog arrives. */
export const COMMON_COMMANDS = [
  "alias", "awk", "bash", "cat", "cd", "chmod", "chown", "clear", "cp", "curl",
  "date", "df", "diff", "docker", "du", "echo", "env", "exit", "export", "find",
  "free", "git", "grep", "head", "history", "hostname", "htop", "id", "ip",
  "journalctl", "kill", "kubectl", "less", "ln", "ls", "lsblk", "lsof",
  "make", "man", "mkdir", "mv", "nano", "ping", "ps", "pwd", "python", "python3",
  "rm", "rmdir", "rsync", "scp", "sed", "sh", "ssh", "sudo", "systemctl", "tail",
  "tar", "top", "touch", "vim", "wget", "which", "whoami", "zsh",
  "apt", "apt-get", "yum", "dnf", "systemctl", "journalctl", "crontab",
  "helm", "terraform", "ansible", "npm", "npx", "yarn", "pnpm", "pip", "pip3",
  "cargo", "go", "java", "node", "ruby", "perl", "php", "mysql", "psql", "redis-cli",
  "nginx", "systemctl", "ufw", "iptables", "tcpdump", "ss", "netstat", "dig", "nslookup",
  "mount", "umount", "df", "du", "free", "uptime", "uname", "hostnamectl", "timedatectl",
];

const FREQUENT_COMMANDS = new Set([
  "ls", "cd", "git", "cat", "vim", "vi", "kubectl", "docker", "ssh", "sudo",
  "systemctl", "grep", "tail", "mkdir", "rm", "cp", "mv", "pwd", "ps", "top",
]);

export type SuggestSource = "history" | "quick" | "command" | "path";

export interface SuggestItem {
  command: string;
  source: SuggestSource;
  /** Match indices for highlight (empty for plain prefix catalog/path). */
  indices: number[];
  score: number;
}

export type CommandSuggestKey =
  | { action: "ignore" }
  | { action: "move"; delta: number }
  | { action: "accept" }
  | { action: "dismiss" }
  /** Close the overlay and let the key reach the PTY (shell history). */
  | { action: "passthrough" };

export type SuggestQuery = { kind: "command" | "path"; prefix: string };

export interface SuggestQuickSource {
  name: string;
  command: string;
}

export function isCommandName(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9._+-]*$/.test(value);
}

export function isSafePathPrefix(prefix: string): boolean {
  return prefix.length > 0 && prefix.length <= 512 && /^[A-Za-z0-9._/~+-]+$/.test(prefix);
}

export function parseCommandNames(output: string, limit = 4000): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of output.split(/\r?\n/)) {
    const name = raw.trim().replace(/^.*\//, "");
    if (!isCommandName(name) || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
    if (out.length >= limit) break;
  }
  return out;
}

/** Text after the last shell prompt marker (`#`, `$`, `>`, `%`). */
export function extractShellInput(textBeforeCursor: string): string {
  const match = textBeforeCursor.match(/[#>$%]\s?(.*)$/);
  return match ? match[1] : textBeforeCursor;
}

export function parseSuggestQuery(textBeforeCursor: string): SuggestQuery {
  const input = extractShellInput(textBeforeCursor);
  const trailingSpace = /\s$/.test(input);
  const parts = input.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { kind: "command", prefix: "" };
  if (parts.length === 1 && !trailingSpace) return { kind: "command", prefix: parts[0] };
  return { kind: "path", prefix: trailingSpace ? "" : parts[parts.length - 1] };
}

/** JumpServer menus, numeric option prompts, and similar TUIs must not steal keys. */
export function shouldSuppressSuggest(line: string): boolean {
  if (isBastionMenuContext(line)) return true;
  const query = parseSuggestQuery(line);
  return query.kind === "command" && /^\d+$/.test(query.prefix);
}

/** Prefer below the cursor (overlayPlacement); flip above near the bottom. */
export function overlayPlacement(cursorRow: number, rows: number): "above" | "below" {
  if (rows <= 0) return "below";
  const spaceBelow = rows - cursorRow - 1;
  const spaceAbove = cursorRow;
  if (spaceBelow >= 8) return "below";
  if (spaceAbove >= 8) return "above";
  return spaceAbove > spaceBelow ? "above" : "below";
}

export function extractCommandPrefix(textBeforeCursor: string): string {
  const query = parseSuggestQuery(textBeforeCursor);
  return query.kind === "command" ? query.prefix : "";
}

export function pathSegment(prefix: string): string {
  const slash = prefix.lastIndexOf("/");
  return slash >= 0 ? prefix.slice(slash + 1) : prefix;
}

export function commandSuggestionQueryAcceptable(
  query: string,
  minLength = COMMAND_SUGGEST_MIN_PREFIX,
  maxLength = COMMAND_SUGGEST_MAX_PREFIX,
): boolean {
  const length = query.length;
  return length >= minLength && length <= maxLength;
}

function isWordStart(command: string, index: number): boolean {
  if (index === 0) return true;
  return !/[a-z0-9]/i.test(command.charAt(index - 1));
}

/** fzf-style subsequence score (fzf-style commandSuggestions). */
export function scoreSubsequence(query: string, command: string): { score: number; indices: number[] } | null {
  const needle = query.toLowerCase();
  const haystack = command.toLowerCase();
  const indices: number[] = [];
  let score = 0;
  let cursor = 0;
  for (let i = 0; i < needle.length; i += 1) {
    const found = haystack.indexOf(needle.charAt(i), cursor);
    if (found === -1) return null;
    score += 1;
    if (indices.length) {
      const gap = found - indices[indices.length - 1] - 1;
      if (gap === 0) score += 6;
      else score -= Math.min(8, gap); // prefer tight matches; short queries over-match less
    }
    if (isWordStart(command, found)) score += 10;
    indices.push(found);
    cursor = found + 1;
  }
  if (haystack.startsWith(needle)) score += 40;
  if (haystack === needle) score += 20;
  // Short needles need a stronger hit to avoid `g`/`st` noise on large history.
  if (needle.length <= 2 && score < 20) return null;
  return { score, indices };
}

/**
 * Fuzzy-search history + quick commands for the full typed line .
 * History rows win ties; capped at `limit`.
 * Under Fig args phase, pass a lower `limit` / higher `minScore` to demote soft history.
 */
export function searchLineSuggestions(
  query: string,
  sources: { history: readonly string[]; quickCommands: readonly SuggestQuickSource[] },
  limit = COMMAND_SUGGEST_LIMIT,
  minScore = 0,
): SuggestItem[] {
  const trimmed = query.trimEnd();
  if (!commandSuggestionQueryAcceptable(trimmed)) return [];
  const rows: SuggestItem[] = [];
  const seen = new Set<string>();
  const historyCap = Math.min(sources.history.length, 400);
  const push = (command: string, source: SuggestSource, recency: number, bonus = 0) => {
    if (!command || seen.has(command)) return;
    const match = scoreSubsequence(trimmed, command);
    if (!match) return;
    const score = match.score + bonus + Math.max(0, 5 - recency);
    if (score < minScore) return;
    seen.add(command);
    rows.push({
      command,
      source,
      indices: match.indices,
      score,
    });
  };
  for (let index = 0; index < historyCap; index += 1) {
    push(sources.history[index], "history", index);
  }
  sources.quickCommands.forEach((item, index) => push(item.command, "quick", index, 4));
  return rows.sort((a, b) => b.score - a.score || a.command.localeCompare(b.command)).slice(0, Math.max(0, limit));
}

/** Empty-line surface: most recent unique history rows (no query). */
export function recentHistorySuggestions(
  history: readonly string[],
  limit = 8,
): SuggestItem[] {
  const seen = new Set<string>();
  const out: SuggestItem[] = [];
  for (const raw of history) {
    if (out.length >= limit) break;
    const command = raw.trim();
    if (!command || seen.has(command)) continue;
    seen.add(command);
    out.push({ command, source: "history", indices: [], score: 100 - out.length });
  }
  return out;
}

/**
 * Exact known Fig command with no longer history: offer `cmd ` so ghost/Tab
 * inserts a space and hands off to structured args completion.
 */
export function figArgsHandoffItem(typedCommand: string): SuggestItem {
  const cmd = typedCommand.trim();
  return {
    command: `${cmd} `,
    source: "command",
    indices: [...Array(cmd.length).keys()],
    score: 1,
  };
}

export function rankSuggest(items: string[], prefix: string, recents: string[] = []): string[] {
  const needle = prefix.toLowerCase();
  const recentRank = new Map<string, number>();
  recents.forEach((entry, index) => {
    const key = entry.trim().split(/\s+/)[0]?.toLowerCase();
    if (key && !recentRank.has(key)) recentRank.set(key, index);
  });
  return [...items].sort((a, b) => {
    const delta = score(a) - score(b);
    return delta !== 0 ? delta : a.localeCompare(b);
  });

  function score(item: string): number {
    const key = item.toLowerCase();
    if (key === needle) return 0;
    const recent = recentRank.get(key);
    if (recent != null) return 1 + recent;
    if (FREQUENT_COMMANDS.has(key)) return 100;
    return 200;
  }
}

export function filterCommandSuggest(
  commands: string[],
  prefix: string,
  recents: string[] = [],
  limit = COMMAND_SUGGEST_LIMIT,
): string[] {
  const needle = prefix.toLowerCase();
  if (needle.length < COMMAND_SUGGEST_MIN_PREFIX) return [];
  const seen = new Set<string>();
  const matched: string[] = [];
  for (const item of commands) {
    if (!isCommandName(item)) continue;
    const key = item.toLowerCase();
    if (seen.has(key) || !key.startsWith(needle)) continue;
    seen.add(key);
    matched.push(item);
  }
  return rankSuggest(matched, prefix, recents).slice(0, limit);
}

/** Catalog PATH names as SuggestItems (prefix only). */
export function catalogSuggestItems(
  commands: string[],
  prefix: string,
  recents: string[] = [],
  limit = COMMAND_SUGGEST_LIMIT,
): SuggestItem[] {
  return filterCommandSuggest(commands, prefix, recents, limit).map((command) => ({
    command,
    source: "command" as const,
    indices: [...Array(prefix.length).keys()],
    score: 0,
  }));
}

export function normalizePathCandidate(prefix: string, candidate: string): string {
  const trimmed = candidate.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith(prefix)) return trimmed;
  if (!trimmed.includes("/")) {
    const slash = prefix.lastIndexOf("/");
    if (slash >= 0) return `${prefix.slice(0, slash + 1)}${trimmed}`;
  }
  return trimmed;
}

export function filterPathSuggest(items: string[], prefix: string, limit = COMMAND_SUGGEST_LIMIT): string[] {
  if (!prefix || pathSegment(prefix).length < 1) return [];
  const needle = prefix.toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (!key || seen.has(key) || !key.startsWith(needle)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

export function pathSuggestItems(items: string[], prefix: string, limit = COMMAND_SUGGEST_LIMIT): SuggestItem[] {
  return filterPathSuggest(items, prefix, limit).map((command) => ({
    command,
    source: "path" as const,
    indices: [...Array(Math.min(prefix.length, command.length)).keys()],
    score: 0,
  }));
}

/**
 * Merge history/quick fuzzy hits with catalog PATH names.
 * History/quick first (already scored); catalog fills remaining slots without dupes.
 */
export function mergeSuggestItems(lineItems: SuggestItem[], catalogItems: SuggestItem[], limit = COMMAND_SUGGEST_LIMIT): SuggestItem[] {
  const seen = new Set<string>();
  const out: SuggestItem[] = [];
  for (const item of [...lineItems, ...catalogItems]) {
    if (seen.has(item.command)) continue;
    seen.add(item.command);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Drop suggestions that only repeat the typed line (e.g. typed `curl` → hide bare `curl`).
 * Keep longer history/quick rows that still add args/flags (`curl -v https://…`).
 */
export function filterRedundantExactSuggest(typedLine: string, items: readonly SuggestItem[]): SuggestItem[] {
  const needle = typedLine.trimEnd().toLowerCase();
  if (!needle) return [...items];
  return items.filter((item) => item.command.trimEnd().toLowerCase() !== needle);
}

export function completionSuffix(typed: string, item: string): string {
  if (item.toLowerCase().startsWith(typed.toLowerCase())) return item.slice(typed.length);
  if (typed.endsWith("/") && item.startsWith(typed)) return item.slice(typed.length);
  return "";
}

export function isGhostPrefixMatch(line: string, command: string): boolean {
  if (command.length <= line.length) return false;
  return command.toLowerCase().startsWith(line.toLowerCase());
}

/** Ghost remainder for the active item (fish: only strict longer prefix). */
export function ghostRemainder(typedLine: string, item: SuggestItem | string | undefined, pathPrefix?: string): string {
  if (!item) return "";
  const command = typeof item === "string" ? item : item.command;
  const source = typeof item === "string" ? "command" : item.source;
  if (source === "path" && pathPrefix != null) return completionSuffix(pathPrefix, command);
  if (!isGhostPrefixMatch(typedLine, command)) return "";
  return command.slice(typedLine.length);
}

/**
 * Build PTY bytes to fill a suggestion (replaceTerminalLineWith):
 * - history/quick/command: erase typed line + write full command
 * - path: append suffix onto the last path token only
 */
export function fillSuggestPayload(typedLine: string, item: SuggestItem, pathPrefix?: string): string {
  if (item.source === "path") {
    const prefix = pathPrefix ?? typedLine;
    return completionSuffix(prefix, item.command);
  }
  if (item.command === typedLine) return "";
  if (isGhostPrefixMatch(typedLine, item.command) || typedLine.length === 0) {
    return completionSuffix(typedLine, item.command);
  }
  return `${"\u007f".repeat(typedLine.length)}${item.command}`;
}

/** Tab fill rule: Tab fills only strict prefix extension or when user ↑↓-armed. */
export function resolveSuggestionTabKey(command: string, line: string, tabArmed: boolean): "fill" | "shell" {
  if (tabArmed) return "fill";
  return command.length > line.length && command.startsWith(line) ? "fill" : "shell";
}

/** Match highlight segments for the menu. */
export function suggestHighlightSegments(command: string, indices: number[]): Array<{ text: string; matched: boolean }> {
  const matched = new Set(indices);
  const out: Array<{ text: string; matched: boolean }> = [];
  let current: { text: string; matched: boolean } | null = null;
  for (let i = 0; i < command.length; i += 1) {
    const isMatched = matched.has(i);
    if (!current || current.matched !== isMatched) {
      current = { text: command.charAt(i), matched: isMatched };
      out.push(current);
    } else {
      current.text += command.charAt(i);
    }
  }
  return out;
}

/**
 * Warp/fish ghost accept: bare → / Ctrl+F / Ctrl+E.
 * Ctrl+F only (not Cmd+F) — Cmd+F stays terminal Find on Apple.
 * Search uses Ctrl/Cmd+Shift+F, or Ctrl/Cmd+F when no ghost is showing.
 */
export function matchesGhostFullAccept(options: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): boolean {
  const { key, ctrlKey, metaKey, altKey, shiftKey } = options;
  if (key === "ArrowRight") return !ctrlKey && !metaKey && !altKey && !shiftKey;
  if (ctrlKey && !metaKey && !altKey && !shiftKey) {
    const k = key.toLowerCase();
    return k === "f" || k === "e";
  }
  return false;
}

/** Fish-style word accept: Alt+→ or Ctrl+→ (not Shift/Meta). */
export function matchesGhostWordAccept(options: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): boolean {
  if (options.key !== "ArrowRight") return false;
  if (options.shiftKey || options.metaKey) return false;
  return options.altKey || options.ctrlKey;
}

/**
 * Next chunk of a ghost remainder: leading spaces + one non-space run
 * (e.g. `" pods -A"` → `" pods"`).
 */
export function ghostWordRemainder(ghost: string): string {
  if (!ghost) return "";
  const match = ghost.match(/^(\s*\S+)/);
  return match?.[1] ?? ghost;
}

/**
 * Suggest overlay keys. Shell history owns ↑ until the user explicitly enters
 * the menu (↓ or Tab-armed): otherwise one ↑ would trap readline history.
 */
export function resolveCommandSuggestKey(options: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  /** True after ↓ / Tab has focused the suggest list. */
  menuArmed?: boolean;
}): CommandSuggestKey {
  if (options.ctrlKey || options.metaKey || options.altKey) return { action: "ignore" };
  const armed = options.menuArmed === true;
  if (options.key === "ArrowDown") return { action: "move", delta: 1 };
  if (options.key === "ArrowUp") {
    // Unarmed ↑ → dismiss + pass through so the remote shell browses HISTFILE.
    if (!armed) return { action: "passthrough" };
    return { action: "move", delta: -1 };
  }
  if (options.key === "Tab" && !options.shiftKey) return { action: "accept" };
  if (options.key === "Enter") return { action: "ignore" };
  if (options.key === "Escape") return { action: "dismiss" };
  return { action: "ignore" };
}

/** Apply a PTY keystroke chunk to the in-progress token (command or path). */
export function applyInputToToken(token: string, data: string): string {
  if (!data) return token;
  if (data === "\r" || data === "\n" || data === "\u0003") return "";
  if (data === "\u007f" || data === "\b") return token.slice(0, -1);
  if (data === " " || data === "\t") return "";
  if (data.startsWith("\u001b")) return token;
  let next = token;
  for (const ch of data) {
    if (ch === "\r" || ch === "\n") next = "";
    else if (ch === "\u007f" || ch === "\b") next = next.slice(0, -1);
    else if (ch === " " || ch === "\t") next = "";
    else if (/[A-Za-z0-9._/+~-]/.test(ch)) next += ch;
  }
  return next;
}

export interface CursorLineBuffer {
  viewportY: number;
  cursorY: number;
  cursorX: number;
  getLine(y: number): { translateToString(trimRight?: boolean, startCol?: number, endCol?: number): string } | undefined;
}

/** xterm `getLine` is buffer-absolute; `cursorY` is viewport-relative. */
export function cursorLineTextBeforeCursor(buffer: CursorLineBuffer): string {
  const line = buffer.getLine(buffer.viewportY + buffer.cursorY);
  if (!line) return "";
  return line.translateToString(false, 0, buffer.cursorX);
}

export function overlayOffsetForCell(
  host: HTMLElement,
  grid: { cols: number; rows: number },
  col: number,
  row: number,
  pane: HTMLElement,
  placement: "above" | "below" | "inline" = "above",
): { left: number; top: number } | null {
  if (grid.cols <= 0 || grid.rows <= 0) return null;
  const screen = host.querySelector<HTMLElement>(".xterm-screen") ?? host;
  const screenRect = screen.getBoundingClientRect();
  const paneRect = pane.getBoundingClientRect();
  if (!screenRect.width || !screenRect.height) return null;
  const cellW = screenRect.width / grid.cols;
  const cellH = screenRect.height / grid.rows;
  const left = Math.max(8, screenRect.left - paneRect.left + col * cellW);
  const rowTop = screenRect.top - paneRect.top + row * cellH;
  if (placement === "inline") return { left, top: rowTop };
  if (placement === "below") return { left, top: rowTop + cellH + 4 };
  return { left, top: rowTop - 4 };
}
