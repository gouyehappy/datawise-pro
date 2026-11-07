import { describe, expect, it } from "vitest";
import {
  drainThinkTags,
  mergeThinking,
  stripOpenThinkTail,
  stripThinkTags,
} from "./thinking";

describe("stripThinkTags", () => {
  it("moves closed think blocks into thinking", () => {
    const { content, thinking } = stripThinkTags(
      "<think>plan step</think>\nHello world",
    );
    expect(thinking).toBe("plan step");
    expect(content).toBe("Hello world");
  });

  it("supports thinking tags case-insensitively", () => {
    const { content, thinking } = stripThinkTags(
      "<Thinking>why</Thinking>Answer",
    );
    expect(thinking).toBe("why");
    expect(content).toBe("Answer");
  });

  it("joins multiple blocks", () => {
    const { content, thinking } = stripThinkTags(
      "<think>a</think>mid<think>b</think>end",
    );
    expect(thinking).toBe("a\n\nb");
    expect(content).toBe("midend");
  });

  it("leaves unclosed tags for the open-tail stripper", () => {
    const raw = "Hi <think>still going";
    const { content, thinking } = stripThinkTags(raw);
    expect(thinking).toBe("");
    expect(content).toBe(raw.trim());
  });
});

describe("stripOpenThinkTail", () => {
  it("hides trailing unclosed think", () => {
    expect(stripOpenThinkTail("Visible <think>secret")).toBe("Visible");
  });
});

describe("drainThinkTags", () => {
  it("moves open think tails into thinking for storage", () => {
    const { content, thinking } = drainThinkTags("Visible <think>secret plan");
    expect(content).toBe("Visible");
    expect(thinking).toBe("secret plan");
  });
});

describe("mergeThinking", () => {
  it("appends distinct chunks", () => {
    expect(mergeThinking("a", "b")).toBe("a\n\nb");
  });

  it("skips duplicate substring", () => {
    expect(mergeThinking("full thought", "thought")).toBe("full thought");
  });
});
