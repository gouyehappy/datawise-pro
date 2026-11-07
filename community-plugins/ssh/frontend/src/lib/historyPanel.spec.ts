import { describe, expect, it } from "vitest";
import { clampHistoryIndex, filterHistory, isHistoryOverlayShortcut, mergeRemoteHistory, resolveHistoryPanelKey } from "./historyPanel";
import { isBastionMenuContext } from "./bastionContext";

describe("resolveHistoryPanelKey", () => {
  const base = { ctrlKey: false, metaKey: false, altKey: false };
  it("maps arrows, confirm, run, remove, pin and cancel", () => {
    expect(resolveHistoryPanelKey({ ...base, key: "ArrowUp" })).toEqual({ action: "move", delta: 1 });
    expect(resolveHistoryPanelKey({ ...base, key: "ArrowDown" })).toEqual({ action: "move", delta: -1 });
    expect(resolveHistoryPanelKey({ ...base, key: "Enter" })).toEqual({ action: "confirm" });
    expect(resolveHistoryPanelKey({ ...base, key: "Tab" })).toEqual({ action: "confirm" });
    expect(resolveHistoryPanelKey({ ...base, key: "Enter", ctrlKey: true })).toEqual({ action: "confirm-run" });
    expect(resolveHistoryPanelKey({ ...base, key: "Delete" })).toEqual({ action: "remove" });
    expect(resolveHistoryPanelKey({ ...base, key: "p", ctrlKey: true })).toEqual({ action: "pin" });
    expect(resolveHistoryPanelKey({ ...base, key: "Escape" })).toEqual({ action: "cancel" });
    expect(resolveHistoryPanelKey({ ...base, key: "ArrowUp", ctrlKey: true })).toEqual({ action: "ignore" });
  });
});

describe("isHistoryOverlayShortcut", () => {
  it("matches Ctrl/Cmd+R and ignores Shift/Alt", () => {
    expect(isHistoryOverlayShortcut({ key: "r", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })).toBe(true);
    expect(isHistoryOverlayShortcut({ key: "R", ctrlKey: false, metaKey: true, altKey: false, shiftKey: false })).toBe(true);
    expect(isHistoryOverlayShortcut({ key: "r", ctrlKey: true, metaKey: false, altKey: false, shiftKey: true })).toBe(false);
  });
});

describe("filter and clamp", () => {
  it("fzf-ranks subsequence hits and clamps arrows", () => {
    const history = [
      { command: "ls" },
      { command: "cd /tmp" },
      { command: "ls -la" },
      { command: "kubectl get pods -A", pinned: true },
    ];
    const lsHits = filterHistory(history, "ls").map((e) => e.command);
    expect(lsHits[0]).toBe("ls");
    expect(lsHits).toContain("ls -la");
    expect(filterHistory(history, "kgp")[0]?.command).toMatch(/kubectl get pods/);
    expect(clampHistoryIndex(3, -1, 1)).toBe(0);
    expect(clampHistoryIndex(0, 0, 1)).toBe(-1);
  });
});

describe("mergeRemoteHistory", () => {
  it("dedupes and drops bastion noise", () => {
    expect(
      mergeRemoteHistory([{ command: "ls" }], ["No PTY requested.", "pwd", "#1712345678"], 10).map((e) => e.command),
    ).toEqual(["pwd", "ls"]);
  });
});

describe("isBastionMenuContext", () => {
  it("detects JumpServer menus without a shell prompt", () => {
    expect(isBastionMenuContext("Opt> ")).toBe(true);
    expect(isBastionMenuContext("Welcome to JumpServer\nOpt> ")).toBe(true);
    expect(isBastionMenuContext("root@k8s-121:~# ls")).toBe(false);
  });
});
