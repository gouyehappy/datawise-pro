import { describe, expect, it } from "vitest";
import { clampCopilotDockWidth, COPILOT_DOCK_WIDTH } from "./dockWidth";

describe("clampCopilotDockWidth", () => {
  it("clamps to kit defaults", () => {
    expect(clampCopilotDockWidth(100)).toBe(COPILOT_DOCK_WIDTH.min);
    expect(clampCopilotDockWidth(9999)).toBe(COPILOT_DOCK_WIDTH.max);
    expect(clampCopilotDockWidth(450)).toBe(450);
  });

  it("honors custom bounds", () => {
    expect(clampCopilotDockWidth(200, { min: 250, max: 500, default: 300 })).toBe(250);
  });
});
