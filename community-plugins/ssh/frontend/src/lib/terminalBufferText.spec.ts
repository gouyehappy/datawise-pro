import { describe, expect, it } from "vitest";
import {
  readTerminalBufferText,
  readTerminalRecentText,
  terminalOutputFileName,
  webSearchUrlForSelection,
} from "./terminalBufferText";

function bufferFrom(lines: string[]) {
  return {
    length: lines.length,
    getLine(y: number) {
      const text = lines[y];
      if (text == null) return undefined;
      return { translateToString: () => text };
    },
  };
}

describe("readTerminalBufferText", () => {
  it("joins lines and drops a trailing empty line", () => {
    expect(readTerminalBufferText(bufferFrom(["a", "b", ""]))).toBe("a\nb");
  });
});

describe("readTerminalRecentText", () => {
  it("keeps a trailing window of characters", () => {
    expect(readTerminalRecentText(bufferFrom(["abcdefghij"]), 4)).toBe("ghij");
  });
});

describe("webSearchUrlForSelection", () => {
  it("returns null for blank selection", () => {
    expect(webSearchUrlForSelection("  ")).toBeNull();
  });

  it("builds a google search URL", () => {
    expect(webSearchUrlForSelection("foo bar")).toBe("https://www.google.com/search?q=foo%20bar");
  });
});

describe("terminalOutputFileName", () => {
  it("uses a stable timestamp pattern", () => {
    expect(terminalOutputFileName(new Date("2026-11-26T06:12:00Z"))).toMatch(/^terminal-\d{8}-\d{6}\.txt$/);
  });
});
