import type {DashboardConnectionRow} from '@/features/dashboard/services/dashboard-summary.service'
import {isStatelessConnector} from '@/features/explorer/services/explorer-connection-state.service'
import type {ConnectionHealthPreferences} from '@/shared/config/app-config.types'

export function resolveProbeIntervalMs(
    minutes: ConnectionHealthPreferences['probeIntervalMinutes'],
): number {
    return minutes * 60 * 1000
}

export function isConnectionWatched(
    connectionId: string,
    prefs: ConnectionHealthPreferences,
): boolean {
    if (!prefs.watchedConnectionIds.length) return true
    return prefs.watchedConnectionIds.includes(connectionId)
}

export function isConnectionWatchedInUi(
    connectionId: string,
    allConnectionIds: readonly string[],
    prefs: ConnectionHealthPreferences,
): boolean {
    if (!prefs.watchedConnectionIds.length) return true
    return prefs.watchedConnectionIds.includes(connectionId)
}

export function toggleWatchedConnectionId(
    connectionId: string,
    allConnectionIds: readonly string[],
    prefs: ConnectionHealthPreferences,
): string[] {
    const effective = prefs.watchedConnectionIds.length
        ? prefs.watchedConnectionIds
        : [...allConnectionIds]
    const next = effective.includes(connectionId)
        ? effective.filter((id) => id !== connectionId)
        : [...effective, connectionId]
    if (next.length >= allConnectionIds.length) return []
    return next
}

/** 用户实际用过连接后，若监视列表为子集则自动加入。空列表表示「全部监视」，无需变更。 */
export function ensureWatchedConnectionId(
    connectionId: string,
    prefs: ConnectionHealthPreferences,
): string[] | null {
    if (!connectionId) return null
    if (!prefs.watchedConnectionIds.length) return null
    if (prefs.watchedConnectionIds.includes(connectionId)) return null
    return [...prefs.watchedConnectionIds, connectionId]
}

export function shouldAlertConnectionTransition(
    before: 'ok' | 'error' | undefined,
    after: DashboardConnectionRow['status'],
    prefs: ConnectionHealthPreferences,
): boolean {
    if (!prefs.alertsEnabled) return false
    if (after !== 'error') return false
    if (before === 'ok' && prefs.alertOnOkToError) return true
    if (before === undefined && prefs.alertOnUnknownToError) return true
    return false
}

export function collectConnectionHealthAlerts(
    before: Record<string, 'ok' | 'error'>,
    rows: readonly DashboardConnectionRow[],
    prefs: ConnectionHealthPreferences,
): DashboardConnectionRow[] {
    const alerts: DashboardConnectionRow[] = []
    for (const row of rows) {
        if (isStatelessConnector(row.dbType)) continue
        if (!isConnectionWatched(row.id, prefs)) continue
        if (shouldAlertConnectionTransition(before[row.id], row.status, prefs)) {
            alerts.push(row)
        }
    }
    return alerts
}
