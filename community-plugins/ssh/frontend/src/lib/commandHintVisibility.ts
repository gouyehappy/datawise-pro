/**
 * 命令输入提示浮层（`.command-hint-dock`）的显示门。
 *
 * 这个浮层里是**只读信息条**：参数提示 / 输入行语法体检 / 风险分级 /
 * 远端 --help。而命令-历史联想列表、Fig 补全菜单、Ctrl+R 历史面板等是
 * **可交互选择浮层**：用户正在 ↑↓ / Tab / Enter 选命令时，只读提示既挡地方
 * 又没有意义，两个框同屏尤其难看（用户反馈「参数提示跟历史命令提示框同时
 * 出现，出现 2 个提示框不好看」）。
 *
 * 策略：**只读提示让位给可交互选择器**。任一选择浮层打开时隐藏，关掉自动
 * 回来；反过来（压掉联想列表）会破坏用户选命令，不可取。判定纯函数化，
 * 不把 App.vue 的 ref 依赖拖进逻辑层，便于单测钉死真值表。
 *
 * 与 `overlayArbiter` 的分工：仲裁器管「按键归谁」，本模块管「是否显示」。
 * 两者都必须读同一个门，否则关闭 / 互斥时 Esc 会被一个看不见的提示条吞掉。
 */
export interface CommandHintGateState {
  /** 设置总开关（设置 → 终端 → 历史与补全）。 */
  enabled: boolean;
  /** 边输入边弹的命令/历史联想列表（`.command-suggest`）。 */
  suggestionListVisible: boolean;
  /** Fig 风格参数补全菜单（`CompletionMenu`）。 */
  completionVisible: boolean;
  /** Ctrl+R 命令历史面板（`.history-overlay`）。 */
  historyPanelVisible: boolean;
  /** 快捷命令面板。 */
  quickPaletteVisible: boolean;
  /** 命令面板。 */
  commandPaletteVisible: boolean;
}

/** 是否存在「用户正在做选择」的可交互浮层。行内灰字 ghost 不算框，不纳入。 */
export function commandHintPickingOverlayOpen(state: CommandHintGateState): boolean {
  return state.suggestionListVisible
    || state.completionVisible
    || state.historyPanelVisible
    || state.quickPaletteVisible
    || state.commandPaletteVisible;
}

/** 命令提示浮层是否允许显示：开关关闭、或任一选择浮层打开时一律隐藏。 */
export function commandHintAllowed(state: CommandHintGateState): boolean {
  if (!state.enabled) return false;
  return !commandHintPickingOverlayOpen(state);
}
