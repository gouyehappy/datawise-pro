import { describe, expect, it } from "vitest";
import { clearXtermScrollback, terminalHasScrollback } from "./terminalScrollback";

function fakeTerm(init: {
  rows: number;
  baseY: number;
  length: number;
  scrollback: number;
}) {
  let scrollback = init.scrollback;
  const options = {
    get scrollback() {
      return scrollback;
    },
    set scrollback(value: number) {
      scrollback = value;
      if (value === 0) {
        // Mimic xterm: trimming to viewport-only buffer.
        state.baseY = 0;
        state.length = init.rows;
      }
    },
  };
  const state = { baseY: init.baseY, length: init.length };
  return {
    rows: init.rows,
    options,
    buffer: { active: state },
    clearSelectionCalls: 0,
    clearSelection() {
      this.clearSelectionCalls += 1;
    },
    getScrollback() {
      return scrollback;
    },
  };
}

describe("terminalHasScrollback", () => {
  it("is false when the buffer is only the viewport", () => {
    expect(terminalHasScrollback(fakeTerm({ rows: 24, baseY: 0, length: 24, scrollback: 5000 }))).toBe(false);
  });

  it("is true when baseY or length exceeds the viewport", () => {
    expect(terminalHasScrollback(fakeTerm({ rows: 24, baseY: 10, length: 34, scrollback: 5000 }))).toBe(true);
    expect(terminalHasScrollback(fakeTerm({ rows: 24, baseY: 0, length: 40, scrollback: 5000 }))).toBe(true);
  });
});

describe("clearXtermScrollback", () => {
  it("trims history then restores the scrollback budget", () => {
    const term = fakeTerm({ rows: 24, baseY: 100, length: 124, scrollback: 5000 });
    expect(terminalHasScrollback(term)).toBe(true);
    clearXtermScrollback(term, 5000);
    expect(term.buffer.active.baseY).toBe(0);
    expect(term.getScrollback()).toBe(5000);
    expect(term.clearSelectionCalls).toBe(1);
    expect(terminalHasScrollback(term)).toBe(false);
  });
});
