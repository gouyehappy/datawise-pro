/**
 * Universal command palette (Ctrl/Cmd+Shift+P).
 * One keyboard entry that gathers terminal actions, panel toggles and settings jumps.
 * Pure logic only — the command registry is built in App.vue where the actions live.
 */

import { scoreSubsequence } from "./commandSuggest";
import { resolveQuickPaletteKey, type QuickPaletteKey } from "./quickCommandPalette";

export const COMMAND_PALETTE_LIMIT = 60;

export type PaletteCommand = {
  id: string;
  /** Already translated display label. */
  label: string;
  /** Already translated group name. */
  group: string;
  /** Search aliases (English + Chinese), not displayed as primary text. */
  aliases?: string;
  /** Optional shortcut hint shown on the right. */
  shortcut?: string;
  /** Executed when the command is picked. */
  run: () => void;
};

export type PaletteGroup = { group: string; items: PaletteCommand[] };

export type PaletteKey = QuickPaletteKey;
export { resolveQuickPaletteKey };

/** Ctrl/Cmd+Shift+P. Alt is not accepted; Shift is required (distinct from Ctrl+P). */
export function isCommandPaletteShortcut(options: {
  type?: string;
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): boolean {
  if (options.type && options.type !== "keydown") return false;
  if (options.altKey || !options.shiftKey) return false;
  if (!(options.ctrlKey || options.metaKey)) return false;
  return options.key === "p" || options.key === "P" || options.code === "KeyP";
}

function scoreCommand(query: string, cmd: PaletteCommand): number | null {
  const haystacks = [cmd.label, cmd.group, cmd.aliases ?? ""];
  let best: number | null = null;
  for (const hay of haystacks) {
    if (!hay) continue;
    const match = scoreSubsequence(query, hay);
    if (!match) continue;
    if (best === null || match.score > best) best = match.score;
  }
  return best;
}

/** Rank commands by label/group/aliases subsequence score. */
export function filterPaletteCommands(
  commands: readonly PaletteCommand[],
  query: string,
  limit = COMMAND_PALETTE_LIMIT,
): PaletteCommand[] {
  const needle = query.trim();
  if (!needle) return commands.slice(0, Math.max(0, limit));
  const scored: Array<{ cmd: PaletteCommand; score: number }> = [];
  for (const cmd of commands) {
    const score = scoreCommand(needle, cmd);
    if (score !== null) scored.push({ cmd, score });
  }
  scored.sort((a, b) => b.score - a.score || a.cmd.label.localeCompare(b.cmd.label));
  return scored.slice(0, Math.max(0, limit)).map((row) => row.cmd);
}

/** Preserve command order but bucket by group for sectioned rendering. */
export function groupPaletteCommands(commands: readonly PaletteCommand[]): PaletteGroup[] {
  const groups: PaletteGroup[] = [];
  for (const cmd of commands) {
    let group = groups.find((row) => row.group === cmd.group);
    if (!group) {
      group = { group: cmd.group, items: [] };
      groups.push(group);
    }
    group.items.push(cmd);
  }
  return groups;
}
