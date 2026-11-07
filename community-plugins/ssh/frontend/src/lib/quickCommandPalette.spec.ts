import { describe, expect, it } from "vitest";
import {
  filterQuickPaletteItems,
  isQuickPaletteShortcut,
  resolveQuickPaletteKey,
} from "./quickCommandPalette";

describe("isQuickPaletteShortcut", () => {
  it("matches Ctrl/Cmd+; and ignores Shift/Alt", () => {
    expect(isQuickPaletteShortcut({ key: ";", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })).toBe(true);
    expect(isQuickPaletteShortcut({ key: "x", code: "Semicolon", ctrlKey: false, metaKey: true, altKey: false, shiftKey: false })).toBe(true);
    expect(isQuickPaletteShortcut({ key: ";", ctrlKey: true, metaKey: false, altKey: false, shiftKey: true })).toBe(false);
  });
});

describe("resolveQuickPaletteKey", () => {
  const base = { ctrlKey: false, metaKey: false, altKey: false };
  it("maps navigate / confirm / run / cancel", () => {
    expect(resolveQuickPaletteKey({ ...base, key: "ArrowDown" })).toEqual({ action: "move", delta: 1 });
    expect(resolveQuickPaletteKey({ ...base, key: "ArrowUp" })).toEqual({ action: "move", delta: -1 });
    expect(resolveQuickPaletteKey({ ...base, key: "Enter" })).toEqual({ action: "confirm" });
    expect(resolveQuickPaletteKey({ ...base, key: "Enter", ctrlKey: true })).toEqual({ action: "confirm-run" });
    expect(resolveQuickPaletteKey({ ...base, key: "Escape" })).toEqual({ action: "cancel" });
  });
});

describe("filterQuickPaletteItems", () => {
  const list = [
    { id: "1", name: "pods", command: "kubectl get pods -A", group: "k8s" },
    { id: "2", name: "disk", command: "df -h", group: "ops" },
    { id: "3", name: "logs", command: "docker logs -f app", group: "ops" },
  ];

  it("returns all when query empty", () => {
    expect(filterQuickPaletteItems(list, "").map((i) => i.id)).toEqual(["1", "2", "3"]);
  });

  it("ranks fuzzy subsequence hits", () => {
    const hits = filterQuickPaletteItems(list, "kgp");
    expect(hits[0]?.id).toBe("1");
    expect(filterQuickPaletteItems(list, "zzz")).toEqual([]);
  });
});
