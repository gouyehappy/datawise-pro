/**
 * Terminal-resident quick-command palette (Ctrl/Cmd+;): fuzzy pick → inject into PTY.
 * Keeps snippet launch keyboard-only without opening the sidebar.
 */

import { scoreSubsequence } from "./commandSuggest";
import type { QuickCommand } from "./quickCommands";

export const QUICK_PALETTE_LIMIT = 24;

export type QuickPaletteKey =
  | { action: "ignore" }
  | { action: "move"; delta: number }
  | { action: "confirm" }
  | { action: "confirm-run" }
  | { action: "cancel" };

/** Ctrl/Cmd+; opens the quick-command palette (Shift/Alt ignored). */
export function isQuickPaletteShortcut(options: {
  type?: string;
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): boolean {
  if (options.type && options.type !== "keydown") return false;
  if (options.altKey || options.shiftKey) return false;
  if (!(options.ctrlKey || options.metaKey)) return false;
  return options.key === ";" || options.code === "Semicolon";
}

export function resolveQuickPaletteKey(options: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}): QuickPaletteKey {
  const mod = options.ctrlKey || options.metaKey;
  if (options.altKey) return { action: "ignore" };
  if (options.key === "ArrowDown" && !mod) return { action: "move", delta: 1 };
  if (options.key === "ArrowUp" && !mod) return { action: "move", delta: -1 };
  if (options.key === "Enter" && mod) return { action: "confirm-run" };
  if ((options.key === "Enter" || options.key === "Tab") && !mod) return { action: "confirm" };
  if (options.key === "Escape") return { action: "cancel" };
  return { action: "ignore" };
}

export interface QuickPaletteItem {
  id: string;
  name: string;
  command: string;
  group?: string;
  score: number;
}

/** Rank visible quick commands by name/command/group subsequence score. */
export function filterQuickPaletteItems(
  list: readonly QuickCommand[],
  query: string,
  limit = QUICK_PALETTE_LIMIT,
): QuickPaletteItem[] {
  const needle = query.trim();
  const rows: QuickPaletteItem[] = [];
  for (const item of list) {
    const command = item.command.trim();
    if (!command) continue;
    if (!needle) {
      rows.push({
        id: item.id,
        name: item.name || command,
        command: item.command,
        group: item.group,
        score: 0,
      });
      continue;
    }
    const haystacks = [item.name, item.command, item.group ?? ""];
    let best: { score: number } | null = null;
    for (const hay of haystacks) {
      if (!hay) continue;
      const match = scoreSubsequence(needle, hay);
      if (!match) continue;
      if (!best || match.score > best.score) best = match;
    }
    if (!best) continue;
    rows.push({
      id: item.id,
      name: item.name || command,
      command: item.command,
      group: item.group,
      score: best.score,
    });
  }
  if (!needle) return rows.slice(0, Math.max(0, limit));
  return rows
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, Math.max(0, limit));
}
