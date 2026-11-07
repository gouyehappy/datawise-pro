import type { CopilotChatMode, SessionContext } from "./types";

export type ComposeUserPromptOpts = {
  userText: string;
  context: SessionContext | Record<string, unknown>;
  mode: CopilotChatMode;
  /** Override default ask/agent tails. */
  askTail?: string;
  agentTail?: string;
};

const DEFAULT_ASK_TAIL = "Explain using this session context. Do not propose runnable action cards.";
const DEFAULT_AGENT_TAIL = "Propose actionable cards.";

/** Build the user prompt body sent to the LLM (context JSON + mode tail). */
export function composeUserPrompt(opts: ComposeUserPromptOpts): string {
  const tail =
    opts.mode === "ask"
      ? opts.askTail ?? DEFAULT_ASK_TAIL
      : opts.agentTail ?? DEFAULT_AGENT_TAIL;
  return `${opts.userText}\n\nSession context (JSON):\n${JSON.stringify(opts.context)}\n\n${tail}`;
}
