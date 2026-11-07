import {readStoredEditorSettings} from '@/features/settings/services/editor-settings.service'
import {
    clampSlowQueryThresholdMs,
    DEFAULT_SLOW_QUERY_THRESHOLD_MS,
    filterSlowSqlLogs,
    isSlowDurationMs,
    isSlowSqlLog,
    parseLogDurationMs,
    SLOW_QUERY_THRESHOLD_MAX,
    SLOW_QUERY_THRESHOLD_MIN,
} from '@/features/workspace/services/slow-query.utils'

export {
    clampSlowQueryThresholdMs,
    DEFAULT_SLOW_QUERY_THRESHOLD_MS,
    filterSlowSqlLogs,
    isSlowDurationMs,
    isSlowSqlLog,
    parseLogDurationMs,
    SLOW_QUERY_THRESHOLD_MAX,
    SLOW_QUERY_THRESHOLD_MIN,
}

export function resolveSlowQueryThresholdMs(): number {
    return clampSlowQueryThresholdMs(readStoredEditorSettings().slowQueryThresholdMs)
}

export function isSlowDuration(durationMs: number, thresholdMs = resolveSlowQueryThresholdMs()): boolean {
    return isSlowDurationMs(durationMs, thresholdMs)
}
