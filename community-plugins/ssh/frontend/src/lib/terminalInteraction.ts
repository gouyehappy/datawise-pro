/**
 * Terminal interaction preferences (select-to-copy / click-to-move-cursor).
 * Right-click always opens the Motty-style menu (paste via menu / Ctrl+V).
 * Toggles are pure-frontend (no sidecar), persisted in localStorage; "false"
 * disables, every other value (including a missing entry) keeps the historical
 * default of enabled.
 */

export type TerminalRightClickAction = "paste" | "menu";
import { uiStorage } from "./uiStorage";

export function sanitizeSelectCopyEnabled(raw: string | null): boolean {
  return raw !== "false";
}

/** Click-to-move-cursor (synthesizes left/right arrows). Same persistence shape as select-copy. */
export function sanitizeClickCursorEnabled(raw: string | null): boolean {
  return raw !== "false";
}

/**
 * Right-click routing (Motty-aligned): always open the context menu.
 * Paste lives on the menu item / Ctrl+V — not on bare right-click.
 * `selectCopy` / `shiftKey` / `hasSelection` are kept for call-site stability
 * and no longer change the action.
 */
export function resolveTerminalRightClickAction(_options: {
  selectCopy: boolean;
  shiftKey: boolean;
  hasSelection?: boolean;
}): TerminalRightClickAction {
  return "menu";
}

export type TerminalKeyAction = "copy" | "paste" | "none";

/**
 * Keyboard shortcut routing inside the terminal (Windows Terminal/iTerm2
 * style): Ctrl/Cmd+V and Ctrl/Cmd+Shift+V paste, Ctrl/Cmd+C copies when a
 * selection exists and otherwise stays untouched so it keeps reaching the
 * remote shell as SIGINT.
 */
export function resolveTerminalKeyAction(options: { mod: boolean; shiftKey: boolean; key: string; hasSelection: boolean }): TerminalKeyAction {
  const key = options.key.toLowerCase();
  if (options.mod && key === "v") return "paste";
  if (options.mod && key === "c" && options.hasSelection) return "copy";
  return "none";
}

/**
 * Motty context-menu chords that were previously display-only in DW:
 * clear screen, split right/down. History is handled separately
 * (`isHistoryOverlayShortcut` → Ctrl/Cmd+Shift+H).
 *
 * Platform defaults mirror Motty:
 * - Win/Linux: Ctrl+K, Ctrl+Shift+D (right), Ctrl+Shift+E (down)
 * - macOS: ⌘K, ⌘D (right), ⌘⇧D (down)
 */
export type TerminalMottyMenuShortcut = "clear" | "split-right" | "split-down" | "none";

export function resolveTerminalMottyMenuShortcut(options: {
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  key: string;
  applePlatform: boolean;
}): TerminalMottyMenuShortcut {
  if (options.altKey) return "none";
  const key = options.key.toLowerCase();
  if (options.applePlatform) {
    if (!options.metaKey) return "none";
    if (!options.shiftKey && key === "k") return "clear";
    if (!options.shiftKey && key === "d") return "split-right";
    if (options.shiftKey && key === "d") return "split-down";
    return "none";
  }
  if (!options.ctrlKey) return "none";
  if (!options.shiftKey && key === "k") return "clear";
  if (options.shiftKey && key === "d") return "split-right";
  if (options.shiftKey && key === "e") return "split-down";
  return "none";
}

/** Right-side labels for Motty menu chords (space-separated Motty style). */
export function terminalMottyShortcutLabels(applePlatform: boolean): {
  copy: string;
  paste: string;
  clear: string;
  splitRight: string;
  splitDown: string;
  history: string;
} {
  if (applePlatform) {
    return {
      copy: "⌘ C",
      paste: "⌘ V",
      clear: "⌘ K",
      splitRight: "⌘ D",
      splitDown: "⌘ Shift D",
      history: "⌘ Shift H",
    };
  }
  return {
    copy: "Ctrl C",
    paste: "Ctrl V",
    clear: "Ctrl K",
    splitRight: "Ctrl Shift D",
    splitDown: "Ctrl Shift E",
    history: "Ctrl Shift H",
  };
}

/** Whether the browser runs on Apple hardware（Cmd 是主修饰键，electerm 同判定）。 */
export function isApplePlatform(userAgent: string = navigator.userAgent): boolean {
  return /mac/i.test(userAgent);
}

/**
 * 全选快捷键判定（electerm/iTerm2 同款）：Apple 平台 Cmd+A 直选，其余平台
 * Ctrl+Shift+A。裸 Ctrl+A 永不命中——必须继续发给 readline 当"跳行首"。
 */
export function isTerminalSelectAllShortcut(options: { mod: boolean; shiftKey: boolean; metaKey: boolean; key: string; applePlatform: boolean }): boolean {
  const key = options.key.toLowerCase();
  if (key !== "a") return false;
  if (options.mod && options.shiftKey) return true;
  return options.applePlatform && options.metaKey;
}

export interface TerminalSearchOptions {
  caseSensitive: boolean;
  regex: boolean;
  wholeWord: boolean;
}

export const TERMINAL_SEARCH_OPTIONS_KEY = "ssh-terminal-search-options";
const TERMINAL_SEARCH_SEED_MAX_LENGTH = 200;

/**
 * Search toggle persistence: the stored shape is a JSON object; anything
 * malformed (or a missing entry) falls back to the all-off defaults instead
 * of throwing or leaking stale partial state.
 */
export function sanitizeSearchOptions(raw: string | null): TerminalSearchOptions {
  let parsed: unknown;
  try {
    parsed = raw == null ? undefined : JSON.parse(raw);
  } catch {
    parsed = undefined;
  }
  const source = (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;
  return {
    caseSensitive: source.caseSensitive === true,
    regex: source.regex === true,
    wholeWord: source.wholeWord === true,
  };
}

export function persistSearchOptions(options: TerminalSearchOptions): void {
  try {
    uiStorage.setItem(TERMINAL_SEARCH_OPTIONS_KEY, JSON.stringify(options));
  } catch {
    // localStorage unavailable: the toggles stay session-scoped.
  }
}

/**
 * Search seed from the current terminal selection (iTerm2 "find selected
 * text"): only the first line is kept and clamped to a bounded length, so a
 * huge or multiline selection cannot turn into an unusable query.
 */
export function terminalSearchSeedFromSelection(selection: string): string {
  const firstLine = selection.split(/\r?\n/, 1)[0] ?? "";
  return firstLine.slice(0, TERMINAL_SEARCH_SEED_MAX_LENGTH);
}

/**
 * Whether a file dropped onto the terminal pane can be uploaded right now.
 * Mirrors the SFTP pane's drop gate: needs an active writable session, and a
 * running file transfer protocol (ZMODEM or trzsz) owns the terminal data
 * path so drops are refused while one is busy.
 */
export function canAcceptTerminalDrop(options: { connected: boolean; canWrite: boolean; transferBusy: boolean }): boolean {
  return options.connected && options.canWrite && !options.transferBusy;
}

/**
 * Target directory typed into the terminal drop prompt: whitespace is
 * trimmed, trailing slashes collapse (the bare root "/" stays intact), and
 * an empty result means the input is unusable so the caller can keep the
 * confirm button disabled. The sidecar's normalize_remote_path is the final
 * authority — this only shapes the input before joinRemote().
 */
export function normalizeDropTargetDir(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith("/")) return trimmed;
  const collapsed = trimmed.replace(/\/+$/, "");
  return collapsed || "/";
}
