import type {SqlRecentQuery} from '@sql-editor/types'

const MAX_RECENT_SUGGESTIONS = 8

function oneLinePreview(sql: string, max = 72): string {
    const line = sql.trim().replace(/\s+/g, ' ')
    return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

/** 前缀匹配：命中 SQL 文本、标签或相关表名 */
export function recentSqlMatchesPrefix(item: SqlRecentQuery, prefix: string): boolean {
    const p = prefix.trim().toLowerCase()
    if (!p) return true
    if (item.sql.toLowerCase().includes(p)) return true
    if (item.label?.toLowerCase().includes(p)) return true
    return (item.tables ?? []).some((table) => table.toLowerCase().startsWith(p))
}

/** 同连接/库优先，再按输入顺序（调用方应已按时间倒序） */
export function rankRecentSqlForSuggest(
    items: SqlRecentQuery[],
    options?: {connectionId?: string; database?: string},
): SqlRecentQuery[] {
    const conn = options?.connectionId?.toLowerCase()
    const db = options?.database?.toLowerCase()
    const scored = items.map((item, index) => {
        let score = 0
        if (conn && item.connectionId?.toLowerCase() === conn) score += 2
        if (db && item.database?.toLowerCase() === db) score += 2
        return {item, score, index}
    })
    scored.sort((a, b) => b.score - a.score || a.index - b.index)
    return scored.map((entry) => entry.item)
}

export function filterRecentSqlForSuggest(
    items: SqlRecentQuery[],
    prefix: string,
    options?: {connectionId?: string; database?: string; limit?: number},
): SqlRecentQuery[] {
    const ranked = rankRecentSqlForSuggest(items, options)
    const matched = ranked.filter((item) => recentSqlMatchesPrefix(item, prefix))
    const seen = new Set<string>()
    const out: SqlRecentQuery[] = []
    for (const item of matched) {
        const key = item.sql.trim().toLowerCase()
        if (!key || seen.has(key)) continue
        seen.add(key)
        out.push(item)
        if (out.length >= (options?.limit ?? MAX_RECENT_SUGGESTIONS)) break
    }
    return out
}

export function recentSqlSuggestLabel(item: SqlRecentQuery): string {
    return item.label?.trim() || oneLinePreview(item.sql)
}
