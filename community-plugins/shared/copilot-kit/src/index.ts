export type {
  ActionCard,
  ActionCardRisk,
  CopilotAttachment,
  CopilotChatMode,
  CopilotIntent,
  CopilotMessage,
  CopilotReference,
  ModelPreference,
  ModelSource,
  SessionContext,
} from "./types";

export type { CardPolicy, CopilotAdapter, PluginLlmRpc } from "./adapter";
export { resolveDockWidthBounds } from "./adapter";

export {
  stripActionCardJson,
  parseActionCardsFromLlm,
  normalizeCardArgs,
  cardCommand,
} from "./cards";

export {
  COPILOT_DOCK_WIDTH,
  clampCopilotDockWidth,
  type CopilotDockWidthBounds,
} from "./dockWidth";

export { appendAssistantStreamDelta, type StreamDeltaChunk } from "./streamDelta";
export { formatCardUserTurn } from "./cardTurn";
export { looksDestructiveCommand } from "./destructive";
export { composeUserPrompt, type ComposeUserPromptOpts } from "./composePrompt";

export {
  EMPTY_LLM_RESPONSE,
  normalizeCopilotChatMode,
  cardsForChatMode,
  shouldEnsureAgentPresets,
  canRunCopilotCard,
  isEmptyLlmResponseError,
} from "./chatMode";

export {
  createHostAiFromPlugin,
  createModelRouter,
  normalizeModelPreference,
  pluginProfileIdFromPreference,
  formatAttachmentsForPrompt,
  type ResolveResult,
  type RpcFn,
  type HostAiApi,
  type PluginModelProfile,
  type ModelOption,
  type ChatResolvedOpts,
} from "./modelRouter";

export {
  stripThinkTags,
  stripOpenThinkTail,
  drainThinkTags,
  mergeThinking,
  type ThinkSplit,
} from "./thinking";

export { extractUrlReferences } from "./references";

export { finalizeAssistantMessage } from "./finalize";

export {
  normalizeCopilotReplyLanguage,
  resolveReplyLocale,
  replyLanguageInstruction,
  type CopilotReplyLanguage,
} from "./replyLocale";
