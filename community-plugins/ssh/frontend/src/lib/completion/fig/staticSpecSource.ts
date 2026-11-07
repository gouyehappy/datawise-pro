/**
 * Wave 1 static Fig.Spec walker (no amazon-q parser / no generators).
 * Produces CompletionItems with label + description for options/subcommands.
 * When the cursor is in an option-arg value slot, defers to path generators /
 * static suggestions / hints instead of re-listing flags.
 */

import { splitCommandLine } from "../core/tokenize";
import type { CompletionItem, CompletionItemKind, CompletionResponse } from "../core/types";
import type { FigCompletionSource, FigSourceRequest, FigSpecManifest } from "./source";
import {
  activePositionalArgs,
  argDisplayName,
  argSuggestionList,
  argWantsPath,
  findPendingOptionArg,
  optionConsumesArg,
  pendingValueReplaceRange,
  walkSpecContext,
  type FigNamedLike,
  type PendingOptionArg,
} from "./optionArgPhase";

type FigNamed = FigNamedLike;

function namesOf(entry: FigNamed | undefined): string[] {
  if (!entry?.name) return [];
  return Array.isArray(entry.name) ? entry.name.filter(Boolean) : [entry.name];
}

function primaryLabel(names: string[], prefix: string): string {
  if (!names.length) return "";
  if (prefix.startsWith("--")) return names.find((n) => n.startsWith("--")) ?? names[0];
  if (/^-[^-]$/.test(prefix)) {
    return names.find((n) => /^-[^-]$/.test(n)) ?? names[0];
  }
  return names.find((n) => n.startsWith("--")) ?? names[0];
}

function matchesPrefix(names: string[], prefix: string): boolean {
  if (!prefix) return true;
  const needle = prefix.toLowerCase();
  return names.some((n) => n.toLowerCase().startsWith(needle));
}

function scoreLabel(label: string, prefix: string): number {
  const lower = label.toLowerCase();
  const needle = prefix.toLowerCase();
  if (lower === needle) return 100;
  if (lower.startsWith(needle)) return 80 - Math.min(40, label.length);
  return 40;
}

function lastTokenRange(line: string, trailingSpace: boolean): { start: number; end: number; prefix: string } {
  if (trailingSpace) return { start: line.length, end: line.length, prefix: "" };
  const match = /\S+$/.exec(line);
  if (!match) return { start: line.length, end: line.length, prefix: "" };
  return { start: match.index, end: line.length, prefix: match[0] };
}

/** Flag tokens already on the line (so non-repeatable options can be hidden). */
function usedOptionNames(tokens: string[], trailingSpace: boolean): Set<string> {
  const used = new Set<string>();
  const end = trailingSpace ? tokens.length : Math.max(0, tokens.length - 1);
  for (let i = 1; i < end; i += 1) {
    const token = tokens[i];
    if (!token || !token.startsWith("-") || token === "-") continue;
    const head = token.includes("=") ? token.slice(0, token.indexOf("=")) : token;
    // Always record the full flag token (`-it`, `--detach`, `--opt=…` head).
    used.add(head.toLowerCase());
    // Attached short form `-ofile` also marks `-o` as used (multi-char names like
    // `-it` / `-xe` stay hidden via the full-token entry above).
    if (!token.startsWith("--") && !token.includes("=") && head.length > 2) {
      used.add(head.slice(0, 2).toLowerCase());
    }
  }
  return used;
}

/** Drop items that would replace the typed token with the same text (no-op). */
function filterNoopExactItems(items: CompletionItem[], prefix: string): CompletionItem[] {
  if (!prefix) return items;
  const needle = prefix.toLowerCase();
  return items.filter((item) => {
    const text = item.edit.text;
    if (!text) return true; // hints keep empty edits
    // Exact boolean flag / subcommand already typed — nothing useful to insert.
    if (text.toLowerCase() === needle) return false;
    if (item.label.toLowerCase() === needle && text === item.label) return false;
    return true;
  });
}

function optionAlreadyUsed(opt: FigNamed, used: Set<string>): boolean {
  if (opt.isRepeatable === true) return false;
  if (optionConsumesArg(opt)) return false;
  return namesOf(opt).some((n) => used.has(n.toLowerCase()));
}

