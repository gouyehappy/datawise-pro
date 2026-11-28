// Terminal interaction prefs: history overlay + completion layers.
// Persisted via uiStorage in App.vue (opaque-origin safe).

export type HistoryScope = "global" | "connection";

/**
 * Motty-aligned command completion presentation:
 * - hotkey: no auto list / ghost; open only when the user asks (↓ / Ctrl+Shift+J)
 * - list: open the candidate list while typing
 * - inline: gray ghost only; ↓ / Tab arms the list
 */
export type CompletionMode = "hotkey" | "list" | "inline";

/** Motty accept-suggestion badge presets (Warp-style). */
export type AcceptSuggestionKey = "arrowRight" | "tab" | "shiftArrowRight";

export type InteractionPrefs = {
  /** Record PTY/command-bar commands into history. */
  historyEnabled: boolean;
  /** Enter in history overlay runs immediately (otherwise fill only). */
  historyEnterRuns: boolean;
  /** Max retained history rows (clamped). */
  historyLimit: number;
  /** Show all connections vs only the current connection. */
  historyScope: HistoryScope;
  /** Motty-style single completion presentation mode. */
  completionMode: CompletionMode;
  /** Show the accept key badge beside the gray inline ghost. */
  acceptKeyHintEnabled: boolean;
  /** Which key accepts the full ghost (Motty badge menu). */
  acceptSuggestionKey: AcceptSuggestionKey;
  /**
   * Derived mirrors kept in sync with `completionMode` so existing call sites
   * (Fig / line ownership) keep working without a wide rewrite.
   */
  figCompletionEnabled: boolean;
  lineSuggestEnabled: boolean;
  /**
   * Warp-style compact line suggest: show ghost only; open the list after ↓ / Tab arm.
   * Full accept (→ / Ctrl+F) still works while the list is hidden.
   */
  suggestCompactMode: boolean;
  /** Disable soft wrap: widen PTY so long lines scroll horizontally (#306). */
  noWrap: boolean;
  /** Target column count while no-wrap is on (clamped). */
  noWrapColumns: number;
  /**
   * Master switch for the read-only command input hint overlay (parameter /
   * syntax lint / risk / remote --help). On by default. When a picker overlay
   * (history suggest list / completion menu / history panel) is open the hint
   * auto-hides so two popovers never stack — see `commandHintVisibility.ts`.
   */
  commandHintsEnabled: boolean;
};

export const NOWRAP_COLUMNS_MIN = 80;
export const NOWRAP_COLUMNS_MAX = 10_000;

export const COMPLETION_MODES: readonly CompletionMode[] = ["hotkey", "list", "inline"] as const;

export const DEFAULT_INTERACTION_PREFS: InteractionPrefs = {
  historyEnabled: true,
  historyEnterRuns: false,
  historyLimit: 100,
  historyScope: "global",
  completionMode: "list",
  acceptKeyHintEnabled: true,
  acceptSuggestionKey: "arrowRight",
  figCompletionEnabled: true,
  lineSuggestEnabled: true,
  suggestCompactMode: false,
  noWrap: false,
  noWrapColumns: 1000,
  // On by default: keep pre-setting behavior (hints were unconditional).
  commandHintsEnabled: true,
};

export function clampNoWrapColumns(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_INTERACTION_PREFS.noWrapColumns;
  return Math.min(NOWRAP_COLUMNS_MAX, Math.max(NOWRAP_COLUMNS_MIN, Math.round(n)));
}

export function clampHistoryLimit(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_INTERACTION_PREFS.historyLimit;
  return Math.min(200, Math.max(20, Math.round(n)));
}

export function sanitizeCompletionMode(raw: unknown): CompletionMode | null {
  return raw === "hotkey" || raw === "list" || raw === "inline" ? raw : null;
}

/** Map Motty-style mode → derived engine flags (mirrors stored for older callers). */
export function flagsFromCompletionMode(mode: CompletionMode): Pick<
  InteractionPrefs,
  "figCompletionEnabled" | "lineSuggestEnabled" | "suggestCompactMode"
