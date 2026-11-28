import { describe, expect, it } from "vitest";
import {
  acceptSuggestionKeyLabel,
  clampHistoryLimit,
  completionModeFromLegacyFlags,
  completionModeShowsList,
  DEFAULT_INTERACTION_PREFS,
  flagsFromCompletionMode,
  sanitizeInteractionPrefs,
  withCompletionMode,
} from "./interactionPrefs";

describe("interactionPrefs", () => {
  it("fills defaults and clamps limit", () => {
    expect(sanitizeInteractionPrefs(null)).toEqual(DEFAULT_INTERACTION_PREFS);
    expect(sanitizeInteractionPrefs({ historyEnterRuns: true, historyLimit: 999 }).historyLimit).toBe(200);
    expect(clampHistoryLimit(5)).toBe(20);
    expect(sanitizeInteractionPrefs({ historyScope: "connection" }).historyScope).toBe("connection");
    expect(sanitizeInteractionPrefs({ historyScope: "other" }).historyScope).toBe("global");
  });

  it("migrates legacy three-boolean prefs into completionMode", () => {
    expect(completionModeFromLegacyFlags({ suggestCompactMode: true })).toBe("inline");
    expect(completionModeFromLegacyFlags({})).toBe("list");
    expect(completionModeFromLegacyFlags({ figCompletionEnabled: false, lineSuggestEnabled: false })).toBe("hotkey");
    expect(sanitizeInteractionPrefs({ suggestCompactMode: true }).completionMode).toBe("inline");
    expect(sanitizeInteractionPrefs({ figCompletionEnabled: false, lineSuggestEnabled: false }).completionMode).toBe("hotkey");
    expect(sanitizeInteractionPrefs({ completionMode: "inline" }).suggestCompactMode).toBe(true);
  });

  it("keeps derived flags in sync with mode", () => {
    expect(flagsFromCompletionMode("list")).toEqual({
      figCompletionEnabled: true,
      lineSuggestEnabled: true,
      suggestCompactMode: false,
    });
    expect(flagsFromCompletionMode("inline").suggestCompactMode).toBe(true);
    const next = withCompletionMode(DEFAULT_INTERACTION_PREFS, "hotkey");
    expect(next.completionMode).toBe("hotkey");
    expect(next.suggestCompactMode).toBe(false);
    expect(next.figCompletionEnabled).toBe(true);
  });

  it("defaults acceptKeyHintEnabled on", () => {
    expect(sanitizeInteractionPrefs({}).acceptKeyHintEnabled).toBe(true);
    expect(sanitizeInteractionPrefs({ acceptKeyHintEnabled: false }).acceptKeyHintEnabled).toBe(false);
  });

  it("only auto-shows the candidate list in list mode", () => {
    expect(completionModeShowsList("list")).toBe(true);
    expect(completionModeShowsList("inline")).toBe(false);
    expect(completionModeShowsList("hotkey")).toBe(false);
  });

  it("sanitizes acceptSuggestionKey and badge labels", () => {
    expect(sanitizeInteractionPrefs({}).acceptSuggestionKey).toBe("arrowRight");
    expect(sanitizeInteractionPrefs({ acceptSuggestionKey: "tab" }).acceptSuggestionKey).toBe("tab");
    expect(sanitizeInteractionPrefs({ acceptSuggestionKey: "nope" }).acceptSuggestionKey).toBe("arrowRight");
    expect(acceptSuggestionKeyLabel("tab")).toBe("Tab");
    expect(acceptSuggestionKeyLabel("shiftArrowRight")).toBe("Shift+→");
    expect(acceptSuggestionKeyLabel("arrowRight")).toBe("→");
  });

  it("defaults the command hint master switch on (no regression for existing users)", () => {
    expect(DEFAULT_INTERACTION_PREFS.commandHintsEnabled).toBe(true);
    expect(sanitizeInteractionPrefs(null).commandHintsEnabled).toBe(true);
    expect(sanitizeInteractionPrefs({}).commandHintsEnabled).toBe(true);
    expect(sanitizeInteractionPrefs({ commandHintsEnabled: false }).commandHintsEnabled).toBe(false);
    // A bad / legacy value must not silently disable the hints.
    expect(sanitizeInteractionPrefs({ commandHintsEnabled: "off" }).commandHintsEnabled).toBe(true);
    // withCompletionMode round-trip must preserve the switch.
    expect(withCompletionMode({ ...DEFAULT_INTERACTION_PREFS, commandHintsEnabled: false }, "inline").commandHintsEnabled).toBe(false);
  });
});
