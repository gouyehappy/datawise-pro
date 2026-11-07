import {onMounted, onUnmounted, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {
    extractDashboardConnections,
} from '@/features/dashboard/services/dashboard-summary.service'
import {
    collectConnectionHealthAlerts,
    resolveProbeIntervalMs,
} from '@/features/explorer/services/connection-health-alert.service'
import {dispatchConnectionHealthAlert} from '@/features/layout/services/app-alert.actions'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useNotificationStore} from '@/features/layout/stores/notification-store'

/**
 * 定时同步已温热连接池状态，并仅探测「当前已连接」的数据源健康。
 * 不会主动 connect / reconnect；空闲回收后只同步 UI（需用户手动重连）。
 * 长时间休眠唤醒由 {@link useAppWakeResume} 统一处理，这里只做常规探活。
 */
export function useConnectionHealthMonitor() {
    const {t} = useI18n()
    const appConfig = useAppConfigStore()
    const explorer = useExplorerStore()
    const layout = useLayoutStore()
    const notifications = useNotificationStore()

    let timer: ReturnType<typeof setInterval> | null = null

    function notifyAlerts(before: Record<string, 'ok' | 'error'>) {
        const prefs = appConfig.connectionHealthPreferences
        if (!prefs) return
        const rows = extractDashboardConnections(explorer.tree, explorer.connectionDisplayHealthById)
        const alerts = collectConnectionHealthAlerts(
            before,
            rows,
            prefs,
        )
        for (const row of alerts) {
            void dispatchConnectionHealthAlert(row, prefs, {
                showToast: (message) => layout.showErrorToast(message),
                toastMessage: t('dashboard.connectionHealthFailed', {name: row.name}),
                pushNotification: (input) => notifications.push(input),
            })
        }
    }

    async function tick(notifyOnFailure: boolean) {
        await explorer.syncPooledConnectionState({notifyIdleDisconnect: notifyOnFailure})
        if (!explorer.pooledConnectionIds.size) return
        const before = {...explorer.connectionDisplayHealthById}
        await explorer.probeAllConnectionHealth()
        if (notifyOnFailure) notifyAlerts(before)
    }

    function startTimer() {
        if (timer) clearInterval(timer)
        const minutes = appConfig.connectionHealthPreferences?.probeIntervalMinutes ?? 5
        const ms = resolveProbeIntervalMs(minutes)
        timer = setInterval(() => {
            if (document.visibilityState !== 'visible') return
            void tick(true)
        }, ms)
    }

    onMounted(() => {
        void explorer.syncPooledConnectionState()
        startTimer()
    })

    watch(() => appConfig.connectionHealthPreferences?.probeIntervalMinutes, startTimer)

    onUnmounted(() => {
        if (timer) clearInterval(timer)
    })
}
