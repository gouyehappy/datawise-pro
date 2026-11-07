/** Re-export portable types; SSH adapter may narrow intents at call sites. */
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
} from "@datawise/community-copilot-kit";
