/** How the copilot chooses reply language. */
export type CopilotReplyLanguage = "auto" | "zh-CN" | "en";

export function normalizeCopilotReplyLanguage(value: unknown): CopilotReplyLanguage | null {
  return value === "auto" || value === "zh-CN" || value === "en" ? value : null;
}

/**
 * Resolve the BCP-47-ish locale tag used in the system prompt.
 * `auto` follows the workbench / host UI locale.
 */
export function resolveReplyLocale(prefer: CopilotReplyLanguage, uiLocale: string): string {
  if (prefer === "zh-CN" || prefer === "en") return prefer;
  const raw = (uiLocale || "zh-CN").trim() || "zh-CN";
  const lower = raw.toLowerCase().replace(/_/g, "-");
  if (lower === "zh" || lower.startsWith("zh-")) return "zh-CN";
  if (lower === "en" || lower.startsWith("en-")) return "en";
  return raw;
}

/** Append to system prompts so the model matches the UI language. */
export function replyLanguageInstruction(locale: string): string {
  const tag = resolveReplyLocale("auto", locale);
  if (tag === "zh-CN" || tag.toLowerCase().startsWith("zh")) {
    return [
      "Reply language: Write all user-facing explanations in Simplified Chinese (简体中文).",
      "Keep shell commands, file paths, tool/API names, JSON keys, and action-card JSON in their original form (do not translate those).",
      "Action card title/description may be Chinese.",
    ].join(" ");
  }
  if (tag === "en" || tag.toLowerCase().startsWith("en")) {
    return [
      "Reply language: Write all user-facing explanations in English.",
      "Keep shell commands, file paths, tool/API names, JSON keys, and action-card JSON unchanged.",
    ].join(" ");
  }
  return [
    `Reply language: Write all user-facing explanations in the language for locale "${tag}".`,
    "Keep shell commands, file paths, tool/API names, JSON keys, and action-card JSON unchanged.",
  ].join(" ");
}
