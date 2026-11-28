/**
 * Motty-style password hint assist (S-PASSHINT): when the cursor line looks
 * like an account password prompt, offer saved sudo credentials as a picker.
 *
 * Secrets are never listed in the UI — only labels. Reveal happens after the
 * user picks a candidate and confirms send. Bastion Opt> menus stay quiet.
 */

import { isBastionMenuContext } from "./bastionContext";
import { isPasswordPromptLine } from "./passwordPrompt";

export type PasswordHintCandidateKind = "connection" | "profile";

/** Non-secret row shown in the picker. */
export type PasswordHintCandidate = {
  kind: PasswordHintCandidateKind;
  /** `connection` or a sudo profile id. */
  id: string;
  /** Display name (connection label or profile name). */
  label: string;
};

export type PasswordHintSource = {
  /** Connection-level sudo password is configured. */
  connectionPasswordSet: boolean;
  /** Label for the connection row (e.g. connection display name). */
  connectionLabel: string;
  profiles: ReadonlyArray<{ id: string; name: string; sudoPasswordSet: boolean }>;
};

/** Build picker rows from connection + global sudo profiles (no secrets). */
export function buildPasswordHintCandidates(source: PasswordHintSource): PasswordHintCandidate[] {
  const out: PasswordHintCandidate[] = [];
  if (source.connectionPasswordSet) {
    const label = source.connectionLabel.trim() || "Connection";
    out.push({ kind: "connection", id: "connection", label });
  }
  for (const profile of source.profiles) {
    if (!profile.sudoPasswordSet) continue;
    const id = typeof profile.id === "string" ? profile.id.trim() : "";
    if (!id) continue;
    const label = typeof profile.name === "string" && profile.name.trim() ? profile.name.trim() : id;
    out.push({ kind: "profile", id, label });
  }
  return out;
}

export type PasswordHintGate = {
  enabled: boolean;
  line: string;
  candidates: readonly PasswordHintCandidate[];
  /** Other modal already owns the UI (paste / osc52 / autofill / this hint). */
  busy: boolean;
  connected: boolean;
};

/**
 * Whether the assist should open a picker for this cursor line.
 * Does not decide persistence of "already offered" — callers track that.
 */
export function shouldOfferPasswordHint(gate: PasswordHintGate): boolean {
  if (!gate.enabled || gate.busy || !gate.connected) return false;
  if (gate.candidates.length === 0) return false;
  const line = (gate.line ?? "").trimEnd();
  if (!isPasswordPromptLine(line)) return false;
  if (isBastionMenuContext(line)) return false;
  return true;
}

/** Stable key so the same prompt line does not re-pop after dismiss. */
export function passwordHintOfferKey(line: string, candidateIds: readonly string[]): string {
  return `${line.trimEnd()}\0${candidateIds.join(",")}`;
}

/** Payload written to the PTY after confirm (password + Enter). */
export function passwordHintPayload(password: string): string {
  return `${password}\r`;
}
