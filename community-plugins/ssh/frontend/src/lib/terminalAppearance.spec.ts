import { describe, expect, it } from "vitest";
import {
  composeFontFamilyStack,
  cursorThicknessCss,
  intenseToTerminalOptions,
  sanitizeCursorThickness,
  sanitizeFontFallbacks,
  sanitizeIntenseMode,
} from "./terminalAppearance";

describe("terminalAppearance Motty display helpers", () => {
  it("maps intense modes onto xterm bold/bright options", () => {
    expect(intenseToTerminalOptions("bright", { fontWeight: 400, fontWeightBold: 700 })).toEqual({
      drawBoldTextInBrightColors: true,
      fontWeightBold: 400,
    });
    expect(intenseToTerminalOptions("bold", { fontWeight: 400, fontWeightBold: 700 })).toEqual({
      drawBoldTextInBrightColors: false,
      fontWeightBold: 700,
    });
    expect(intenseToTerminalOptions("plain", { fontWeight: null, fontWeightBold: null })).toEqual({
      drawBoldTextInBrightColors: false,
      fontWeightBold: 400,
    });
    expect(intenseToTerminalOptions("both", { fontWeight: null, fontWeightBold: null })).toEqual({
      drawBoldTextInBrightColors: true,
      fontWeightBold: 700,
    });
  });

  it("sanitizes intense/thickness/fallbacks with legacy boolean fallback", () => {
    expect(sanitizeIntenseMode("plain")).toBe("plain");
    expect(sanitizeIntenseMode(undefined, true)).toBe("both");
    expect(sanitizeIntenseMode(undefined, false)).toBe("bold");
    expect(sanitizeCursorThickness("thick")).toBe("thick");
    expect(sanitizeCursorThickness("nope")).toBe("normal");
    expect(cursorThicknessCss("thin")).toBe("1px");
    expect(cursorThicknessCss("thick")).toBe("3px");
    expect(sanitizeFontFallbacks([' Consolas ', 'Consolas', 'evil;"', "monospace", 7])).toEqual(["Consolas", "evil"]);
  });

  it("composes a CSS font-family stack with monospace tail", () => {
    expect(composeFontFamilyStack("Cascadia Mono", ["Sarasa Mono SC"])).toBe(
      '"Cascadia Mono", "Sarasa Mono SC", monospace',
    );
  });
});
