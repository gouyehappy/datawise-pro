import { mergeThinking, stripThinkTags } from "./thinking";
import type { CopilotMessage, ModelSource } from "./types";

export type StreamDeltaChunk = {
  delta?: string;
  thinkingDelta?: string;
};

/**
 * Append a content/thinking stream chunk onto the last assistant message
 * (or create one). Returns a new array reference for Vue reactivity.
 */
export function appendAssistantStreamDelta(
  messages: CopilotMessage[],
  chunk: StreamDeltaChunk,
  source: ModelSource = "plugin",
): CopilotMessage[] {
  const delta = chunk.delta || "";
  const thinkingDelta = chunk.thinkingDelta || "";
  if (!delta && !thinkingDelta) return messages;

  const next = [...messages];
  let last = next[next.length - 1];
  if (last?.role !== "assistant") {
    last = {
      role: "assistant",
      content: "",
      source: source === "none" ? "plugin" : source,
      cards: [],
    };
    next.push(last);
  }

  if (thinkingDelta) last.thinking = `${last.thinking || ""}${thinkingDelta}`;
  if (delta) {
    last.content = `${last.content || ""}${delta}`;
    const split = stripThinkTags(last.content);
    if (split.thinking) {
      last.thinking = mergeThinking(last.thinking, split.thinking);
      last.content = split.content;
    }
  }
  if (source === "plugin" || source === "host") last.source = source;
  // Defer action cards / refs until stream finalize.
  last.cards = [];
  last.references = undefined;
  return next;
}
