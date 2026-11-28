import { describe, expect, it } from "vitest";
import { commandHintAllowed, commandHintPickingOverlayOpen, type CommandHintGateState } from "./commandHintVisibility";

const IDLE: CommandHintGateState = {
  enabled: true,
  suggestionListVisible: false,
  completionVisible: false,
  historyPanelVisible: false,
  quickPaletteVisible: false,
  commandPaletteVisible: false,
};

describe("commandHintVisibility", () => {
  it("默认允许显示（开关开 + 无任何选择浮层）", () => {
    expect(commandHintAllowed(IDLE)).toBe(true);
    expect(commandHintPickingOverlayOpen(IDLE)).toBe(false);
  });

  it("设置开关关闭时一律隐藏，且不受选择浮层状态影响", () => {
    expect(commandHintAllowed({ ...IDLE, enabled: false })).toBe(false);
    expect(commandHintAllowed({ ...IDLE, enabled: false, suggestionListVisible: true })).toBe(false);
  });

  it("每个可交互选择浮层单独打开都会让只读提示让位", () => {
    const keys: (keyof CommandHintGateState)[] = [
      "suggestionListVisible",
      "completionVisible",
      "historyPanelVisible",
      "quickPaletteVisible",
      "commandPaletteVisible",
    ];
    for (const key of keys) {
      const state = { ...IDLE, [key]: true };
      expect(commandHintPickingOverlayOpen(state)).toBe(true);
      expect(commandHintAllowed(state)).toBe(false);
    }
  });

  it("多个选择浮层叠加仍然只让位一次（不会出现两个提示框）", () => {
    expect(commandHintAllowed({
      ...IDLE,
      suggestionListVisible: true,
      historyPanelVisible: true,
      quickPaletteVisible: true,
    })).toBe(false);
  });

  it("选择浮层关闭后自动恢复（关掉联想列表即回来）", () => {
    expect(commandHintAllowed({ ...IDLE, suggestionListVisible: true })).toBe(false);
    expect(commandHintAllowed(IDLE)).toBe(true);
  });

  it("纯函数不修改入参", () => {
    const state = { ...IDLE };
    commandHintAllowed(state);
    commandHintPickingOverlayOpen(state);
    expect(state).toEqual(IDLE);
  });
});
