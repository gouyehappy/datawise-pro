import {
  cardsForChatMode as cardsForChatModeKit,
  type ActionCard,
  type CopilotChatMode,
} from "@datawise/community-copilot-kit";
import { sshCardPolicy } from "../../copilot/adapter";

export {
  EMPTY_LLM_RESPONSE,
  normalizeCopilotChatMode,
  shouldEnsureAgentPresets,
  canRunCopilotCard,
  isEmptyLlmResponseError,
} from "@datawise/community-copilot-kit";

/** SSH-bound: uses the SSH tool allowlist when parsing agent cards. */
export function cardsForChatMode(
  mode: CopilotChatMode,
  content: string,
  fallbackCards: ActionCard[] = [],
): ActionCard[] {
  return cardsForChatModeKit(mode, content, fallbackCards, sshCardPolicy);
}
