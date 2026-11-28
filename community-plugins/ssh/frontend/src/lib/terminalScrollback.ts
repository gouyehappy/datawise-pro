/**
 * Motty-style scrollback helpers for xterm.js.
 *
 * xterm has no public `clearScrollback()`; temporarily setting `scrollback` to 0
 * forces the buffer to trim lines above the viewport, then restoring the budget
 * keeps future history capacity (same trick used by several xterm hosts).
 */

export type ScrollbackTerminal = {
  rows: number;
  options: { scrollback?: number };
  buffer: { active: { baseY: number; length: number } };
  clearSelection(): void;
};

/** True when the active buffer holds lines above the viewport. */
export function terminalHasScrollback(term: ScrollbackTerminal): boolean {
  const buf = term.buffer.active;
  return buf.baseY > 0 || buf.length > term.rows;
}

/**
 * Drop scrollback only; keep the visible screen (Motty ClearScrollback).
 * `restoreScrollback` is the preferred budget to re-apply after the trim.
 */
export function clearXtermScrollback(term: ScrollbackTerminal, restoreScrollback: number): void {
  const keep =
    typeof restoreScrollback === "number" && Number.isFinite(restoreScrollback) && restoreScrollback >= 0
      ? Math.floor(restoreScrollback)
      : 0;
  term.options.scrollback = 0;
  term.options.scrollback = keep;
  term.clearSelection();
}