function buildItem(
  entry: FigNamed,
  kind: CompletionItemKind,
  prefix: string,
  range: { start: number; end: number },
): CompletionItem | null {
  const names = namesOf(entry);
  if (!matchesPrefix(names, prefix)) return null;
  const label = primaryLabel(names, prefix);
  if (!label) return null;
  const needsSpace = kind === "subcommand" || (kind === "option" && entry.args != null);
  const text = `${label}${needsSpace ? " " : ""}`;
  return {
    id: `${kind}:${label}`,
    label,
    description: entry.description,
    kind,
    score: scoreLabel(label, prefix),
    source: "fig-spec",
    edit: { text, replaceStart: range.start, replaceEnd: range.end },
  };
}

function suggestionItems(
  suggestions: string[],
  valuePrefix: string,
  range: { start: number; end: number },
  description?: string,
): CompletionItem[] {
  const needle = valuePrefix.toLowerCase();
  const items: CompletionItem[] = [];
  for (const name of suggestions) {
    if (needle && !name.toLowerCase().startsWith(needle)) continue;
    items.push({
      id: `argument:${name}`,
      label: name,
      description: description || "argument",
      kind: "argument",
      score: scoreLabel(name, valuePrefix),
      source: "fig-spec",
      edit: { text: `${name} `, replaceStart: range.start, replaceEnd: range.end },
    });
  }
  return items;
}

function valueModeResponse(
  pending: PendingOptionArg,
  lead: number,
  trimmed: string,
  trailingSpace: boolean,
  requestId: number,
  revision: number,
  context: CompletionResponse["context"],
): CompletionResponse {
  const localRange = pendingValueReplaceRange(trimmed, trailingSpace, pending);
  const absRange = { start: localRange.start + lead, end: localRange.end + lead };
  const suggestions = argSuggestionList(pending.option.args);

  if (suggestions.length) {
    const items = suggestionItems(suggestions, localRange.prefix, absRange, pending.option.description);
    if (items.length) {
      return { requestId, revision, state: "ready", context, items };
    }
  }

  // Path-like args: empty static list; path generator fills via slots.
  if (argWantsPath(pending.option.args)) {
    return { requestId, revision, state: "ready", context, items: [] };
  }

  const argName = argDisplayName(pending.option.args);
  return {
    requestId,
    revision,
    state: "ready",
    context,
    items: [{
      id: `hint:arg:${argName}`,
      label: `<${argName}>`,
      description: pending.option.description || "argument",
      kind: "hint",
      score: 10,
      source: "fig-spec",
      edit: { text: "", replaceStart: absRange.start, replaceEnd: absRange.end },
    }],
  };
}

