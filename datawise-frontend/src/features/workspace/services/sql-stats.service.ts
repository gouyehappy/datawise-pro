export type {
    SlowSqlEntry,
    SqlExecutionStats,
    SqlStatsQuery,
    SqlStatsTrendPoint,
} from '@/shared/api/types'

export function formatDurationMs(durationMs: number): string {
    if (durationMs >= 1000) {
        return `${(durationMs / 1000).toFixed(1)}s`
    }
    return `${durationMs}ms`
}

export function truncateSql(sql: string, max = 120): string {
    const normalized = sql.replace(/\s+/g, ' ').trim()
    if (normalized.length <= max) return normalized
    return `${normalized.slice(0, max)}…`
}
