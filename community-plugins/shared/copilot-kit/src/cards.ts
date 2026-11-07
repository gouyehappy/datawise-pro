import type { CardPolicy } from "./adapter";
import type { ActionCard } from "./types";

/** True when a fenced body looks like action-card JSON (not bash/examples). */
function looksLikeActionCardJson(body: string): boolean {
  const t = body.trim();
  if (!t) return false;
  return /"cards"\s*:/.test(t) || /"tool"\s*:/.test(t);
}

/**
 * Strip fenced / bare action-card JSON from assistant prose so the Dock
 * shows readable text + cards, not a duplicated JSON dump. Non-card fences
 * (bash, plain code) are preserved. Incomplete mid-stream card fences are
 * hidden so users never see raw `{ "cards": ...` leak.
 */
export function stripActionCardJson(text: string): string {
  if (!text.trim()) return "";
  let cleaned = text.replace(/```(?:json)?\s*([\s\S]*?)```/gi, (full, body: string) =>
    looksLikeActionCardJson(body) ? "" : full,
  );
  cleaned = cleaned.replace(/```(?:json)?\s*([\s\S]*)$/i, (full, body: string) => {
    const t = String(body || "").trim();
    if (!t) return "";
    if (/^[\{\[]/.test(t) && (looksLikeActionCardJson(t) || /^\{\s*"?c?a?r?d?s?"?\s*:?\s*\[?\s*$/i.test(t))) {
      return "";
    }
    return full;
  });
  cleaned = cleaned.replace(
    /\n?\s*(?:\{\s*"cards"\s*:\s*\[[\s\S]*\]\s*\}|\[[\s\S]*\{\s*"tool"\s*:[\s\S]*\}\s*\])\s*$/i,
    "",
  );
  cleaned = cleaned.replace(/\n?\s*\{\s*"cards"\s*:\s*\[[\s\S]*$/i, "");
  return cleaned.replace(/\n{3,}/g, "\n\n").trim();
}

/** Tools that cannot run without a shell command string. */
const COMMAND_REQUIRED_TOOLS = new Set([
  "ssh_exec",
  "ssh_exec_sudo",
  "ssh_run_bg",
  "ssh_terminal_input",
]);

/**
 * Models often put `command` / `runInTerminal` on the card root instead of
 * inside `args`. Lift those fields and normalize aliases (`cmd` → `command`).
 */
export function normalizeCardArgs(
  tool: string,
  row: Record<string, unknown>,
): Record<string, unknown> {
  const args =
    row.args && typeof row.args === "object" && !Array.isArray(row.args)
      ? { ...(row.args as Record<string, unknown>) }
      : {};
  const liftKeys = [
    "command",
    "cmd",
    "script",
    "cmdline",
    "path",
    "text",
    "runInTerminal",
    "timeoutSecs",
    "maxBytes",
    "logPath",
    "payload",
  ] as const;
  for (const key of liftKeys) {
    if (args[key] == null && row[key] != null) args[key] = row[key];
  }
  if (args.command == null) {
    for (const key of ["cmd", "script", "cmdline"] as const) {
      if (typeof args[key] === "string" && args[key].trim()) {
        args.command = args[key];
        break;
      }
    }
  }
  // Last resort: a single fenced/backtick command in description.
  if (
    COMMAND_REQUIRED_TOOLS.has(tool) &&
    !(typeof args.command === "string" && args.command.trim()) &&
    typeof row.description === "string"
  ) {
    const fromDesc = extractCommandFromProse(row.description);
    if (fromDesc) args.command = fromDesc;
  }
  if (
    tool === "ssh_terminal_input" &&
    !(typeof args.text === "string" && args.text.trim()) &&
    typeof args.command === "string"
  ) {
    args.text = args.command;
  }
  return args;
}

function extractCommandFromProse(text: string): string | undefined {
  const fenced = /`([^`\n]+)`/.exec(text);
  if (fenced?.[1]?.trim()) return fenced[1].trim();
  return undefined;
}

export function cardCommand(args: Record<string, unknown> | undefined): string {
  if (!args) return "";
  for (const key of ["command", "cmd", "script", "cmdline", "text"]) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function cardHasRequiredArgs(tool: string, args: Record<string, unknown>): boolean {
  if (!COMMAND_REQUIRED_TOOLS.has(tool)) return true;
  if (tool === "ssh_terminal_input") return Boolean(cardCommand(args));
  return Boolean(cardCommand(args));
}

/** Extract ```json { "cards": [...] } ``` (or a bare cards array) from LLM text. */
export function parseActionCardsFromLlm(text: string, policy: CardPolicy): ActionCard[] {
  if (!text.trim()) return [];
  const blocks: string[] = [];
  const fenced = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  while ((match = fenced.exec(text))) {
    blocks.push(match[1]!.trim());
  }
  if (!blocks.length) {
    const bare = text.trim();
    if (bare.startsWith("{") || bare.startsWith("[")) blocks.push(bare);
  }

  const cards: ActionCard[] = [];
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block) as unknown;
      const rawList = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object" && Array.isArray((parsed as { cards?: unknown }).cards)
          ? (parsed as { cards: unknown[] }).cards
          : null;
      if (!rawList) continue;
      for (const [index, item] of rawList.entries()) {
        if (!item || typeof item !== "object") continue;
        const row = item as Record<string, unknown>;
        const tool = typeof row.tool === "string" ? row.tool.trim() : "";
        if (!policy.isToolAllowed(tool)) continue;
        const args = normalizeCardArgs(tool, row);
        if (!cardHasRequiredArgs(tool, args)) continue;
        const title =
          typeof row.title === "string" && row.title.trim() ? row.title.trim() : tool;
        const id =
          typeof row.id === "string" && row.id.trim() ? row.id.trim() : `${tool}-${index}`;
        const description = typeof row.description === "string" ? row.description : undefined;
        const riskHint =
          row.risk === "confirm" || row.risk === "read" ? row.risk : policy.toolRisk(tool, args);
        cards.push({ id, title, tool, args, risk: riskHint, description });
      }
    } catch {
      // Ignore malformed JSON blocks.
    }
  }
  return cards;
}
