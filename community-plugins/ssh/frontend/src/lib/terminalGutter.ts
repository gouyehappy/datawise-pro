/**
 * Motty-style terminal gutter (S-GUTTER): left strip with line numbers and/or
 * write-time (HH:MM:SS). Width is reserved from the terminal pane so FitAddon /
 * PTY cols shrink once; alternate-screen keeps the same width but paints blank
 * (vim/htop never see a resize). Time stamps update when content is written.
 */

export type TerminalGutterMode = "off" | "numbers" | "time" | "both";

export const GUTTER_NUMBER_CHARS = 6;
export const GUTTER_TIME_CHARS = 8;
/** Extra pixels between gutter text and the xterm grid (Motty rule gap ≈ 16). */
export const GUTTER_RULE_GAP_PX = 12;

export const GUTTER_MODE_CHOICES: readonly TerminalGutterMode[] = ["off", "numbers", "time", "both"];

export function sanitizeGutterMode(raw: unknown): TerminalGutterMode {
  return raw === "numbers" || raw === "time" || raw === "both" || raw === "off" ? raw : "off";
}

export function gutterShowsNumbers(mode: TerminalGutterMode): boolean {
  return mode === "numbers" || mode === "both";
}

export function gutterShowsTimes(mode: TerminalGutterMode): boolean {
  return mode === "time" || mode === "both";
}

/** Cell width of the gutter text (Motty `chars()`). */
export function gutterTextChars(mode: TerminalGutterMode): number {
  let n = 0;
  if (gutterShowsNumbers(mode)) n += GUTTER_NUMBER_CHARS;
  if (gutterShowsTimes(mode)) n += GUTTER_TIME_CHARS;
  if (n === GUTTER_NUMBER_CHARS + GUTTER_TIME_CHARS) n += 1; // spacer cell
  return n;
}

export function gutterWidthPx(mode: TerminalGutterMode, cellWidth: number): number {
  const chars = gutterTextChars(mode);
  if (chars <= 0 || !(cellWidth > 0)) return 0;
  return Math.round(chars * cellWidth) + GUTTER_RULE_GAP_PX;
}

/** Motty: number % 1_000_000, right-aligned by the painter. */
export function formatGutterLineNumber(lineNumber: number): string {
  const n = Math.max(0, Math.floor(lineNumber)) % 1_000_000;
  return String(n);
}

/** Motty AppendFormat "15:04:05"; writtenSec 0 → empty. */
export function formatGutterTime(writtenSec: number, timeZone?: string): string {
  if (!writtenSec) return "";
  const date = new Date(writtenSec * 1000);
  if (!Number.isFinite(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone,
    }).format(date);
  } catch {
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    const ss = String(date.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }
}

export type GutterRowModel = {
  /** Viewport row index 0..rows-1. */
  row: number;
  lineNumber: string;
  time: string;
};

export type BuildGutterRowsInput = {
  mode: TerminalGutterMode;
  rows: number;
  /** Absolute buffer Y of the top visible row (`buffer.viewportY`). */
  viewportY: number;
  /** Lookup write-time unix seconds for absolute buffer line Y. */
  writtenAt: (absoluteY: number) => number;
  /** Alternate screen: keep width, paint blank (Motty). */
  alternate: boolean;
  /** Password / sensitive: hide labels (Motty). */
  sensitive?: boolean;
};

export function buildGutterRows(input: BuildGutterRowsInput): GutterRowModel[] {
  const out: GutterRowModel[] = [];
  const blank = input.alternate || input.sensitive || input.mode === "off";
  const numbers = !blank && gutterShowsNumbers(input.mode);
  const times = !blank && gutterShowsTimes(input.mode);
  const rows = Math.max(0, Math.floor(input.rows));
  for (let row = 0; row < rows; row += 1) {
    const absoluteY = input.viewportY + row;
    // Motty line numbers are 1-based document lines.
    const lineNumber = numbers ? formatGutterLineNumber(absoluteY + 1) : "";
    const time = times ? formatGutterTime(input.writtenAt(absoluteY)) : "";
    out.push({ row, lineNumber, time });
  }
  return out;
}

/**
 * Tracks wall-clock write times per absolute buffer line Y.
 * Motty: repainting a line in place moves its time forward.
 */
export class GutterStampTracker {
  private readonly stamps = new Map<number, number>();
  private lastCursorAbsY = 0;

  clear(): void {
    this.stamps.clear();
    this.lastCursorAbsY = 0;
  }

  get(absoluteY: number): number {
    return this.stamps.get(absoluteY) ?? 0;
  }

  /**
   * After a PTY write settles, stamp every line from the previous cursor
   * through the new cursor (covers multi-line bursts in one parse).
   */
  stampWrite(absoluteCursorY: number, nowSec: number = Math.floor(Date.now() / 1000)): void {
    const end = Math.max(0, Math.floor(absoluteCursorY));
    const start = Math.min(this.lastCursorAbsY, end);
    for (let y = start; y <= end; y += 1) {
      this.stamps.set(y, nowSec);
    }
    this.lastCursorAbsY = end;
  }

  /** Drop stamps that scrolled out of the retained buffer. */
  pruneBelow(minAbsoluteY: number): void {
    const min = Math.floor(minAbsoluteY);
    for (const key of this.stamps.keys()) {
      if (key < min) this.stamps.delete(key);
    }
  }
}

/** Measure cell size from an opened xterm host (screen box / cols×rows). */
export function measureTerminalCellSize(
  host: HTMLElement,
  cols: number,
  rows: number,
): { cellWidth: number; cellHeight: number } | null {
  if (cols <= 0 || rows <= 0) return null;
  const screen = host.querySelector(".xterm-screen") as HTMLElement | null;
  const box = screen ?? (host.querySelector(".xterm") as HTMLElement | null);
  if (!box) return null;
  const width = box.clientWidth;
  const height = box.clientHeight;
  if (!(width > 0) || !(height > 0)) return null;
  return { cellWidth: width / cols, cellHeight: height / rows };
}

/** Apply models into a gutter element (one row per child). */
export function paintGutterElement(
  el: HTMLElement,
  rows: readonly GutterRowModel[],
  metrics: { cellHeight: number; showNumbers: boolean; showTimes: boolean },
): void {
  el.style.setProperty("--ssh-gutter-row-height", `${metrics.cellHeight}px`);
  el.dataset.showNumbers = metrics.showNumbers ? "1" : "0";
  el.dataset.showTimes = metrics.showTimes ? "1" : "0";
  const needed = rows.length;
  while (el.childElementCount > needed) {
    el.lastElementChild?.remove();
  }
  while (el.childElementCount < needed) {
    const row = document.createElement("div");
    row.className = "terminal-gutter-row";
    const num = document.createElement("span");
    num.className = "terminal-gutter-num";
    const time = document.createElement("span");
    time.className = "terminal-gutter-time";
    row.append(num, time);
    el.append(row);
  }
  for (let i = 0; i < needed; i += 1) {
    const model = rows[i]!;
    const rowEl = el.children[i] as HTMLElement;
    const num = rowEl.querySelector(".terminal-gutter-num") as HTMLElement | null;
    const time = rowEl.querySelector(".terminal-gutter-time") as HTMLElement | null;
    if (num) num.textContent = model.lineNumber;
    if (time) time.textContent = model.time;
  }
}
