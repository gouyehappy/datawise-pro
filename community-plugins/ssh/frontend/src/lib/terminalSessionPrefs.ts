/**
 * Motty-parity terminal session preferences (OSC 52 / scrollback / word
 * separators / tab title / latency badge). Persisted via uiStorage as one JSON
 * blob so Settings can change-and-save without per-key sprawl.
 */

import { uiStorage } from "./uiStorage";
import { sanitizeGutterMode, type TerminalGutterMode } from "./terminalGutter";

/** Remote → local clipboard write policy (OSC 52). Read queries stay refused. */
export type Osc52ClipboardPolicy = "block" | "ask" | "allow";

/** Scrollback line budgets; applied when a Terminal is constructed. */
export type TerminalScrollbackLines = 1000 | 5000 | 10000 | 15000;

/** Tab / chrome title source. */
export type TabTitleMode = "connection" | "terminal" | "directory";

/** Motty find start edge for the first match of a query. */
export type TerminalFindOrigin = "session_top" | "session_bottom" | "view_top" | "view_bottom";

export const FIND_ORIGIN_CHOICES: readonly TerminalFindOrigin[] = [
  "session_top",
  "session_bottom",
  "view_top",
  "view_bottom",
];

/** Motty find highlight colors (SearchAddon decorations) + first-match origin. */
export type TerminalFindPrefs = {
  foreground: string;
  background: string;
  /** 0–100; applied as alpha on the match background. */
  opacity: number;
  /**
   * Where the first match of a new query is chosen (Motty `terminal_find.origin`).
   * Applied by seeding xterm selection before SearchAddon findNext/findPrevious.
   */
  origin: TerminalFindOrigin;
};

export type TerminalSessionPrefs = {
  osc52Policy: Osc52ClipboardPolicy;
  scrollback: TerminalScrollbackLines;
  /**
   * Characters that break double-click word selection. Empty string means
   * "use xterm default" (`DEFAULT_WORD_SEPARATORS`).
   */
  wordSeparators: string;
  tabTitleMode: TabTitleMode;
  showLatency: boolean;
  bellEnabled: boolean;
  /** OSC 9 / 777 notify → in-app toast (host desktop notify when available later). */
  notificationsEnabled: boolean;
  closeSessionConfirm: boolean;
  closeWorkbenchConfirm: boolean;
  /**
   * Motty password hint: when a password prompt appears, offer saved sudo
   * credentials as a picker (confirm before send; never auto-inject).
   */
  passwordHintEnabled: boolean;
  /**
   * Motty paste-image: clipboard image → save/upload then insert a path.
   * Default off — Local writes host path; SSH uploads then inserts remote path.
   */
  pasteImageEnabled: boolean;
  /**
   * Motty terminal gutter: off / line numbers / write time / both.
   * Width is reserved from the pane (PTY cols shrink); alt-screen paints blank.
   */
  gutter: TerminalGutterMode;
  find: TerminalFindPrefs;
};

export const TERMINAL_SESSION_PREFS_KEY = "ssh-terminal-session-prefs";

/** xterm.js OptionsService default (` ()[]{}',"`'`). */
export const DEFAULT_WORD_SEPARATORS = " ()[]{}',\"`";

export const SCROLLBACK_CHOICES: readonly TerminalScrollbackLines[] = [1000, 5000, 10000, 15000];

export const DEFAULT_FIND_PREFS: TerminalFindPrefs = {
  // Motty defaults: dark ink on yellow, first match from view bottom upward.
  foreground: "#1A1400",
  background: "#FFFF00",
  opacity: 100,
  origin: "view_bottom",
};

export function sanitizeFindOrigin(raw: unknown): TerminalFindOrigin {
  return raw === "session_top" || raw === "session_bottom" || raw === "view_top" || raw === "view_bottom"
    ? raw
    : DEFAULT_FIND_PREFS.origin;
}

/**
 * Seed xterm selection so SearchAddon’s first find starts at the Motty origin.
 * Returns the SearchAddon direction that matches Motty’s forward/backward start.
 */
export function seedTerminalFindOrigin(
  term: {
    cols: number;
    rows: number;
    select(column: number, row: number, length: number): void;
    buffer: { active: { baseY: number; viewportY: number } };
  },
  origin: TerminalFindOrigin,
): "next" | "prev" {
  const buf = term.buffer.active;
  const sessionBottom = Math.max(0, buf.baseY + term.rows - 1);
  const viewBottom = Math.max(0, buf.viewportY + term.rows - 1);
  const col = Math.max(0, term.cols - 1);
  switch (origin) {
    case "session_top":
      term.select(0, 0, 1);
      return "next";
    case "session_bottom":
      term.select(col, sessionBottom, 1);
      return "prev";
    case "view_top":
      term.select(0, Math.max(0, buf.viewportY), 1);
      return "next";
    case "view_bottom":
    default:
      term.select(col, viewBottom, 1);
      return "prev";
  }
}

export const DEFAULT_TERMINAL_SESSION_PREFS: TerminalSessionPrefs = {
  // Preserve pre-preference behavior (always write) on upgrade.
  osc52Policy: "allow",
  // Motty default (scrollbackLines = 5000). 15k remains a valid choice.
  scrollback: 5000,
  wordSeparators: "",
  tabTitleMode: "connection",
  showLatency: false,
  bellEnabled: false,
  // Off by default — remote apps should not spam the user until they opt in.
  notificationsEnabled: false,
  closeSessionConfirm: true,
  closeWorkbenchConfirm: true,
  // Motty default is on (passwordHintOff=false); picker still requires confirm.
  passwordHintEnabled: true,
  // Opt-in: avoid surprising uploads / host writes on plain Ctrl+V.
  pasteImageEnabled: false,
  gutter: "off",
  find: { ...DEFAULT_FIND_PREFS },
};

