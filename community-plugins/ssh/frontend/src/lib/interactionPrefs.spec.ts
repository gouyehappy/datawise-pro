import { describe, expect, it } from "vitest";
import { clampHistoryLimit, DEFAULT_INTERACTION_PREFS, sanitizeInteractionPrefs } from "./interactionPrefs";

describe("interactionPrefs", () => {
  it("fills defaults and clamps limit", () => {
    expect(sanitizeInteractionPrefs(null)).toEqual(DEFAULT_INTERACTION_PREFS);
    expect(sanitizeInteractionPrefs({ historyEnterRuns: true, historyLimit: 999 }).historyLimit).toBe(200);
    expect(clampHistoryLimit(5)).toBe(20);
    expect(sanitizeInteractionPrefs({ figCompletionEnabled: false }).figCompletionEnabled).toBe(false);
    expect(sanitizeInteractionPrefs({ historyScope: "connection" }).historyScope).toBe("connection");
    expect(sanitizeInteractionPrefs({ historyScope: "other" }).historyScope).toBe("global");
    expect(sanitizeInteractionPrefs({ suggestCompactMode: true }).suggestCompactMode).toBe(true);
    expect(sanitizeInteractionPrefs({}).suggestCompactMode).toBe(false);
  });
});
