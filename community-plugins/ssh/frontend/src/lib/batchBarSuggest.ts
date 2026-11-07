/**
 * Batch-bar compose suggest: merge quick commands + recent history, filter by
 * the draft query, and highlight matched substrings. Pure helpers for the
 * bottom command strip (keeps App.vue free of list arithmetic).
 */

import { filterQuickCommands, type QuickCommand } from "./quickCommands";

export const BATCH_BAR_SUGGEST_LIMIT = 12;

export type BatchSuggestKind = "quick" | "history";

export interface BatchSuggestItem {
  /** Stable key for v-for / pick handlers. */
  id: string;
  kind: BatchSuggestKind;
  /** Primary label (quick name, or truncated command for history). */
  title: string;
  command: string;
}

export interface BatchSuggestHighlightSeg {
  text: string;
  matched: boolean;
}

/** Case-insensitive substring highlight (first hit only — enough for draft filter). */
export function highlightBatchSuggestText(text: string, query: string): BatchSuggestHighlightSeg[] {
  const needle = query.trim();
  if (!needle || !text) return [{ text, matched: false }];
  const lower = text.toLowerCase();
  const idx = lower.indexOf(needle.toLowerCase());
  if (idx < 0) return [{ text, matched: false }];
  const segs: BatchSuggestHighlightSeg[] = [];
  if (idx > 0) segs.push({ text: text.slice(0, idx), matched: false });
  segs.push({ text: text.slice(idx, idx + needle.length), matched: true });
  if (idx + needle.length < text.length) segs.push({ text: text.slice(idx + needle.length), matched: false });
  return segs;
}

function historyMatches(command: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return command.toLowerCase().includes(needle);
}

/**
 * Quick commands first (name/command/group filter), then recent history not
 * already covered by a quick command's exact text. Empty query keeps ordering
 * for button-browse; non-empty filters both sources.
 */
export function buildBatchSuggestItems(options: {
  quick: readonly QuickCommand[];
  historyCommands: readonly string[];
  query: string;
  limit?: number;
}): BatchSuggestItem[] {
  const limit = options.limit ?? BATCH_BAR_SUGGEST_LIMIT;
  const quickHits = filterQuickCommands(options.quick, options.query);
  const seenCommands = new Set<string>();
  const out: BatchSuggestItem[] = [];

  for (const item of quickHits) {
    if (out.length >= limit) break;
    const command = item.command.trim();
    if (!command) continue;
    seenCommands.add(command);
    out.push({
      id: `quick:${item.id}`,
      kind: "quick",
      title: item.name || command,
      command: item.command,
    });
  }

  for (const raw of options.historyCommands) {
    if (out.length >= limit) break;
    const command = raw.trim();
    if (!command || seenCommands.has(command)) continue;
    if (!historyMatches(command, options.query)) continue;
    seenCommands.add(command);
    out.push({
      id: `history:${command}`,
      kind: "history",
      title: command,
      command,
    });
  }

  return out;
}
