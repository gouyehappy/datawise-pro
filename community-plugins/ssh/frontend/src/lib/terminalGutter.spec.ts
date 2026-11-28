import { describe, expect, it } from "vitest";
import {
  buildGutterRows,
  formatGutterLineNumber,
  formatGutterTime,
  gutterTextChars,
  gutterWidthPx,
  GutterStampTracker,
  sanitizeGutterMode,
} from "./terminalGutter";

describe("terminalGutter", () => {
  it("sanitizes mode and reports Motty cell widths", () => {
    expect(sanitizeGutterMode("both")).toBe("both");
    expect(sanitizeGutterMode("nope")).toBe("off");
    expect(gutterTextChars("off")).toBe(0);
    expect(gutterTextChars("numbers")).toBe(6);
    expect(gutterTextChars("time")).toBe(8);
    expect(gutterTextChars("both")).toBe(15);
    expect(gutterWidthPx("numbers", 10)).toBe(6 * 10 + 12);
  });

  it("formats line numbers and times like Motty", () => {
    expect(formatGutterLineNumber(42)).toBe("42");
    expect(formatGutterLineNumber(1_000_042)).toBe("42");
    expect(formatGutterTime(0)).toBe("");
    // UTC so the assertion is stable in any local TZ.
    expect(formatGutterTime(Date.UTC(2026, 10, 25, 7, 8, 9) / 1000, "UTC")).toBe("07:08:09");
  });

  it("builds blank rows on alternate/sensitive and stamps write ranges", () => {
    const stamps = new Map<number, number>([[10, 100], [11, 200]]);
    const normal = buildGutterRows({
      mode: "both",
      rows: 2,
      viewportY: 10,
      writtenAt: (y) => stamps.get(y) ?? 0,
      alternate: false,
    });
    expect(normal[0]?.lineNumber).toBe("11");
    expect(normal[1]?.lineNumber).toBe("12");

    const alt = buildGutterRows({
      mode: "both",
      rows: 2,
      viewportY: 10,
      writtenAt: () => 1,
      alternate: true,
    });
    expect(alt.every((row) => row.lineNumber === "" && row.time === "")).toBe(true);

    const tracker = new GutterStampTracker();
    tracker.stampWrite(5, 1000);
    tracker.stampWrite(7, 2000);
    expect(tracker.get(5)).toBe(2000);
    expect(tracker.get(6)).toBe(2000);
    expect(tracker.get(7)).toBe(2000);
    tracker.pruneBelow(6);
    expect(tracker.get(5)).toBe(0);
    expect(tracker.get(6)).toBe(2000);
  });
});
