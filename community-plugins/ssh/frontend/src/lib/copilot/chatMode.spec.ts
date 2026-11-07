import { describe, expect, it } from "vitest";
import {
  EMPTY_LLM_RESPONSE,
  canRunCopilotCard,
  cardsForChatMode,
  isEmptyLlmResponseError,
  normalizeCopilotChatMode,
  shouldEnsureAgentPresets,
} from "./chatMode";

const sampleCardsJson = `
Here is a plan.
\`\`\`json
{ "cards": [ { "id": "1", "title": "Disk", "tool": "ssh_metrics", "args": {}, "risk": "read" } ] }
\`\`\`
`;

describe("normalizeCopilotChatMode", () => {
  it("accepts ask|agent only", () => {
    expect(normalizeCopilotChatMode("ask")).toBe("ask");
    expect(normalizeCopilotChatMode("agent")).toBe("agent");
    expect(normalizeCopilotChatMode("plan")).toBeNull();
    expect(normalizeCopilotChatMode(1)).toBeNull();
  });
});

describe("cardsForChatMode", () => {
  it("strips cards in ask mode even when JSON is present", () => {
    expect(cardsForChatMode("ask", sampleCardsJson, [{ id: "f", title: "F", tool: "ssh_metrics", args: {}, risk: "read" }])).toEqual([]);
  });

  it("parses LLM cards in agent mode, falling back when absent", () => {
    const parsed = cardsForChatMode("agent", sampleCardsJson);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.tool).toBe("ssh_metrics");
    const fallback = [{ id: "f", title: "F", tool: "ssh_alert_triage", args: {}, risk: "read" as const }];
    expect(cardsForChatMode("agent", "no cards here", fallback)).toEqual(fallback);
  });
});

describe("shouldEnsureAgentPresets / canRunCopilotCard", () => {
  it("only raises presets when enabled Agent", () => {
    expect(shouldEnsureAgentPresets("agent", true)).toBe(true);
    expect(shouldEnsureAgentPresets("ask", true)).toBe(false);
    expect(shouldEnsureAgentPresets("agent", false)).toBe(false);
  });

  it("blocks tool runs in ask / off / busy", () => {
    expect(canRunCopilotCard("agent", true, false)).toBe(true);
    expect(canRunCopilotCard("ask", true, false)).toBe(false);
    expect(canRunCopilotCard("agent", false, false)).toBe(false);
    expect(canRunCopilotCard("agent", true, true)).toBe(false);
  });
});

describe("isEmptyLlmResponseError", () => {
  it("detects stable token and legacy messages", () => {
    expect(isEmptyLlmResponseError(new Error(EMPTY_LLM_RESPONSE))).toBe(true);
    expect(isEmptyLlmResponseError(new Error("empty host LLM response"))).toBe(true);
    expect(isEmptyLlmResponseError(new Error("timeout"))).toBe(false);
  });
});
