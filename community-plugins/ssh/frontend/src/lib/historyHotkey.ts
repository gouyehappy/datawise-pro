/**
 * 命令历史热键（Warp Command Search 式 Ctrl+R）的纯函数层。
 *
 * 迁移前 dw 只有 Ctrl/Cmd+Shift+H 一个入口（`historyPanel.ts:isHistoryOverlayShortcut`），
 * 命令面板里 `"session.reconnect"` 显示的 `"Ctrl+R"` 是一行**没有实际绑定**的
 * 死文案。dbx 的 `terminalHotkeys.ts` 把 Ctrl+R 作为 command-history 默认键，
 * 并在 `historyPanel.ts:commandHistoryHotkeyPassthrough` 里用生产事故（#108）
 * 钉死了两条必须透传远端的场景——本模块按同一范式迁移：
 *
 *  1. 总开关关闭：Ctrl+R 归还 readline 原生 reverse-i-search，不再被吞键；
 *  2. alternate 屏（vim/less/tmux）：Ctrl+R 是 redo / copy-mode，绝不抢。
 *
 * dw 额外保留自己的 #150 门：交互提示待答（OTP/密码/堡垒机选目标）时透传，
 * 否则 ^R 控制字符会打进密码输入。
 *
 * 判定与派发分离：本模块只回答「这个 chord 该 open / passthrough / 忽略」，
 * 面板打开动作仍由 App.vue 的 `toggleHistoryPanel()` 承担（它已内置聚焦搜索框）。
 */

export interface HistoryHotkeyModifiers {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/**
 * 历史面板热键：Ctrl/Cmd+Shift+H（既有）+ Ctrl/Cmd+R（新增）。
 * 刻意不认裸 R / Shift+R / Alt 组合，避免与正常输入和 readline 冲突。
 */
export function isCommandHistoryHotkey(options: HistoryHotkeyModifiers): boolean {
  if (options.altKey) return false;
  if (!(options.ctrlKey || options.metaKey)) return false;
  if (options.shiftKey) return options.key === "h" || options.key === "H";
  return options.key === "r" || options.key === "R";
}

/**
 * 热键在门关闭时是否**透传远端而非吞键**（dbx #108 反馈二）。
 * - 总开关关闭：用户要的就是 readline 原生 reverse-i-search；
 * - alternate 屏：vim 的 Ctrl+R 是 redo，less/tmux copy-mode 同理。
 * 其余门关闭场景（传输占用/交互提示/浮层已开）不在此判定：传输时放行 ^R
 * 会污染 zmodem/trzsz 字节流，交互提示待答时会把控制字符打进 OTP——
 * 这些由 `resolveHistoryHotkeyAction` 的独立门处理。
 */
export function commandHistoryHotkeyPassthrough(input: {
  enabled: boolean;
  alternateActive: boolean;
}): boolean {
  return !input.enabled || input.alternateActive;
}

export type HistoryHotkeyAction = "open" | "passthrough" | "none";

/** 唯一的派发决策点。`none` = 不是历史热键，交给后续按键链继续处理。 */
export function resolveHistoryHotkeyAction(input: {
  modifiers: HistoryHotkeyModifiers;
  connected: boolean;
  enabled: boolean;
  alternateActive: boolean;
  interactivePromptPending: boolean;
}): HistoryHotkeyAction {
  if (!input.connected || !isCommandHistoryHotkey(input.modifiers)) return "none";
  if (commandHistoryHotkeyPassthrough({
    enabled: input.enabled,
    alternateActive: input.alternateActive,
  })) return "passthrough";
  // #150：MFA/密码/select 待答时 ^R 必须落到远端，不能被本地面板吞掉。
  if (input.interactivePromptPending) return "passthrough";
  return "open";
}
