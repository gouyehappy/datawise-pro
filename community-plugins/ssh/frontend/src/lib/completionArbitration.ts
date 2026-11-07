/**
 * Single-owner arbitration between Fig structured completion and line suggest.
 * First token (no whitespace) → line suggest; args/flags phase → Fig when enabled.
 */

export type CompletionOwner = "fig" | "line" | "none";

/**
 * True once the typed line has moved past the command name into args/flags.
 * Trailing space counts (user just finished the command name); leading space does not.
 */
export function isArgsCompletionPhase(typedLine: string): boolean {
  const body = typedLine.replace(/^\s+/, "");
  return body.length > 0 && /\s/.test(body);
}

/**
 * Which overlay owns the current typed line.
 * When both prefs are on: first token → line; after a space → fig.
 */
export function resolveCompletionOwner(options: {
  typedLine: string;
  figEnabled: boolean;
  lineEnabled: boolean;
}): CompletionOwner {
  const { typedLine, figEnabled, lineEnabled } = options;
  if (!figEnabled && !lineEnabled) return "none";
  if (isArgsCompletionPhase(typedLine)) {
    if (figEnabled) return "fig";
    if (lineEnabled) return "line";
    return "none";
  }
  if (lineEnabled) return "line";
  if (figEnabled) return "fig";
  return "none";
}
