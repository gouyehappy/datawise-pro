import { describe, expect, it } from "vitest";
import { isArgsCompletionPhase, resolveCompletionOwner } from "./completionArbitration";

describe("isArgsCompletionPhase", () => {
  it("is false for empty or single-token input", () => {
    expect(isArgsCompletionPhase("")).toBe(false);
    expect(isArgsCompletionPhase("git")).toBe(false);
    expect(isArgsCompletionPhase("  curl")).toBe(false);
  });

  it("is true once a space separates args/flags", () => {
    expect(isArgsCompletionPhase("git ")).toBe(true);
    expect(isArgsCompletionPhase("git status")).toBe(true);
    expect(isArgsCompletionPhase("curl -v https://x")).toBe(true);
  });
});

describe("resolveCompletionOwner", () => {
  it("gives first token to line suggest when both are on", () => {
    expect(resolveCompletionOwner({ typedLine: "gi", figEnabled: true, lineEnabled: true })).toBe("line");
  });

  it("gives args phase to fig when fig is on", () => {
    expect(resolveCompletionOwner({ typedLine: "git ", figEnabled: true, lineEnabled: true })).toBe("fig");
    expect(resolveCompletionOwner({ typedLine: "git checkout ", figEnabled: true, lineEnabled: true })).toBe("fig");
  });

  it("falls back to the remaining layer when one pref is off", () => {
    expect(resolveCompletionOwner({ typedLine: "git ", figEnabled: false, lineEnabled: true })).toBe("line");
    expect(resolveCompletionOwner({ typedLine: "gi", figEnabled: true, lineEnabled: false })).toBe("fig");
    expect(resolveCompletionOwner({ typedLine: "gi", figEnabled: false, lineEnabled: false })).toBe("none");
  });
});
