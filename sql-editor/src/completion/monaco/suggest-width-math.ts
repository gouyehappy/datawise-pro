/** 弹层最小/最大宽度（px）；上限再与视口比例取小 */
export const SUGGEST_WIDTH_MIN = 240
export const SUGGEST_WIDTH_MAX = 560
export const SUGGEST_WIDTH_VIEWPORT_RATIO = 0.58

/** 图标 + 内边距 + 分隔 + 状态栏余量 */
export const SUGGEST_CHROME_PX = 56
/** 名称旁 detail 与右侧 description 之间的间隙 */
export const SUGGEST_GAP_PX = 12

/** Node 测试 / 无 canvas 时的等宽近似（约 12px） */
const FALLBACK_CHAR_PX = 7.2

let measureCanvas: {getContext: (id: '2d') => {font: string; measureText: (t: string) => {width: number}} | null} | null =
    null

function measureTextWidth(text: string, font: string): number {
    if (!text) return 0
    if (typeof document === 'undefined') {
        return text.length * FALLBACK_CHAR_PX
    }
    try {
        if (!measureCanvas) measureCanvas = document.createElement('canvas')
        const ctx = measureCanvas.getContext('2d')
        if (!ctx) return text.length * FALLBACK_CHAR_PX
        ctx.font = font
        return ctx.measureText(text).width
    } catch {
        return text.length * FALLBACK_CHAR_PX
    }
}

/**
 * 根据一行文案估算所需宽度（名称 + 旁注 + 右侧徽标）。
 * 不依赖 monaco，便于 Node 单测。
 */
export function estimateSuggestRowWidthPx(parts: {
    label?: string
    detail?: string
    description?: string
    font?: string
}): number {
    const font = parts.font ?? '500 12px ui-monospace, monospace'
    const labelW = measureTextWidth(parts.label ?? '', font)
    const detailW = measureTextWidth(parts.detail ?? '', font)
    const descW = measureTextWidth(parts.description ?? '', font)
    const gaps =
        (parts.detail ? SUGGEST_GAP_PX : 0) + (parts.description ? SUGGEST_GAP_PX + 10 : 0)
    return Math.ceil(labelW + detailW + descW + gaps + SUGGEST_CHROME_PX)
}

export function clampSuggestWidgetWidth(px: number, viewportWidth = 1280): number {
    const cap = Math.min(SUGGEST_WIDTH_MAX, Math.floor(viewportWidth * SUGGEST_WIDTH_VIEWPORT_RATIO))
    return Math.max(SUGGEST_WIDTH_MIN, Math.min(cap, Math.ceil(px)))
}
