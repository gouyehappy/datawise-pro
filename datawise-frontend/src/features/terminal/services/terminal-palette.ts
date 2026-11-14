/**
 * 终端调色板（附录 D 例外）。
 * xterm canvas/WebGL 无法解析 CSS 变量，须用具体色值；
 * CSS 侧通过 --dw-terminal-* 同步同一套常量（variables.css）。
 *
 * AURA-X: [Add] - P2C/P5 终端色盘单点收敛
 * Protection: 功能完整性已验证，无简化行为
 * 人格: [@前端艺术家]
 */

export const TERMINAL_PALETTE = {
  /** Align with dark `--dw-bg-editor` (near-black content well). */
  bg: '#000000',
  fg: '#d1d5db',
  border: '#2d3340',
  inputBg: '#000000',
  cursor: '#16a34a',
  cursorAccent: '#000000',
  selectionBg: '#264f78',
} as const

/** xterm.js theme 片段（concrete hex only） */
export function buildXtermTheme() {
  return {
    background: TERMINAL_PALETTE.bg,
    foreground: TERMINAL_PALETTE.fg,
    cursor: TERMINAL_PALETTE.cursor,
    cursorAccent: TERMINAL_PALETTE.cursorAccent,
    selectionBackground: TERMINAL_PALETTE.selectionBg,
  }
}
