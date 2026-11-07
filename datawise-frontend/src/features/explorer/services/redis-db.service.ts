/** Redis default logical database count (0–15). */
export const REDIS_DB_MAX = 15

export function parseRedisDbIndex(value: string | number | undefined | null): number {
    if (value == null || value === '') return 0
    const parsed = typeof value === 'number' ? value : Number.parseInt(String(value).trim(), 10)
    if (!Number.isFinite(parsed) || parsed < 0) return 0
    return Math.min(parsed, REDIS_DB_MAX)
}

export function redisDbOptions(max = REDIS_DB_MAX): number[] {
    return Array.from({length: max + 1}, (_, index) => index)
}

export function formatRedisDbLabel(index: number): string {
    return `DB${index}`
}

/** 围绕当前库号生成少量快捷选项，避免下拉展示全部 0–15。 */
export function redisDbQuickPicks(current: number, max = REDIS_DB_MAX, span = 5): number[] {
    const size = Math.max(3, Math.min(span, max + 1))
    const half = Math.floor(size / 2)
    let start = Math.max(0, current - half)
    let end = Math.min(max, start + size - 1)
    start = Math.max(0, end - size + 1)
    return Array.from({length: end - start + 1}, (_, index) => start + index)
}

export function clampRedisDbIndex(value: number, max = REDIS_DB_MAX): number {
    if (!Number.isFinite(value) || value < 0) return 0
    return Math.min(Math.trunc(value), max)
}

/** 严格解析输入框中的库号；非法输入返回 null。 */
export function parseRedisDbInput(value: string): number | null {
    const trimmed = value.trim()
    if (!/^\d+$/.test(trimmed)) return null
    const parsed = Number.parseInt(trimmed, 10)
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > REDIS_DB_MAX) return null
    return parsed
}
