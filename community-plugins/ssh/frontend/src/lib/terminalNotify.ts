/**
 * Terminal desktop / in-app notifications from OSC sequences (Motty
 * `terminal_notifications`). Subset:
 * - OSC 9 ; <message> ST          — simple body
 * - OSC 777 ; notify ; <title> ; <body> ST — iTerm2-style
 *
 * OSC 99 (Kitty) is left for a later pass. Read/write of the user clipboard is
 * never involved. Callers own rate-limiting and UI (Toast vs host Notification).
 */

export type TerminalOscNotification = {
  title: string;
  body: string;
  /** Which OSC family produced this. */
  source: "osc9" | "osc777";
};

const MAX_TITLE = 120;
const MAX_BODY = 400;

/** Strip C0 controls except tab; clamp length for toast/OS notification safety. */
export function sanitizeNotifyText(raw: string, max: number): string {
  return raw.replace(/[\u0000-\u0008\u000a-\u001f\u007f]/g, "").trim().slice(0, max);
}

/**
 * Parse OSC 9 payload (everything after `9;`). Empty after sanitize → null.
 */
export function parseOsc9Notify(data: string): TerminalOscNotification | null {
  if (typeof data !== "string") return null;
  const body = sanitizeNotifyText(data, MAX_BODY);
  if (!body) return null;
  return { title: "", body, source: "osc9" };
}

/**
 * Parse OSC 777 payload. Accepts `notify;title;body` (extra `;` stay in body).
 * Non-notify subcommands return null (unhandled).
 */
export function parseOsc777Notify(data: string): TerminalOscNotification | null {
  if (typeof data !== "string") return null;
  const trimmed = data.trim();
  if (!trimmed.toLowerCase().startsWith("notify;")) return null;
  const rest = trimmed.slice("notify;".length);
  const sep = rest.indexOf(";");
  const titleRaw = sep === -1 ? rest : rest.slice(0, sep);
  const bodyRaw = sep === -1 ? "" : rest.slice(sep + 1);
  const title = sanitizeNotifyText(titleRaw, MAX_TITLE);
  const body = sanitizeNotifyText(bodyRaw, MAX_BODY);
  if (!title && !body) return null;
  return { title, body, source: "osc777" };
}

/**
 * Per-session rate limiter: at most one accepted notify per `minIntervalMs`.
 * Returns true when the caller should show the notification.
 */
export function createNotifyRateLimiter(minIntervalMs = 2000): {
  allow(): boolean;
  reset(): void;
} {
  let lastAt = 0;
  return {
    allow() {
      const now = Date.now();
      if (now - lastAt < minIntervalMs) return false;
      lastAt = now;
      return true;
    },
    reset() {
      lastAt = 0;
    },
  };
}
