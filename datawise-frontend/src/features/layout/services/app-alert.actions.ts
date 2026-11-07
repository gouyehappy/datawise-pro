import type {SqlLogEntry} from '@/core/types'
import type {DashboardConnectionRow} from '@/features/dashboard/services/dashboard-summary.service'
import {
    buildSlowQueryAlertParams,
    shouldAlertSlowQuery,
    shouldPersistAlertInDrawer,
} from '@/features/layout/services/app-alert.service'
import type {ConnectionHealthPreferences} from '@/shared/config/app-config.types'
import {parseLogDurationMs} from '@/features/workspace/services/slow-query.utils'

export async function dispatchConnectionHealthAlert(
    row: DashboardConnectionRow,
    prefs: ConnectionHealthPreferences,
    deps: {
        showToast: (message: string) => void
        toastMessage: string
        pushNotification: (input: {
            category: 'workspace'
            titleKey: string
            bodyKey: string
            params?: Record<string, string | number>
        }) => Promise<void>
    },
) {
    if (prefs.alertsEnabled) {
        deps.showToast(deps.toastMessage)
    }
    if (!shouldPersistAlertInDrawer(prefs)) return
    await deps.pushNotification({
        category: 'workspace',
        titleKey: 'alertConnectionHealth',
        bodyKey: 'alertConnectionHealth',
        params: {name: row.name},
    })
}

export async function dispatchSlowQueryAlertIfNeeded(
    log: SqlLogEntry,
    thresholdMs: number,
    prefs: ConnectionHealthPreferences,
    deps: {
        showToast: (message: string) => void
        toastMessage: string
        pushNotification: (input: {
            category: 'workspace'
            titleKey: string
            bodyKey: string
            params?: Record<string, string | number>
        }) => Promise<void>
    },
    connectionLabel?: string,
) {
    const durationMs = parseLogDurationMs(log)
    if (!shouldAlertSlowQuery(durationMs, thresholdMs, prefs)) return

    if (prefs.alertsEnabled) {
        deps.showToast(deps.toastMessage)
    }
    if (!shouldPersistAlertInDrawer(prefs)) return
    await deps.pushNotification({
        category: 'workspace',
        titleKey: 'alertSlowQuery',
        bodyKey: 'alertSlowQuery',
        params: buildSlowQueryAlertParams(log, thresholdMs, connectionLabel),
    })
}
