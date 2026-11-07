/**
 * Portable session-copilot types.
 * Adapters may put extra fields on {@link SessionContext}; keep secrets out.
 */
export interface SessionContext {
  connectionId?: string;
  sessionId?: string;
  host?: string;
  user?: string;
  readOnly?: boolean;
  agentMode?: string;
  shellCwd?: string | null;
  sftpPath?: string | null;
  selectedPaths?: string[];
  metricsDigest?: string | null;
  [key: string]: unknown;
}

export type ModelSource = "plugin" | "host" | "none";

/**
 * User model pick:
 * - auto = first ready plugin profile, else host
 * - plugin = active plugin profile
 * - plugin:<id> = specific BYOK profile
 * - host = host default AI
 */
export type ModelPreference = "auto" | "plugin" | "host" | `plugin:${string}`;

/** Dock interaction mode: Ask = explain only; Agent = propose/run action cards. */
export type CopilotChatMode = "ask" | "agent";

export interface CopilotAttachment {
  id: string;
  name: string;
  /** Plain text payload injected into the next prompt. */
  content: string;
  /** bytes of original content (for chip display). */
  bytes: number;
  kind: "file" | "selection" | "snippet";
}

/** Intent id — adapters define the concrete set (e.g. SSH analyze_load). */
export type CopilotIntent = string;

export type ActionCardRisk = "read" | "confirm";

export interface ActionCard {
  id: string;
  title: string;
  tool: string;
  args: Record<string, unknown>;
  risk: ActionCardRisk;
  description?: string;
}

export interface CopilotReference {
  url: string;
  title?: string;
}

export interface CopilotMessage {
  role: "user" | "assistant" | "system";
  content: string;
  /**
   * User-turn presentation:
   * - prompt = normal question bubble (default)
   * - tool = compact “ran action” step (card click), not a chat bubble
   */
  variant?: "prompt" | "tool";
  /** Model reasoning / chain-of-thought (not re-sent to tools). */
  thinking?: string;
  /** URLs extracted from the final assistant body (deduped). */
  references?: CopilotReference[];
  cards?: ActionCard[];
  source?: ModelSource;
}
