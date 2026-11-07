import type { ActionCard } from "./types";

/**
 * Plain title (+ optional command/path) for a tool-step user turn.
 * Dock renders `variant: "tool"` — keep content free of i18n prefixes.
 */
export function formatCardUserTurn(card: ActionCard): string {
  const title = (card.title || card.tool || "").trim() || card.tool;
  const command = String(card.args?.command ?? card.args?.path ?? card.args?.text ?? "").trim();
  return command && command !== title ? `${title}\n${command}` : title;
}
