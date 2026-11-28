import { describe, expect, it } from "vitest";
import {
  bgStrengthVisuals,
  sanitizeTerminalBgImagePrefs,
} from "./terminalBgImage";

describe("terminalBgImage", () => {
  it("sanitizes prefs and rejects oversized / non-image data URLs", () => {
    const dataUrl = `data:image/jpeg;base64,${"A".repeat(40)}`;
    expect(sanitizeTerminalBgImagePrefs({
      dataUrl,
      name: " wall.jpg ",
      strength: "strong",
    })).toEqual({
      dataUrl,
      name: "wall.jpg",
      strength: "strong",
    });
    expect(sanitizeTerminalBgImagePrefs({ dataUrl: "https://x", name: "a" }).dataUrl).toBeNull();
    expect(sanitizeTerminalBgImagePrefs({ dataUrl: "data:image/png;base64," }).dataUrl).toBeNull();
  });

  it("maps Motty-like strength to opacities", () => {
    expect(bgStrengthVisuals("subtle").terminalBgAlpha).toBeGreaterThan(bgStrengthVisuals("strong").terminalBgAlpha);
    expect(bgStrengthVisuals("strong").imageOpacity).toBeGreaterThan(bgStrengthVisuals("subtle").imageOpacity);
  });
});
