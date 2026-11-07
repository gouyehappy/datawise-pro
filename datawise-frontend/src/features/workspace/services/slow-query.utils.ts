import type {SqlLogEntry} from '@/core/types'

export const SLOW_QUERY_THRESHOLD_MIN = 100
export const SLOW_QUERY_THRESHOLD_MAX = 600_000
export const DEFAULT_SLOW_QUERY_THRESHOLD_MS = 3000

export function clampSlowQueryThresholdMs(value: unknown): number {
    const num = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(num)) return DEFAULT_SLOW_QUERY_THRESHOLD_MS
    return Math.min(SLOW_QUERY_THRESHOLD_MAX, Math.max(SLOW_QUERY_THRESHOLD_MIN, Math.trunc(num)))
}

export function parseLogDurationMs(log: Pick<SqlLogEntry, 'duration' | 'durationMs'>): number {
    if (typeof log.durationMs === 'number' && Number.isFinite(log.durationMs)) {
        return Math.max(0, log.durationMs)
    }
    const match = log.duration.trim().match(/^(\d+(?:\.\d+)?)\s*ms$/i)
    if (!match) return 0
    const parsed = Number(match[1])
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0
}

export function isSlowDurationMs(durationMs: number, thresholdMs: number): boolean {
    return durationMs >= thresholdMs
}

export function isSlowSqlLog(
    log: Pick<SqlLogEntry, 'duration' | 'durationMs'>,
    thresholdMs: number,
): boolean {
    return isSlowDurationMs(parseLogDurationMs(log), thresholdMs)
}

export function filterSlowSqlLogs<T extends Pick<SqlLogEntry, 'duration' | 'durationMs'>>(
    logs: T[],
    thresholdMs: number,
): T[] {
    return logs.filter((log) => isSlowSqlLog(log, thresholdMs))
}