const HEX_COLOR = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;

export function sanitizeHexColor(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  return HEX_COLOR.test(trimmed) ? trimmed : fallback;
}

export function sanitizeFindPrefs(raw: unknown): TerminalFindPrefs {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const opacityRaw = typeof o.opacity === "number" ? o.opacity : Number(o.opacity);
  const opacity = Number.isFinite(opacityRaw)
    ? Math.min(100, Math.max(0, Math.round(opacityRaw)))
    : DEFAULT_FIND_PREFS.opacity;
  return {
    foreground: sanitizeHexColor(o.foreground, DEFAULT_FIND_PREFS.foreground),
    background: sanitizeHexColor(o.background, DEFAULT_FIND_PREFS.background),
    opacity,
    origin: sanitizeFindOrigin(o.origin),
  };
}

/** Build SearchAddon decoration colors from Motty-style find prefs. */
export function findDecorationColors(find: TerminalFindPrefs): {
  matchBackground: string;
  matchOverviewRuler: string;
  activeMatchBackground: string;
  activeMatchColorOverviewRuler: string;
} {
  const alpha = Math.round((find.opacity / 100) * 255)
    .toString(16)
    .padStart(2, "0");
  const bg = find.background.length === 4
    ? `#${find.background[1]}${find.background[1]}${find.background[2]}${find.background[2]}${find.background[3]}${find.background[3]}`
    : find.background;
  const matchBackground = `${bg}${alpha}`;
  return {
    matchBackground,
    matchOverviewRuler: bg,
    activeMatchBackground: matchBackground,
    activeMatchColorOverviewRuler: find.foreground,
  };
}

export function sanitizeOsc52Policy(raw: unknown): Osc52ClipboardPolicy {
  return raw === "block" || raw === "ask" || raw === "allow" ? raw : DEFAULT_TERMINAL_SESSION_PREFS.osc52Policy;
}

export function sanitizeScrollback(raw: unknown): TerminalScrollbackLines {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (n === 1000 || n === 5000 || n === 10000 || n === 15000) return n;
  return DEFAULT_TERMINAL_SESSION_PREFS.scrollback;
}

export function sanitizeTabTitleMode(raw: unknown): TabTitleMode {
  return raw === "terminal" || raw === "directory" || raw === "connection"
    ? raw
    : DEFAULT_TERMINAL_SESSION_PREFS.tabTitleMode;
}

/** Cap length; strip controls so the value is safe to put in xterm options. */
export function sanitizeWordSeparators(raw: unknown): string {
  if (typeof raw !== "string") return DEFAULT_TERMINAL_SESSION_PREFS.wordSeparators;
  return raw.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 64);
}

export function effectiveWordSeparators(prefs: Pick<TerminalSessionPrefs, "wordSeparators">): string {
  return prefs.wordSeparators === "" ? DEFAULT_WORD_SEPARATORS : prefs.wordSeparators;
}

export function sanitizeTerminalSessionPrefs(raw: unknown): TerminalSessionPrefs {
  const base = { ...DEFAULT_TERMINAL_SESSION_PREFS };
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  return {
    osc52Policy: sanitizeOsc52Policy(o.osc52Policy),
    scrollback: sanitizeScrollback(o.scrollback),
    wordSeparators: sanitizeWordSeparators(o.wordSeparators),
    tabTitleMode: sanitizeTabTitleMode(o.tabTitleMode),
    showLatency: o.showLatency === true,
    bellEnabled: o.bellEnabled === true,
    notificationsEnabled: o.notificationsEnabled === true,
    closeSessionConfirm: o.closeSessionConfirm !== false,
    closeWorkbenchConfirm: o.closeWorkbenchConfirm !== false,
    // Default on (Motty); only explicit false disables.
    passwordHintEnabled: o.passwordHintEnabled !== false,
    pasteImageEnabled: o.pasteImageEnabled === true,
    gutter: sanitizeGutterMode(o.gutter),
    find: sanitizeFindPrefs(o.find),
  };
}

export function loadTerminalSessionPrefs(storage: Pick<Storage, "getItem"> = uiStorage): TerminalSessionPrefs {
  try {
    const raw = storage.getItem(TERMINAL_SESSION_PREFS_KEY);
    if (!raw) return { ...DEFAULT_TERMINAL_SESSION_PREFS };
    return sanitizeTerminalSessionPrefs(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_TERMINAL_SESSION_PREFS };
  }
}

export function persistTerminalSessionPrefs(
  prefs: TerminalSessionPrefs,
  storage: Pick<Storage, "setItem"> = uiStorage,
): void {
  try {
    storage.setItem(TERMINAL_SESSION_PREFS_KEY, JSON.stringify(sanitizeTerminalSessionPrefs(prefs)));
  } catch {
    // Opaque-origin / quota: session keeps in-memory prefs only.
  }
}

export function mergeTerminalSessionPrefs(
  current: TerminalSessionPrefs,
  patch: Partial<TerminalSessionPrefs>,
): TerminalSessionPrefs {
  return sanitizeTerminalSessionPrefs({ ...current, ...patch });
}
