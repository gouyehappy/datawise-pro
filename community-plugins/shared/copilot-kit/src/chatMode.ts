import type { CardPolicy } from "./adapter";
import { parseActionCardsFromLlm } from "./cards";
import type { ActionCard, CopilotChatMode } from "./types";

/** Stable error token from model router for empty LLM replies. */
export const EMPTY_LLM_RESPONSE = "EMPTY_LLM_RESPONSE";

export function normalizeCopilotChatMode(value: unknown): CopilotChatMode | null {
  return value === "ask" || value === "agent" ? value : null;
}

/** Ask mode never surfaces runnable cards (even if the model emits JSON). */
export function cardsForChatMode(
  mode: CopilotChatMode,
  content: string,
  fallbackCards: ActionCard[] = [],
  policy: CardPolicy,
): ActionCard[] {
  if (mode === "ask") return [];
  const llmCards = parseActionCardsFromLlm(content, policy);
  return llmCards.length ? llmCards : fallbackCards;
}

/** Opening / enabling Ask must not mutate agent terminal mode or MCP exec presets. */
export function shouldEnsureAgentPresets(mode: CopilotChatMode, enabled: boolean): boolean {
  return enabled && mode === "agent";
}

/** Tool cards only run in Agent mode while the dock is enabled and idle. */
export function canRunCopilotCard(mode: CopilotChatMode, enabled: boolean, busy: boolean): boolean {
  return mode === "agent" && enabled && !busy;
}

export function isEmptyLlmResponseError(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error ?? "");
  return text === EMPTY_LLM_RESPONSE || /empty (plugin|host) LLM response/i.test(text);
}
