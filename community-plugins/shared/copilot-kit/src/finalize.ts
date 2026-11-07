import { extractUrlReferences } from "./references";
import { drainThinkTags, mergeThinking } from "./thinking";
import { stripActionCardJson } from "./cards";
import type { CopilotMessage } from "./types";

/** Strip think tags (incl. open tails), attach URL refs; ready for card parse / display. */
export function finalizeAssistantMessage(msg: CopilotMessage, rawContent: string): void {
  const split = drainThinkTags(rawContent);
  if (split.thinking) msg.thinking = mergeThinking(msg.thinking, split.thinking);
  msg.content = split.content;
  msg.references = extractUrlReferences(stripActionCardJson(msg.content));
}
