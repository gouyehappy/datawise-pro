import type { CopilotDockWidthBounds } from "./dockWidth";
import { COPILOT_DOCK_WIDTH } from "./dockWidth";
import type { ActionCard, ActionCardRisk, CopilotChatMode, CopilotIntent, SessionContext } from "./types";

/**
 * Plugin BYOK chat RPC names. Each plugin owns its vault methods;
 * the kit never hardcodes `ssh/…` (or any other plugin id).
 */
export type PluginLlmRpc = {
  /** e.g. `ssh/copilot/llm/status` */
  status: string;
  /** e.g. `ssh/copilot/chat` */
  chat: string;
  /** e.g. `ssh/copilot/chat/cancel` */
  cancel: string;
};

/** Policy used when parsing LLM action-card JSON. */
export type CardPolicy = {
  isToolAllowed: (tool: string) => boolean;
  toolRisk: (tool: string, args?: Record<string, unknown>) => ActionCardRisk;
};

/**
 * Target-specific wiring for a session copilot.
 * Put prompts / tools / context here — keep the kit free of plugin RPCs.
 */
export type CopilotAdapter = {
  /** Stable id for diagnostics (e.g. `ssh`, `git`). */
  id: string;
  /** Quick-intent chips shown in the dock. */
  intents: CopilotIntent[];
  /** BYOK sidecar methods for this plugin. */
  llm: PluginLlmRpc;
  /** Stream event from the plugin sidecar (not host.ai). */
  pluginDeltaEvent?: string;
  /** Host AI stream event name (default `host.ai.chat.delta`). */
  hostDeltaEvent?: string;
  /** Confirm / approve RPC for risky cards (plugin-specific). */
  confirmRpc?: string;
  /** Dock resize bounds (defaults from {@link COPILOT_DOCK_WIDTH}). */
  dockWidth?: Partial<CopilotDockWidthBounds>;
  /** Max automatic tool→LLM follow-up turns after a card run. */
  followUpMaxDepth?: number;
  cardPolicy: CardPolicy;
  /** Optional `locale` drives reply-language instructions in the system prompt. */
  systemPrompt: (mode: CopilotChatMode, ctx?: { locale?: string }) => string;
  buildDefaultCards?: (intent: CopilotIntent, ctx: SessionContext) => ActionCard[];
};

export function resolveDockWidthBounds(
  adapter?: Pick<CopilotAdapter, "dockWidth"> | null,
): CopilotDockWidthBounds {
  return {
    min: adapter?.dockWidth?.min ?? COPILOT_DOCK_WIDTH.min,
    max: adapter?.dockWidth?.max ?? COPILOT_DOCK_WIDTH.max,
    default: adapter?.dockWidth?.default ?? COPILOT_DOCK_WIDTH.default,
  };
}
