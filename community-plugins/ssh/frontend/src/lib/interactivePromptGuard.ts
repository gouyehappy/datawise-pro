/**
 * Interactive prompt guard (issue #150 lineage from dbx-plugin-ssh).
 *
 * When the remote is asking for input or a choice (MFA/OTP, Password, select
 * menus, y/n), ↑/↓ and suggestion/ghost overlays must yield to the PTY.
 * Pure logic only — xterm buffer reads and overlay wiring stay in App.vue.
 */

import { isPasswordPromptLine } from "./passwordPrompt";

// Login-time dynamic code / verification prompts.
const AUTH_CHALLENGE_LINE_PATTERN =
  /(?:otp|mfa|2fa|one[-\s]?time(?:\s+(?:password|passcode|code))?|two[-\s]?factor|verification(?:\s+code)?|authentication\s+code|验证码|动态[口令密码]|一次性密码|双因子|二次验证)[^:：\n]{0,32}[:：]\s*$|(?:please\s+)?enter\s+(?:the\s+)?(?:mfa|otp|2fa|verification(?:\s+code)?|one[-\s]?time|动态[口令密码]|验证码)/i;

/** True when the line is a login OTP / MFA challenge prompt. */
export function isAuthChallengeLine(text: string): boolean {
  const trimmed = (text ?? "").trimEnd();
  if (!trimmed) return false;
  return AUTH_CHALLENGE_LINE_PATTERN.test(trimmed);
}

// Selection / confirm prompts (bastion menus, shell read/select, y/n).
const SELECTION_PROMPT_PATTERN =
  /(?:^(?:please\s+)?(?:select|choose|pick)\b[^:：\n?？]{0,40}|^enter\b[^:：\n?？]{0,40}|请(?:选择|输入|确认)|输入(?:序号|编号|选项)|^选择)[^:：\n?？]{0,40}[:：?？]|\[[YyNn]\]|\[[Yy]\/[Nn]\]|\((?:[Yy]\/[Nn]|[Nn]\/[Yy]|[Yy]es\/[Nn]o|[Nn]o\/[Yy]es)\)(?:\s*[:：?？])?\s*$/i;

/** True when the line is a select / confirm prompt. */
export function isSelectionPromptLine(text: string): boolean {
  const trimmed = (text ?? "").trimEnd();
  if (!trimmed) return false;
  return SELECTION_PROMPT_PATTERN.test(trimmed);
}

// Canonical tty echoes control keys as caret notation (`^[[A`, `^[`, `^C`).
const CARET_ECHO_TAIL = /(?:\^\[\[[0-9;]*[A-Za-z~]|\^\[[A-Za-z]|\^\?|\^[A-Z])+$/;

/** Strip trailing caret-echo noise, then classify interactive prompts. */
export function isInteractivePromptLine(text: string): boolean {
  const trimmed = stripCaretEchoTail((text ?? "").trimEnd());
  if (!trimmed) return false;
  return isAuthChallengeLine(trimmed) || isPasswordPromptLine(trimmed) || isSelectionPromptLine(trimmed);
}

function stripCaretEchoTail(text: string): string {
  return text.replace(CARET_ECHO_TAIL, "").trimEnd();
}

/** Sample the cursor row and the row above via caller-injected getLineText. */
export function interactivePromptNearCursor(cursorRow: number, getLineText: (row: number) => string): boolean {
  for (let row = cursorRow; row >= Math.max(0, cursorRow - 1); row -= 1) {
    if (isInteractivePromptLine(getLineText(row))) return true;
  }
  return false;
}

export interface InteractivePromptGates {
  /** Cursor neighborhood has an ask/select prompt line. */
  promptLineOnScreen: boolean;
  /** Host-key / connection challenge dialog waiting for an answer. */
  challengeDialogPending: boolean;
}

/** Any gate signal means overlays must yield to the remote prompt. */
export function isInteractivePromptPending(gates: InteractivePromptGates): boolean {
  return gates.promptLineOnScreen || gates.challengeDialogPending;
}
