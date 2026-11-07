/**
 * Terminal context-menu helpers (Xshell-style): URL extraction from a selection.
 */

/** First http(s) URL in free text (selection / clipboard). */
export function extractHttpUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>"'`]+/i);
  if (!match) return null;
  // Trim common trailing punctuation from terminal wrapping.
  return match[0].replace(/[)\],.;:]+$/g, "") || null;
}
