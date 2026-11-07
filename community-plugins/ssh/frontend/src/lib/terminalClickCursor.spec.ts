// @vitest-environment happy-dom
// resolveClickCursorMove 单测：点击定位光标（iTerm2 风格）的纯几何计算——
// 只允许在光标所在逻辑行内移动，换算成左右方向键次数，其余情形一律不动。
import { describe, expect, it } from "vitest";
import {
  CLICK_CURSOR_MAX_MOVES,
  cellFromMouseEvent,
  clickCursorArrows,
  logicalLineSpan,
  resolveClickCursorMove,
  type ActiveBufferLike,
  type BufferLineLike,
} from "./terminalClickCursor";

/**
 * 用「单元宽度数组」伪造一行：1 = 半角字符，2 = 宽字符起始，0 = 宽字符后半格。
 * 行长即单元数，isWrapped 描述是否从上一行折行而来。
 * chars 缺省时：width>0 视为已写内容 "x"（兼容旧用例）；显式 "" 表示空白垫格。
 */
function fakeLine(widths: number[], isWrapped = false, chars?: Array<string | undefined>): BufferLineLike {
  return {
    length: widths.length,
    isWrapped,
    getCell(col: number) {
      const width = widths[col];
      if (width === undefined) return undefined;
      const explicit = chars?.[col];
      const text = explicit !== undefined ? explicit : width > 0 ? "x" : "";
      return { getWidth: () => width, getChars: () => text };
    },
  };
}

interface FakeRow {
  widths: number[];
  isWrapped?: boolean;
  /** Per-cell getChars(); omit / undefined → width>0 默认 "x"。 */
  chars?: Array<string | undefined>;
}

interface FakeBufferOptions {
  cols?: number;
  viewportY?: number;
  cursorX?: number;
  cursorY?: number;
  type?: "normal" | "alternate";
  /** 每行按缓冲绝对顺序给出；未给到的行视为不存在。 */
  rows?: FakeRow[];
}

function fakeBuffer(options: FakeBufferOptions): ActiveBufferLike {
  const rows = options.rows ?? [];
  const cols = options.cols ?? 80;
  return {
    type: options.type ?? "normal",
    viewportY: options.viewportY ?? 0,
    cursorX: options.cursorX ?? 0,
    cursorY: options.cursorY ?? 0,
    getLine(row: number) {
      const line = rows[row];
      if (!line) return undefined;
      return fakeLine(line.widths, line.isWrapped ?? false, line.chars);
    },
  } satisfies ActiveBufferLike;
}

describe("logicalLineSpan", () => {
  it("keeps a standalone line to itself", () => {
    const buffer = fakeBuffer({ rows: [{ widths: [1] }, { widths: [1] }, { widths: [1] }] });
    expect(logicalLineSpan(buffer, 1)).toEqual({ top: 1, bottom: 1 });
  });

  it("expands across wrapped continuation lines in both directions", () => {
    // 行 1 折行出续行 2、3（isWrapped 标在续行上）。
    const buffer = fakeBuffer({
      rows: [{ widths: [1] }, { widths: [1, 1] }, { widths: [1], isWrapped: true }, { widths: [1], isWrapped: true }],
    });
    expect(logicalLineSpan(buffer, 2)).toEqual({ top: 1, bottom: 3 });
    expect(logicalLineSpan(buffer, 3)).toEqual({ top: 1, bottom: 3 });
  });
});

