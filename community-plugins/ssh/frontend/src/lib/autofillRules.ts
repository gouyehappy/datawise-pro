/**
 * Motty-style autofill rules (S-AUTOFILL): match the cursor line against
 * user regexes and offer a fixed reply (confirm phrases, menu choices, etc.).
 *
 * v1 scope:
 * - send kind `text` only (fixed string). Password/OTP auto-send stay with
 *   Quick sudo / S-PASSHINT so secrets are not duplicated in uiStorage.
 * - Always require an explicit confirm before writing to the PTY.
 * - ReDoS guard: pattern length cap + try/catch on RegExp; no catastrophic
 *   backtracking guarantees beyond that — keep patterns simple.
 */

import { uiStorage } from "./uiStorage";

export type AutofillSendKind = "text";

export type AutofillRule = {
  id: string;
  name: string;
  /** JavaScript regex source (no surrounding slashes). */
  pattern: string;
  enabled: boolean;
  send: AutofillSendKind;
  /** Fixed reply body (no trailing newline unless appendEnter). */
  fixedText: string;
  /** Append \\r after the text when sending. */
  appendEnter: boolean;
};

export const AUTOFILL_RULES_KEY = "ssh-terminal-autofill-rules";
export const AUTOFILL_RULES_LIMIT = 20;
export const AUTOFILL_NAME_MAX = 80;
export const AUTOFILL_PATTERN_MAX = 128;
export const AUTOFILL_TEXT_MAX = 256;

export type AutofillRuleInput = {
  id?: string;
  name?: unknown;
  pattern?: unknown;
  enabled?: unknown;
  send?: unknown;
  fixedText?: unknown;
  appendEnter?: unknown;
};

export type AutofillSanitizeResult =
  | { ok: true; rule: AutofillRule }
  | { ok: false; error: string };

function newRuleId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `af-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Compile a rule pattern; invalid → null (rule skipped at match time). */
export function compileAutofillPattern(pattern: string): RegExp | null {
  const trimmed = pattern.trim();
  if (!trimmed || trimmed.length > AUTOFILL_PATTERN_MAX) return null;
  try {
    return new RegExp(trimmed, "u");
  } catch {
    return null;
  }
}

export function sanitizeAutofillRuleInput(raw: AutofillRuleInput): AutofillSanitizeResult {
  const name = typeof raw.name === "string" ? raw.name.trim().slice(0, AUTOFILL_NAME_MAX) : "";
  if (!name) return { ok: false, error: "autofillRules.invalidName" };

  const pattern = typeof raw.pattern === "string" ? raw.pattern.trim().slice(0, AUTOFILL_PATTERN_MAX) : "";
  if (!pattern) return { ok: false, error: "autofillRules.invalidPattern" };
  if (!compileAutofillPattern(pattern)) return { ok: false, error: "autofillRules.invalidPattern" };

  const fixedText = typeof raw.fixedText === "string" ? raw.fixedText.slice(0, AUTOFILL_TEXT_MAX) : "";
  // Allow empty fixed text only if appendEnter (send bare Enter).
  const appendEnter = raw.appendEnter !== false;
  if (!fixedText && !appendEnter) return { ok: false, error: "autofillRules.invalidText" };
  if (fixedText.includes("\n") || fixedText.includes("\r")) {
    return { ok: false, error: "autofillRules.multilineForbidden" };
  }

  return {
    ok: true,
    rule: {
      id: typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : newRuleId(),
      name,
      pattern,
      enabled: raw.enabled !== false,
      send: "text",
      fixedText,
      appendEnter,
    },
  };
}

export function sanitizeAutofillRules(raw: unknown): AutofillRule[] {
  if (!Array.isArray(raw)) return [];
  const out: AutofillRule[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (out.length >= AUTOFILL_RULES_LIMIT) break;
    if (!item || typeof item !== "object") continue;
    const result = sanitizeAutofillRuleInput(item as AutofillRuleInput);
    if (!result.ok) continue;
    if (seen.has(result.rule.id)) continue;
    seen.add(result.rule.id);
    out.push(result.rule);
  }
  return out;
}

export function loadAutofillRules(storage: Pick<Storage, "getItem"> = uiStorage): AutofillRule[] {
  try {
    const raw = storage.getItem(AUTOFILL_RULES_KEY);
    if (!raw) return [];
    return sanitizeAutofillRules(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function persistAutofillRules(
  rules: AutofillRule[],
  storage: Pick<Storage, "setItem"> = uiStorage,
): void {
  try {
    storage.setItem(AUTOFILL_RULES_KEY, JSON.stringify(sanitizeAutofillRules(rules)));
  } catch {
    // Opaque origin / quota.
  }
}

export type AutofillMatch = {
  rule: AutofillRule;
  /** Payload to write when the user confirms (includes optional \\r). */
  payload: string;
};

/**
 * First enabled rule whose pattern matches the cursor line wins.
 * Callers must still confirm before sending.
 */
export function matchAutofillRules(line: string, rules: readonly AutofillRule[]): AutofillMatch | null {
  const trimmed = (line ?? "").trimEnd();
  if (!trimmed) return null;
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const re = compileAutofillPattern(rule.pattern);
    if (!re) continue;
    try {
      if (!re.test(trimmed)) continue;
    } catch {
      continue;
    }
    const payload = rule.appendEnter ? `${rule.fixedText}\r` : rule.fixedText;
    if (!payload) continue;
    return { rule, payload };
  }
  return null;
}

/**
 * Whether autofill should stay quiet for this line (Quick sudo / password /
 * selection prompts own the interaction).
 */
export function autofillShouldYield(line: string, isInteractivePrompt: (text: string) => boolean): boolean {
  return isInteractivePrompt(line);
}
