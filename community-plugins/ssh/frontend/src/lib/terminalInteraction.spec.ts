import { describe, expect, it } from "vitest";
import { canAcceptTerminalDrop, isApplePlatform, isTerminalSelectAllShortcut, normalizeDropTargetDir, resolveTerminalKeyAction, resolveTerminalMottyMenuShortcut, resolveTerminalRightClickAction, sanitizeClickCursorEnabled, sanitizeSearchOptions, sanitizeSelectCopyEnabled, terminalMottyShortcutLabels, terminalSearchSeedFromSelection } from "./terminalInteraction";

describe("terminal interaction preferences (select-to-copy / right-click-paste)", () => {
  it("defaults select-to-copy to enabled and only honors an explicit 'false'", () => {
    expect(sanitizeSelectCopyEnabled(null)).toBe(true);
    expect(sanitizeSelectCopyEnabled("")).toBe(true);
    expect(sanitizeSelectCopyEnabled("true")).toBe(true);
    expect(sanitizeSelectCopyEnabled("garbage")).toBe(true);
    expect(sanitizeSelectCopyEnabled("false")).toBe(false);
  });

  it("defaults click-to-move-cursor to enabled and only honors an explicit 'false'", () => {
    expect(sanitizeClickCursorEnabled(null)).toBe(true);
    expect(sanitizeClickCursorEnabled("false")).toBe(false);
  });

  it("always opens the Motty-style menu (paste is a menu item / Ctrl+V)", () => {
    expect(resolveTerminalRightClickAction({ selectCopy: true, shiftKey: false, hasSelection: true })).toBe("menu");
    expect(resolveTerminalRightClickAction({ selectCopy: true, shiftKey: false, hasSelection: false })).toBe("menu");
    expect(resolveTerminalRightClickAction({ selectCopy: true, shiftKey: false })).toBe("menu");
    expect(resolveTerminalRightClickAction({ selectCopy: true, shiftKey: true })).toBe("menu");
    expect(resolveTerminalRightClickAction({ selectCopy: false, shiftKey: false })).toBe("menu");
    expect(resolveTerminalRightClickAction({ selectCopy: false, shiftKey: true })).toBe("menu");
  });
});

