import type {SqlLogEntry} from '@/core/types'
import type {ConnectionHealthPreferences} from '@/shared/config/app-config.types'
import {isSlowDurationMs} from '@/features/workspace/services/slow-query.utils'

export function shouldPersistAlertInDrawer(prefs: ConnectionHealthPreferences): boolean {
    return prefs.drawerAlertsEnabled !== false
}

export function shouldAlertSlowQuery(
    durationMs: number,
    thresholdMs: number,
    prefs: ConnectionHealthPreferences,
): boolean {
    if (prefs.slowQueryAlertsEnabled === false) return false
    return isSlowDurationMs(durationMs, thresholdMs)
}

export function truncateSqlPreview(sql: string, maxLength = 120): string {
    const compact = sql.replace(/\s+/g, ' ').trim()
    if (compact.length <= maxLength) return compact
    return `${compact.slice(0, maxLength - 1)}…`
}

export function formatAlertDuration(durationMs: number): string {
    if (durationMs >= 1000) return `${(durationMs / 1000).toFixed(1)}s`
    return `${durationMs}ms`
}

export function buildSlowQueryAlertParams(
    log: Pick<SqlLogEntry, 'sql' | 'durationMs' | 'duration'>,
    thresholdMs: number,
    connectionLabel?: string,
): Record<string, string | number> {
    const durationMs = typeof log.durationMs === 'number' && Number.isFinite(log.durationMs)
        ? log.durationMs
        : 0
    const params: Record<string, string | number> = {
        duration: log.duration?.trim() || formatAlertDuration(durationMs),
        threshold: thresholdMs,
        sql: truncateSqlPreview(log.sql),
    }
    if (connectionLabel?.trim()) {
        params.connection = `「${connectionLabel.trim()}」· `
    } else {
        params.connection = ''
    }
    return params
}
