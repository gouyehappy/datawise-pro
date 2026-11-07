import {
    maskNonCodeRegions,
    scanLexerTo,
    type LexerCheckpoint,
    type SqlScanMode,
} from './sql-scan'

type LineCheckpointCache = {
    sql: string
    lineStarts: number[]
    checkpoints: LexerCheckpoint[]
    masked: string
}

let lineCache: LineCheckpointCache | null = null

const MASK_LRU_MAX = 12
const maskLru = new Map<string, string>()

function buildLineStarts(sql: string): number[] {
    const starts = [0]
    for (let i = 0; i < sql.length; i++) {
        if (sql[i] === '\n') starts.push(i + 1)
    }
    return starts
}

function lineIndexAt(lineStarts: number[], offset: number): number {
    let lo = 0
    let hi = lineStarts.length - 1
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1
        if (lineStarts[mid] <= offset) lo = mid
        else hi = mid - 1
    }
    return lo
}

function firstDiffIndex(a: string, b: string): number {
    const limit = Math.min(a.length, b.length)
    for (let i = 0; i < limit; i++) {
        if (a[i] !== b[i]) return i
    }
    return limit
}

function rebuildLineCache(sql: string): LineCheckpointCache {
    const lineStarts = buildLineStarts(sql)
    const checkpoints: LexerCheckpoint[] = [{mode: 'code', dollar: null}]
    let state: LexerCheckpoint = {mode: 'code', dollar: null}

    for (let line = 1; line < lineStarts.length; line++) {
        const end = lineStarts[line]
        state = scanLexerTo(sql, end, lineStarts[line - 1], state)
        checkpoints.push({mode: state.mode, dollar: state.dollar})
    }

    const masked = maskNonCodeRegions(sql)
    const entry = {sql, lineStarts, checkpoints, masked}
    lineCache = entry
    return entry
}

function syncLineCache(sql: string): LineCheckpointCache {
    if (lineCache?.sql === sql) return lineCache

    const nextLineStarts = buildLineStarts(sql)

    if (lineCache && nextLineStarts.length !== lineCache.lineStarts.length) {
        return rebuildLineCache(sql)
    }

    if (lineCache) {
        const diff = firstDiffIndex(lineCache.sql, sql)
        if (diff < sql.length || diff < lineCache.sql.length) {
            const lineIdx = lineIndexAt(lineCache.lineStarts, diff)
            const rewind = Math.max(0, lineIdx - 1)
            const lineStarts = nextLineStarts
            const checkpoints = lineCache.checkpoints.slice(0, rewind + 1)
            let state = lineCache.checkpoints[rewind]

            for (let line = rewind + 1; line < lineStarts.length; line++) {
                state = scanLexerTo(sql, lineStarts[line], lineStarts[line - 1], state)
                if (line < checkpoints.length) checkpoints[line] = {mode: state.mode, dollar: state.dollar}
                else checkpoints.push({mode: state.mode, dollar: state.dollar})
            }

            checkpoints.length = lineStarts.length
            const masked = maskNonCodeRegions(sql)
            const entry = {sql, lineStarts, checkpoints, masked}
            lineCache = entry
            return entry
        }
    }

    return rebuildLineCache(sql)
}

function touchMaskLru(sql: string, masked: string) {
    maskLru.delete(sql)
    maskLru.set(sql, masked)
    if (maskLru.size > MASK_LRU_MAX) {
        const oldest = maskLru.keys().next().value
        if (oldest) maskLru.delete(oldest)
    }
}

/** 增量词法缓存：按行记录 checkpoint，编辑时从变更行回退重算 */
export function scanModeAtCached(sql: string, offset: number): SqlScanMode {
    const safe = Math.max(0, Math.min(offset, sql.length))
    const cache = syncLineCache(sql)
    const lineIdx = lineIndexAt(cache.lineStarts, safe)
    const from = cache.lineStarts[lineIdx]
    const initial = cache.checkpoints[lineIdx]
    if (from >= safe) return initial.mode
    return scanLexerTo(sql, safe, from, initial).mode
}

/** 带 LRU + 行级增量的 mask 缓存 */
export function maskNonCodeRegionsCached(sql: string): string {
    const lruHit = maskLru.get(sql)
    if (lruHit !== undefined) return lruHit

    const cache = syncLineCache(sql)
    touchMaskLru(sql, cache.masked)
    return cache.masked
}

export function isCursorInStringOrCommentCached(sql: string, offset: number): boolean {
    return scanModeAtCached(sql, offset) !== 'code'
}

/** 测试 / 大改后清空缓存 */
export function resetIncrementalScanCache(): void {
    lineCache = null
    maskLru.clear()
}