describe("terminal keyboard shortcuts (copy/paste routing)", () => {
  it("routes Ctrl/Cmd+Shift+C with a selection to copy and without one to none", () => {
    expect(resolveTerminalKeyAction({ mod: true, shiftKey: true, key: "c", hasSelection: true })).toBe("copy");
    expect(resolveTerminalKeyAction({ mod: true, shiftKey: true, key: "C", hasSelection: true })).toBe("copy");
    // No selection: nothing to copy; the chord must not reach the remote shell either.
    expect(resolveTerminalKeyAction({ mod: true, shiftKey: true, key: "c", hasSelection: false })).toBe("none");
    // Plain Ctrl+Shift+C without the modifier is untouched.
    expect(resolveTerminalKeyAction({ mod: false, shiftKey: true, key: "c", hasSelection: true })).toBe("none");
  });

  it("routes select-all to Cmd+A on Apple platforms and Ctrl+Shift+A elsewhere", () => {
    // Apple: bare Cmd+A selects; Ctrl+Shift+A also matches (harmless superset).
    expect(isTerminalSelectAllShortcut({ mod: true, shiftKey: false, metaKey: true, key: "a", applePlatform: true })).toBe(true);
    expect(isTerminalSelectAllShortcut({ mod: true, shiftKey: true, metaKey: false, key: "a", applePlatform: true })).toBe(true);
    // Non-Apple: bare Ctrl+A must reach readline (line start), only +Shift selects.
    expect(isTerminalSelectAllShortcut({ mod: true, shiftKey: false, metaKey: false, key: "a", applePlatform: false })).toBe(false);
    expect(isTerminalSelectAllShortcut({ mod: true, shiftKey: true, metaKey: false, key: "a", applePlatform: false })).toBe(true);
    // Meta+A on non-Apple (Super+A) is left to the desktop, and other keys never match.
    expect(isTerminalSelectAllShortcut({ mod: true, shiftKey: false, metaKey: true, key: "a", applePlatform: false })).toBe(false);
    expect(isTerminalSelectAllShortcut({ mod: true, shiftKey: false, metaKey: true, key: "v", applePlatform: true })).toBe(false);
  });

  it("detects Apple platforms from the user agent", () => {
    expect(isApplePlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe(true);
    expect(isApplePlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(false);
    expect(isApplePlatform("Mozilla/5.0 (X11; Linux x86_64)")).toBe(false);
  });

  it("routes plain Ctrl/Cmd+C with a selection to copy (Windows Terminal / iTerm2 semantics)", () => {
    expect(resolveTerminalKeyAction({ mod: true, shiftKey: false, key: "c", hasSelection: true })).toBe("copy");
    expect(resolveTerminalKeyAction({ mod: true, shiftKey: false, key: "C", hasSelection: true })).toBe("copy");
  });

  it("keeps plain Ctrl/Cmd+C without a selection as shell input (SIGINT)", () => {
    expect(resolveTerminalKeyAction({ mod: true, shiftKey: false, key: "c", hasSelection: false })).toBe("none");
  });

  it("routes both Ctrl+V and Ctrl/Cmd+Shift+V to paste", () => {
    expect(resolveTerminalKeyAction({ mod: true, shiftKey: false, key: "v", hasSelection: false })).toBe("paste");
    expect(resolveTerminalKeyAction({ mod: true, shiftKey: true, key: "V", hasSelection: false })).toBe("paste");
    expect(resolveTerminalKeyAction({ mod: false, shiftKey: true, key: "v", hasSelection: false })).toBe("none");
  });
});

describe("Motty menu shortcut chords", () => {
  const win = { ctrlKey: true, metaKey: false, altKey: false, applePlatform: false };
  const mac = { ctrlKey: false, metaKey: true, altKey: false, applePlatform: true };

  it("maps Win/Linux clear + split chords", () => {
    expect(resolveTerminalMottyMenuShortcut({ ...win, shiftKey: false, key: "k" })).toBe("clear");
    expect(resolveTerminalMottyMenuShortcut({ ...win, shiftKey: true, key: "d" })).toBe("split-right");
    expect(resolveTerminalMottyMenuShortcut({ ...win, shiftKey: true, key: "e" })).toBe("split-down");
    expect(resolveTerminalMottyMenuShortcut({ ...win, shiftKey: true, key: "p" })).toBe("none");
    expect(resolveTerminalMottyMenuShortcut({ ...win, shiftKey: false, key: "d" })).toBe("none");
  });

  it("maps macOS Motty split chords (⌘D / ⌘⇧D) and clear", () => {
    expect(resolveTerminalMottyMenuShortcut({ ...mac, shiftKey: false, key: "k" })).toBe("clear");
    expect(resolveTerminalMottyMenuShortcut({ ...mac, shiftKey: false, key: "d" })).toBe("split-right");
    expect(resolveTerminalMottyMenuShortcut({ ...mac, shiftKey: true, key: "d" })).toBe("split-down");
    expect(resolveTerminalMottyMenuShortcut({ ...mac, shiftKey: true, key: "e" })).toBe("none");
  });

  it("ignores Alt and leaves copy/paste/select-all chords alone", () => {
    expect(resolveTerminalMottyMenuShortcut({ ...win, shiftKey: false, altKey: true, key: "k" })).toBe("none");
    expect(resolveTerminalMottyMenuShortcut({ ...win, shiftKey: true, key: "a" })).toBe("none");
    expect(resolveTerminalMottyMenuShortcut({ ...win, shiftKey: false, key: "c" })).toBe("none");
    expect(resolveTerminalMottyMenuShortcut({ ...win, shiftKey: false, key: "v" })).toBe("none");
  });

  it("formats Motty-style menu labels per platform", () => {
    expect(terminalMottyShortcutLabels(false).splitRight).toBe("Ctrl Shift D");
    expect(terminalMottyShortcutLabels(false).history).toBe("Ctrl Shift H");
    expect(terminalMottyShortcutLabels(true).splitRight).toBe("⌘ D");
    expect(terminalMottyShortcutLabels(true).splitDown).toBe("⌘ Shift D");
  });
});

describe("terminal search option persistence", () => {
  it("falls back to all-off defaults for missing or malformed storage", () => {
    expect(sanitizeSearchOptions(null)).toEqual({ caseSensitive: false, regex: false, wholeWord: false });
    expect(sanitizeSearchOptions("")).toEqual({ caseSensitive: false, regex: false, wholeWord: false });
    expect(sanitizeSearchOptions("not json {")).toEqual({ caseSensitive: false, regex: false, wholeWord: false });
    expect(sanitizeSearchOptions('{"caseSensitive":"yes"}')).toEqual({ caseSensitive: false, regex: false, wholeWord: false });
  });

  it("honors only strict true flags and drops unknown fields", () => {
    expect(sanitizeSearchOptions('{"caseSensitive":true,"wholeWord":true,"hacker":1}')).toEqual({ caseSensitive: true, regex: false, wholeWord: true });
    expect(sanitizeSearchOptions('{"regex":true}')).toEqual({ caseSensitive: false, regex: true, wholeWord: false });
  });
});

describe("terminal search seed from selection", () => {
  it("keeps the first line and clamps it to a bounded length", () => {
    expect(terminalSearchSeedFromSelection("")).toBe("");
    expect(terminalSearchSeedFromSelection("hello world")).toBe("hello world");
    expect(terminalSearchSeedFromSelection("first\r\nsecond")).toBe("first");
    expect(terminalSearchSeedFromSelection("first\nsecond\nthird")).toBe("first");
    expect(terminalSearchSeedFromSelection("a".repeat(500)).length).toBe(200);
  });
});

describe("terminal drop acceptance", () => {
  it("requires a connected, writable session with no file transfer protocol owning the stream", () => {
    expect(canAcceptTerminalDrop({ connected: true, canWrite: true, transferBusy: false })).toBe(true);
    expect(canAcceptTerminalDrop({ connected: false, canWrite: true, transferBusy: false })).toBe(false);
    expect(canAcceptTerminalDrop({ connected: true, canWrite: false, transferBusy: false })).toBe(false);
    expect(canAcceptTerminalDrop({ connected: true, canWrite: true, transferBusy: true })).toBe(false);
  });
});

describe("terminal drop prompt target directory", () => {
  it("treats blank input as unusable so the confirm button stays disabled", () => {
    expect(normalizeDropTargetDir("")).toBeNull();
    expect(normalizeDropTargetDir("   ")).toBeNull();
    expect(normalizeDropTargetDir("\t / \n")).toBe("/");
  });

  it("collapses trailing slashes while keeping the bare root intact", () => {
    expect(normalizeDropTargetDir("/")).toBe("/");
    expect(normalizeDropTargetDir("//")).toBe("/");
    expect(normalizeDropTargetDir("/data/uploads/")).toBe("/data/uploads");
    expect(normalizeDropTargetDir("/data/uploads///")).toBe("/data/uploads");
  });

  it("keeps ordinary paths and inner slashes untouched", () => {
    expect(normalizeDropTargetDir("/var/log")).toBe("/var/log");
    expect(normalizeDropTargetDir("  /home/user/uploads  ")).toBe("/home/user/uploads");
  });
});