> {
  switch (mode) {
    case "hotkey":
      // Engines stay on so a manual open can still resolve Fig / line ownership.
      return { figCompletionEnabled: true, lineSuggestEnabled: true, suggestCompactMode: false };
    case "inline":
      return { figCompletionEnabled: true, lineSuggestEnabled: true, suggestCompactMode: true };
    case "list":
    default:
      return { figCompletionEnabled: true, lineSuggestEnabled: true, suggestCompactMode: false };
  }
}

/**
 * Migrate pre-mode prefs (three booleans) → Motty completionMode.
 * Prefer an explicit mode when present.
 */
export function completionModeFromLegacyFlags(flags: {
  figCompletionEnabled?: boolean;
  lineSuggestEnabled?: boolean;
  suggestCompactMode?: boolean;
}): CompletionMode {
  const fig = flags.figCompletionEnabled !== false;
  const line = flags.lineSuggestEnabled !== false;
  if (!fig && !line) return "hotkey";
  if (flags.suggestCompactMode === true) return "inline";
  return "list";
}

/**
 * Typing schedules Fig + line engines. Hotkey waits for a manual ask (↓).
 * Inline still schedules so gray ghost can update; the candidate *list* stays closed.
 */
export function completionModeAutoOpens(mode: CompletionMode): boolean {
  return mode === "list" || mode === "inline";
}

/** Fig / suggest candidate popup opens while typing — Motty “自动列表” only. */
export function completionModeShowsList(mode: CompletionMode): boolean {
  return mode === "list";
}

/** Gray ghost text is shown for list + inline; hotkey stays quiet until opened. */
export function completionModeShowsGhost(mode: CompletionMode): boolean {
  return mode === "list" || mode === "inline";
}

export const ACCEPT_SUGGESTION_KEYS: readonly AcceptSuggestionKey[] = [
  "arrowRight",
  "tab",
  "shiftArrowRight",
] as const;

export function sanitizeAcceptSuggestionKey(raw: unknown): AcceptSuggestionKey {
  return raw === "tab" || raw === "shiftArrowRight" || raw === "arrowRight" ? raw : "arrowRight";
}

/** Compact badge / menu label for the accept-suggestion key. */
export function acceptSuggestionKeyLabel(key: AcceptSuggestionKey): string {
  switch (key) {
    case "tab":
      return "Tab";
    case "shiftArrowRight":
      return "Shift+→";
    case "arrowRight":
    default:
      return "→";
  }
}

export function sanitizeInteractionPrefs(raw: unknown): InteractionPrefs {
  const base = { ...DEFAULT_INTERACTION_PREFS };
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const explicit = sanitizeCompletionMode(o.completionMode);
  const mode =
    explicit ??
    completionModeFromLegacyFlags({
      figCompletionEnabled: o.figCompletionEnabled !== false,
      lineSuggestEnabled: o.lineSuggestEnabled !== false,
      suggestCompactMode: o.suggestCompactMode === true,
    });
  const flags = flagsFromCompletionMode(mode);
  return {
    historyEnabled: o.historyEnabled !== false,
    historyEnterRuns: o.historyEnterRuns === true,
    historyLimit: clampHistoryLimit(o.historyLimit),
    historyScope: o.historyScope === "connection" ? "connection" : "global",
    completionMode: mode,
    acceptKeyHintEnabled: o.acceptKeyHintEnabled !== false,
    acceptSuggestionKey: sanitizeAcceptSuggestionKey(o.acceptSuggestionKey),
    ...flags,
    noWrap: o.noWrap === true,
    noWrapColumns: clampNoWrapColumns(o.noWrapColumns),
    // Default on; only an explicit false disables the command hint overlay.
    commandHintsEnabled: o.commandHintsEnabled !== false,
  };
}

/** Apply a completionMode change and keep derived mirrors consistent. */
export function withCompletionMode(
  prefs: InteractionPrefs,
  mode: CompletionMode,
): InteractionPrefs {
  return sanitizeInteractionPrefs({ ...prefs, completionMode: mode });
}