export function resolveStaticFigLine(
  line: string,
  manifest: FigSpecManifest,
  requestId: number,
  revision: number,
): CompletionResponse | null {
  try {
    const leadMatch = /^\s*/.exec(line);
    const lead = leadMatch?.[0].length ?? 0;
    const trimmed = line.slice(lead);
    if (!trimmed) return null;

    const { tokens, trailingSpace, terminated } = splitCommandLine(trimmed);
    if (!tokens.length) return null;

    const command = tokens[0]?.text ?? "";
    if (!command || command.startsWith("-")) return null;
    const root = manifest[command] as FigNamed | undefined;
    if (!root || typeof root !== "object") return null;

    // Still typing the command name itself — leave to history PATH suggest.
    if (tokens.length === 1 && !trailingSpace) return null;

    const tokenTexts = tokens.map((t) => t.text);
    const range = lastTokenRange(trimmed, trailingSpace);
    const absRange = { start: range.start + lead, end: range.end + lead };
    const prefix = range.prefix;
    const context = {
      command,
      commandPath: [command],
      tokenStart: absRange.start,
      tokenEnd: absRange.end,
    };

    // Value mode: cursor is filling an option argument — do not re-list flags.
    const pending = findPendingOptionArg(root, tokenTexts, trailingSpace);
    if (pending) {
      return valueModeResponse(pending, lead, trimmed, trailingSpace, requestId, revision, context);
    }

    const current = walkSpecContext(root, tokenTexts, trailingSpace);
    const items: CompletionItem[] = [];
    const usedFlags = usedOptionNames(tokenTexts, trailingSpace);

    const listingFlags = !terminated && (prefix.startsWith("-") || trailingSpace || prefix === "");
    const listingSubs = !prefix.startsWith("-");

    if (listingSubs) {
      for (const sub of current.subcommands ?? []) {
        const item = buildItem(sub, "subcommand", prefix, absRange);
        if (item) items.push(item);
      }
      // Positional arg suggestions (e.g. `kubectl get ▌` → pods/nodes/…).
      const activeArgs = activePositionalArgs(current.args, tokenTexts, trailingSpace);
      const positional = argSuggestionList(activeArgs);
      if (positional.length && !prefix.startsWith("-")) {
        items.push(...suggestionItems(positional, prefix, absRange, argDisplayName(activeArgs)));
      }
    }
    if (listingFlags) {
      for (const opt of current.options ?? []) {
        if (optionAlreadyUsed(opt, usedFlags)) continue;
        const item = buildItem(opt, "option", prefix, absRange);
        if (item) items.push(item);
      }
    }

    // Root positional arg hint when nothing else matched. Skip path-shaped
    // args (`cd ` / folders): the path generator owns those, and an empty
    // leaf must not pop a placeholder `<folder>` row with no typed input.
    if (
      !items.length
      && trailingSpace
      && root.args
      && !prefix.startsWith("-")
      && !argWantsPath(root.args)
    ) {
      const rootSuggestions = argSuggestionList(root.args);
      if (rootSuggestions.length) {
        items.push(...suggestionItems(rootSuggestions, "", absRange, argDisplayName(root.args)));
      } else {
        const argName = argDisplayName(root.args);
        items.push({
          id: `hint:root:${argName}`,
          label: `<${argName}>`,
          description: typeof root.description === "string" ? root.description : "argument",
          kind: "hint",
          score: 5,
          source: "fig-spec",
          edit: { text: "", replaceStart: absRange.start, replaceEnd: absRange.end },
        });
      }
    }

    const useful = filterNoopExactItems(items, prefix);
    if (!useful.length) return null;
    return {
      requestId,
      revision,
      state: "ready",
      context,
      items: useful,
    };
  } catch {
    return null;
  }
}

export function createStaticFigSource(manifest: FigSpecManifest): FigCompletionSource {
  return {
    id: "static-fig-wave1",
    resolve(request: FigSourceRequest): CompletionResponse | null {
      return resolveStaticFigLine(request.line, manifest, request.requestId, request.revision);
    },
  };
}

/** True when line is in option-arg value mode for a path-like arg (for path slots + line soft-fallback). */
export function isPendingPathOptionArg(line: string, manifest: FigSpecManifest): boolean {
  try {
    const trimmed = line.replace(/^\s+/, "");
    if (!trimmed) return false;
    const { tokens, trailingSpace } = splitCommandLine(trimmed);
    if (!tokens.length) return false;
    const command = tokens[0]?.text ?? "";
    const root = manifest[command] as FigNamed | undefined;
    if (!root) return false;
    const pending = findPendingOptionArg(root, tokens.map((t) => t.text), trailingSpace);
    return Boolean(pending && argWantsPath(pending.option.args));
  } catch {
    return false;
  }
}

/** True when line is in any option-arg value mode (suppress history soft-fallback under Fig). */
export function isPendingOptionArgPhase(line: string, manifest: FigSpecManifest): boolean {
  try {
    const trimmed = line.replace(/^\s+/, "");
    if (!trimmed) return false;
    const { tokens, trailingSpace } = splitCommandLine(trimmed);
    if (!tokens.length) return false;
    const command = tokens[0]?.text ?? "";
    const root = manifest[command] as FigNamed | undefined;
    if (!root) return false;
    return findPendingOptionArg(root, tokens.map((t) => t.text), trailingSpace) != null;
  } catch {
    return false;
  }
}

export { shouldSuppressSoftHistoryUnderFig } from "./optionArgPhase";
