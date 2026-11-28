import { describe, expect, it } from "vitest";
import {
  DEFAULT_FIND_PREFS,
  DEFAULT_TERMINAL_SESSION_PREFS,
  DEFAULT_WORD_SEPARATORS,
  effectiveWordSeparators,
  mergeTerminalSessionPrefs,
  sanitizeFindOrigin,
  sanitizeFindPrefs,
  sanitizeOsc52Policy,
  sanitizeScrollback,
  sanitizeTabTitleMode,
  sanitizeTerminalSessionPrefs,
  sanitizeWordSeparators,
  seedTerminalFindOrigin,
} from "./terminalSessionPrefs";

describe("terminalSessionPrefs sanitize", () => {
  it("keeps allow as the OSC 52 default for upgrade compatibility", () => {
    expect(sanitizeOsc52Policy(undefined)).toBe("allow");
    expect(sanitizeOsc52Policy("block")).toBe("block");
    expect(sanitizeOsc52Policy("ask")).toBe("ask");
    expect(sanitizeOsc52Policy("nope")).toBe("allow");
  });

  it("accepts Motty-style scrollback budgets; invalid falls back to Motty 5k default", () => {
    expect(sanitizeScrollback(1000)).toBe(1000);
    expect(sanitizeScrollback(5000)).toBe(5000);
    expect(sanitizeScrollback(10000)).toBe(10000);
    expect(sanitizeScrollback(15000)).toBe(15000);
    expect(sanitizeScrollback(999)).toBe(5000);
    expect(sanitizeScrollback("5000")).toBe(5000);
    expect(DEFAULT_TERMINAL_SESSION_PREFS.scrollback).toBe(5000);
  });

  it("treats empty wordSeparators as xterm default at apply time", () => {
    expect(sanitizeWordSeparators("")).toBe("");
    expect(sanitizeWordSeparators("-/.")).toBe("-/.");
    expect(sanitizeWordSeparators("a\u0000b")).toBe("ab");
    expect(effectiveWordSeparators({ wordSeparators: "" })).toBe(DEFAULT_WORD_SEPARATORS);
    expect(effectiveWordSeparators({ wordSeparators: "-/" })).toBe("-/");
  });

  it("sanitizes a full prefs object and merges patches", () => {
    const prefs = sanitizeTerminalSessionPrefs({
      osc52Policy: "ask",
      scrollback: 5000,
      wordSeparators: " /",
      tabTitleMode: "directory",
      showLatency: true,
      bellEnabled: true,
      closeSessionConfirm: false,
    });
    expect(prefs.osc52Policy).toBe("ask");
    expect(prefs.scrollback).toBe(5000);
    expect(prefs.tabTitleMode).toBe("directory");
    expect(prefs.showLatency).toBe(true);
    expect(prefs.closeSessionConfirm).toBe(false);
    expect(prefs.closeWorkbenchConfirm).toBe(true);

    expect(mergeTerminalSessionPrefs(DEFAULT_TERMINAL_SESSION_PREFS, { osc52Policy: "block" }).osc52Policy).toBe("block");
  });

  it("falls back tab title mode", () => {
    expect(sanitizeTabTitleMode("terminal")).toBe("terminal");
    expect(sanitizeTabTitleMode("weird")).toBe("connection");
  });

  it("defaults find origin to view_bottom and seeds SearchAddon direction", () => {
    expect(sanitizeFindOrigin(undefined)).toBe("view_bottom");
    expect(sanitizeFindOrigin("session_top")).toBe("session_top");
    expect(sanitizeFindOrigin("nope")).toBe("view_bottom");
    expect(sanitizeFindPrefs({ foreground: "#111111", background: "#222222", opacity: 50 }).origin).toBe(
      DEFAULT_FIND_PREFS.origin,
    );

    const picks: Array<{ col: number; row: number; length: number }> = [];
    const term = {
      cols: 80,
      rows: 24,
      buffer: { active: { baseY: 100, viewportY: 90 } },
      select(column: number, row: number, length: number) {
        picks.push({ col: column, row, length });
      },
    };
    expect(seedTerminalFindOrigin(term, "session_top")).toBe("next");
    expect(picks.at(-1)).toEqual({ col: 0, row: 0, length: 1 });
    expect(seedTerminalFindOrigin(term, "session_bottom")).toBe("prev");
    expect(picks.at(-1)).toEqual({ col: 79, row: 123, length: 1 });
    expect(seedTerminalFindOrigin(term, "view_top")).toBe("next");
    expect(picks.at(-1)).toEqual({ col: 0, row: 90, length: 1 });
    expect(seedTerminalFindOrigin(term, "view_bottom")).toBe("prev");
    expect(picks.at(-1)).toEqual({ col: 79, row: 113, length: 1 });
  });
});