describe("resolveClickCursorMove", () => {
  it("moves left when clicking before the cursor on the same line", () => {
    const buffer = fakeBuffer({ cols: 20, cursorX: 18, cursorY: 0, rows: [{ widths: Array(18).fill(1) }] });
    expect(resolveClickCursorMove({ buffer, cols: 20, click: { col: 14, row: 0 } })).toEqual({ direction: "left", count: 4 });
  });

  it("moves right when clicking after the cursor", () => {
    const buffer = fakeBuffer({ cols: 20, cursorX: 5, cursorY: 0, rows: [{ widths: Array(18).fill(1) }] });
    expect(resolveClickCursorMove({ buffer, cols: 20, click: { col: 9, row: 0 } })).toEqual({ direction: "right", count: 4 });
  });

  it("treats a wide char as one character despite occupying two cells", () => {
    // `目录` 两个宽字符占 4 格，再跟 4 个半角；光标在行尾（第 6 字符），点击行首。
    const buffer = fakeBuffer({ cols: 10, cursorX: 8, cursorY: 0, rows: [{ widths: [2, 0, 2, 0, 1, 1, 1, 1] }] });
    expect(resolveClickCursorMove({ buffer, cols: 10, click: { col: 1, row: 0 } })).toEqual({ direction: "left", count: 5 });
  });

  it("computes distance across wrapped lines of the same logical line", () => {
    // 行 0 满 10 格，行 1 为续行：点击行 1 col 3、光标在行 0 col 8。
    const buffer = fakeBuffer({
      cols: 10,
      cursorX: 8,
      cursorY: 0,
      rows: [{ widths: Array(10).fill(1) }, { widths: Array(10).fill(1), isWrapped: true }],
    });
    expect(resolveClickCursorMove({ buffer, cols: 10, click: { col: 3, row: 1 } })).toEqual({ direction: "right", count: 5 });
  });

  it("does nothing for clicks outside the cursor's logical line", () => {
    const buffer = fakeBuffer({
      cols: 20,
      cursorX: 10,
      cursorY: 2,
      rows: [{ widths: Array(10).fill(1) }, { widths: Array(10).fill(1) }, { widths: Array(20).fill(1) }],
    });
    expect(resolveClickCursorMove({ buffer, cols: 20, click: { col: 3, row: 0 } })).toBeNull();
  });

  it("does nothing when the click lands exactly on the cursor", () => {
    const buffer = fakeBuffer({ cols: 20, cursorX: 10, cursorY: 0, rows: [{ widths: Array(20).fill(1) }] });
    expect(resolveClickCursorMove({ buffer, cols: 20, click: { col: 10, row: 0 } })).toBeNull();
  });

  it("does nothing on the alternate screen (full-screen TUI apps)", () => {
    const buffer = fakeBuffer({ cols: 20, cursorX: 10, cursorY: 0, type: "alternate", rows: [{ widths: Array(20).fill(1) }] });
    expect(resolveClickCursorMove({ buffer, cols: 20, click: { col: 2, row: 0 } })).toBeNull();
  });

  it("accounts for scrollback offset when mapping viewport rows", () => {
    // viewportY = 2：视口第 1 行 = 缓冲第 3 行（光标行）；点击视口第 0 行（上方输出行）不动，
    // 点击视口第 1 行照常移动。
    const buffer = fakeBuffer({
      cols: 20,
      viewportY: 2,
      cursorX: 10,
      cursorY: 1,
      rows: [{ widths: Array(10).fill(1) }, { widths: Array(10).fill(1) }, { widths: Array(10).fill(1) }, { widths: Array(20).fill(1) }],
    });
    expect(resolveClickCursorMove({ buffer, cols: 20, click: { col: 3, row: 0 } })).toBeNull();
    expect(resolveClickCursorMove({ buffer, cols: 20, click: { col: 3, row: 1 } })).toEqual({ direction: "left", count: 7 });
  });

  it("clamps the synthesized key count to a sane bound", () => {
    const widths = Array.from({ length: CLICK_CURSOR_MAX_MOVES + 50 }, () => 1);
    const buffer = fakeBuffer({ cols: widths.length, cursorX: widths.length, cursorY: 0, rows: [{ widths }] });
    const move = resolveClickCursorMove({ buffer, cols: widths.length, click: { col: 0, row: 0 } });
    expect(move).toEqual({ direction: "left", count: CLICK_CURSOR_MAX_MOVES });
  });

  it("does nothing when clicking blank padding past real content (avoids [C[C[C flood)", () => {
    // Prompt/input only fills cols 0–6; cols 7–19 are never-written blanks.
    // Cursor sits at content end (col 7). Click far right must not emit arrows.
    const widths = Array(20).fill(1) as number[];
    const chars = Array.from({ length: 20 }, (_, i) => (i < 7 ? "x" : ""));
    const buffer = fakeBuffer({ cols: 20, cursorX: 7, cursorY: 0, rows: [{ widths, chars }] });
    expect(resolveClickCursorMove({ buffer, cols: 20, click: { col: 18, row: 0 } })).toBeNull();
  });

  it("moves right only up to content end, not into blank padding", () => {
    // "hello" in cols 0–4, cursor at col 2 ("l"), blanks after col 5.
    const widths = Array(20).fill(1) as number[];
    const chars = Array.from({ length: 20 }, (_, i) => (i < 5 ? "x" : ""));
    const buffer = fakeBuffer({ cols: 20, cursorX: 2, cursorY: 0, rows: [{ widths, chars }] });
    expect(resolveClickCursorMove({ buffer, cols: 20, click: { col: 15, row: 0 } })).toEqual({
      direction: "right",
      count: 3,
    });
  });

  it("treats typed spaces as content so trailing spaces remain clickable", () => {
    // "hi" + two typed spaces; cursor after "hi"; click on the second space.
    const widths = [1, 1, 1, 1, 1, 1];
    const chars = ["h", "i", " ", " ", "", ""];
    const buffer = fakeBuffer({ cols: 6, cursorX: 2, cursorY: 0, rows: [{ widths, chars }] });
    expect(resolveClickCursorMove({ buffer, cols: 6, click: { col: 3, row: 0 } })).toEqual({
      direction: "right",
      count: 1,
    });
  });
});

describe("clickCursorArrows", () => {
  it("emits repeated CSI arrows for readline", () => {
    expect(clickCursorArrows({ direction: "left", count: 3 })).toBe("\u001b[D\u001b[D\u001b[D");
    expect(clickCursorArrows({ direction: "right", count: 1 })).toBe("\u001b[C");
    expect(clickCursorArrows({ direction: "left", count: 0 })).toBe("");
  });
});

describe("cellFromMouseEvent", () => {
  function hostWithScreen(rect: { left: number; top: number; width: number; height: number }): HTMLElement {
    const host = document.createElement("div");
    const screen = document.createElement("div");
    screen.className = "xterm-screen";
    Object.defineProperty(screen, "getBoundingClientRect", { value: () => rect });
    host.appendChild(screen);
    return host;
  }

  it("maps client coordinates through the screen rect to cells", () => {
    const host = hostWithScreen({ left: 10, top: 20, width: 200, height: 100 });
    // 200px / 20 列 = 10px/列；100px / 5 行 = 20px/行。
    expect(cellFromMouseEvent(host, { cols: 20, rows: 5 }, 35, 61)).toEqual({ col: 2, row: 2 });
  });

  it("rejects coordinates below the grid and degenerate rects", () => {
    const host = hostWithScreen({ left: 10, top: 20, width: 200, height: 100 });
    expect(cellFromMouseEvent(host, { cols: 20, rows: 5 }, 35, 999)).toBeNull();
    const empty = hostWithScreen({ left: 0, top: 0, width: 0, height: 0 });
    expect(cellFromMouseEvent(empty, { cols: 20, rows: 5 }, 35, 61)).toBeNull();
  });
});
