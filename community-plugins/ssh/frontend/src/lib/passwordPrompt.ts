/**
 * Password / passphrase prompt heuristics for terminal overlays.
 * Shared by interactive-prompt gates and (optionally) empty-prompt hint bars.
 */

// `pass phrase:` (spaced) is kept for corpus alignment with the sidecar word list.
const PASSWORD_PROMPT_PATTERN =
  /(?:pass(?:word|wd|\s?phrase)|口令|密码)[^:：]*[:：]\s*$|^enter password\b/i;

/** True when the line looks like a credential input prompt (empty after trim → false). */
export function isPasswordPromptLine(text: string): boolean {
  const trimmed = (text ?? "").trimEnd();
  if (!trimmed) return false;
  return PASSWORD_PROMPT_PATTERN.test(trimmed);
}
