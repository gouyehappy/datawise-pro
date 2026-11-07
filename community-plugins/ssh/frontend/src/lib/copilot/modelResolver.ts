import { createModelRouter } from "@datawise/community-copilot-kit";
import { SSH_COPILOT_LLM } from "../../copilot/adapter";

export {
  EMPTY_LLM_RESPONSE,
  createHostAiFromPlugin,
  normalizeModelPreference,
  pluginProfileIdFromPreference,
  formatAttachmentsForPrompt,
  type ResolveResult,
  type RpcFn,
  type HostAiApi,
  type PluginModelProfile,
  type ModelOption,
  type ChatResolvedOpts,
} from "@datawise/community-copilot-kit";

const router = createModelRouter({ ...SSH_COPILOT_LLM });

export const probeModels = router.probeModels;
export const buildModelOptions = router.buildModelOptions;
export const resolveModel = router.resolveModel;
export const chatWithResolvedModel = router.chatWithResolvedModel;
export const cancelResolvedChat = router.cancelResolvedChat;
