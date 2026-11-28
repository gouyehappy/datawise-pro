import { describe, expect, it } from "vitest";
import {
  commandHistoryHotkeyPassthrough,
  isCommandHistoryHotkey,
  resolveHistoryHotkeyAction,
  type HistoryHotkeyModifiers,
} from "./historyHotkey";

function chord(patch: Partial<HistoryHotkeyModifiers> = {}): HistoryHotkeyModifiers {
  return { key: "r", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, ...patch };
}

function action(patch: Partial<Parameters<typeof resolveHistoryHotkeyAction>[0]> = {}) {
  return resolveHistoryHotkeyAction({
    modifiers: chord(),
    connected: true,
    enabled: true,
    alternateActive: false,
    interactivePromptPending: false,
    ...patch,
  });
}

describe("isCommandHistoryHotkey", () => {
  it("recognizes the new Ctrl/Cmd+R entrance", () => {
    expect(isCommandHistoryHotkey(chord())).toBe(true);
    expect(isCommandHistoryHotkey(chord({ key: "R" }))).toBe(true);
    expect(isCommandHistoryHotkey(chord({ ctrlKey: false, metaKey: true }))).toBe(true);
  });

  it("keeps the existing Ctrl/Cmd+Shift+H entrance", () => {
    expect(isCommandHistoryHotkey(chord({ key: "h", shiftKey: true }))).toBe(true);
    expect(isCommandHistoryHotkey(chord({ key: "H", shiftKey: true, ctrlKey: false, metaKey: true }))).toBe(true);
  });

  it("rejects bare keys and modifier combinations that belong to the shell", () => {
    expect(isCommandHistoryHotkey(chord({ ctrlKey: false }))).toBe(false);
    expect(isCommandHistoryHotkey(chord({ altKey: true }))).toBe(false);
    expect(isCommandHistoryHotkey(chord({ key: "h" }))).toBe(false);
    expect(isCommandHistoryHotkey(chord({ key: "r", shiftKey: true }))).toBe(false);
    expect(isCommandHistoryHotkey(chord({ key: "f" }))).toBe(false);
    expect(isCommandHistoryHotkey(chord({ key: "p", shiftKey: true }))).toBe(false);
  });
});

describe("commandHistoryHotkeyPassthrough (dbx #108)", () => {
  it("master switch off: hand Ctrl+R back to readline reverse-i-search", () => {
    expect(commandHistoryHotkeyPassthrough({ enabled: false, alternateActive: false })).toBe(true);
  });

  it("alternate buffer: vim/less/tmux own Ctrl+R (redo / copy-mode)", () => {
    expect(commandHistoryHotkeyPassthrough({ enabled: true, alternateActive: true })).toBe(true);
  });

  it("normal prompt with history enabled: the local panel may own the key", () => {
    expect(commandHistoryHotkeyPassthrough({ enabled: true, alternateActive: false })).toBe(false);
  });
});

describe("resolveHistoryHotkeyAction", () => {
  it("normal prompt: opens the history panel (focus lands in its search box)", () => {
    expect(action()).toBe("open");
  });

  it("Ctrl+Shift+H takes the same path", () => {
    expect(action({ modifiers: chord({ key: "h", shiftKey: true }) })).toBe("open");
  });

  it("disconnected: ignored so the chord can reach other handlers", () => {
    expect(action({ connected: false })).toBe("none");
  });

  it("unrelated chord: ignored", () => {
    expect(action({ modifiers: chord({ key: "a" }) })).toBe("none");
  });

  it("history disabled: passthrough (not swallowed) — fixes the old dead-key behaviour", () => {
    expect(action({ enabled: false })).toBe("passthrough");
  });

  it("alternate buffer: passthrough even when history is enabled", () => {
    expect(action({ alternateActive: true })).toBe("passthrough");
  });

  it("issue #150: MFA/password/select prompt pending → ^R reaches the remote", () => {
    expect(action({ interactivePromptPending: true })).toBe("passthrough");
  });

  it("passthrough wins over open when several gates are closed at once", () => {
    expect(action({ enabled: false, alternateActive: true, interactivePromptPending: true })).toBe("passthrough");
  });
});
