import { describe, expect, it } from "vitest";
import {
  filterPaletteCommands,
  groupPaletteCommands,
  isCommandPaletteShortcut,
  type PaletteCommand,
} from "./commandPalette";

const commands: PaletteCommand[] = [
  { id: "a", label: "Find in terminal", group: "Terminal", aliases: "find search 查找", shortcut: "Ctrl+F", run: () => {} },
  { id: "b", label: "Clear terminal", group: "Terminal", aliases: "clear cls 清屏", shortcut: "", run: () => {} },
  { id: "c", label: "Open settings", group: "Settings", aliases: "settings 设置", shortcut: "", run: () => {} },
];

describe("isCommandPaletteShortcut", () => {
  it("matches Ctrl/Cmd+Shift+P only", () => {
    expect(isCommandPaletteShortcut({ key: "p", ctrlKey: true, shiftKey: true, metaKey: false, altKey: false })).toBe(true);
    expect(isCommandPaletteShortcut({ key: "P", ctrlKey: false, shiftKey: true, metaKey: true, altKey: false })).toBe(true);
  });
  it("rejects plain Ctrl+P, Alt and non-keydown", () => {
    expect(isCommandPaletteShortcut({ key: "p", ctrlKey: true, shiftKey: false, metaKey: false, altKey: false })).toBe(false);
    expect(isCommandPaletteShortcut({ key: "p", ctrlKey: true, shiftKey: true, metaKey: false, altKey: true })).toBe(false);
    expect(isCommandPaletteShortcut({ type: "keyup", key: "p", ctrlKey: true, shiftKey: true, metaKey: false, altKey: false })).toBe(false);
  });
});

describe("filterPaletteCommands", () => {
  it("returns all when query is empty", () => {
    expect(filterPaletteCommands(commands, "").map((c) => c.id)).toEqual(["a", "b", "c"]);
  });
  it("matches label and aliases (English + Chinese)", () => {
    expect(filterPaletteCommands(commands, "clear").map((c) => c.id)).toContain("b");
    expect(filterPaletteCommands(commands, "设置").map((c) => c.id)).toContain("c");
    expect(filterPaletteCommands(commands, "查找").map((c) => c.id)).toContain("a");
  });
  it("returns empty for no match", () => {
    expect(filterPaletteCommands(commands, "zzzznotpresent")).toEqual([]);
  });
});

describe("groupPaletteCommands", () => {
  it("buckets commands by group preserving order", () => {
    const groups = groupPaletteCommands(commands);
    expect(groups.map((g) => g.group)).toEqual(["Terminal", "Settings"]);
    expect(groups[0].items.map((c) => c.id)).toEqual(["a", "b"]);
  });
});
