// Terminal interaction prefs: history overlay + completion layers.
// Persisted via uiStorage in App.vue (opaque-origin safe).

export type HistoryScope = "global" | "connection";

export type InteractionPrefs = {
  /** Record PTY/command-bar commands into history. */
  historyEnabled: boolean;
  /** Enter in history overlay runs immediately (otherwise fill only). */
  historyEnterRuns: boolean;
  /** Max retained history rows (clamped). */
  historyLimit: number;
  /** Show all connections vs only the current connection. */
  historyScope: HistoryScope;
  /** Fig / static-spec completion menu. */
  figCompletionEnabled: boolean;
  /** Inline line suggest (history/quick/path). */
  lineSuggestEnabled: boolean;
  /**
   * Warp-style compact line suggest: show ghost only; open the list after ↓ / Tab arm.
   * Full accept (→ / Ctrl+F) still works while the list is hidden.
   */
  suggestCompactMode: boolean;
};

export const DEFAULT_INTERACTION_PREFS: InteractionPrefs = {
  historyEnabled: true,
  historyEnterRuns: false,
  historyLimit: 100,
  historyScope: "global",
  figCompletionEnabled: true,
  lineSuggestEnabled: true,
  suggestCompactMode: false,
};

export function clampHistoryLimit(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_INTERACTION_PREFS.historyLimit;
  return Math.min(200, Math.max(20, Math.round(n)));
}

export function sanitizeInteractionPrefs(raw: unknown): InteractionPrefs {
  const base = { ...DEFAULT_INTERACTION_PREFS };
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  return {
    historyEnabled: o.historyEnabled !== false,
    historyEnterRuns: o.historyEnterRuns === true,
    historyLimit: clampHistoryLimit(o.historyLimit),
    historyScope: o.historyScope === "connection" ? "connection" : "global",
    figCompletionEnabled: o.figCompletionEnabled !== false,
    lineSuggestEnabled: o.lineSuggestEnabled !== false,
    suggestCompactMode: o.suggestCompactMode === true,
  };
}
