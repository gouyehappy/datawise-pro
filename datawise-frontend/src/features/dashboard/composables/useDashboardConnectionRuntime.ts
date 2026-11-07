import {computed, ref} from 'vue'
import {settingsApi} from '@/api'
import type {SystemMetricsSnapshot} from '@/shared/api/types'
import type {DashboardConnectionRow} from '@/features/dashboard/services/dashboard-summary.service'
import {
    buildDashboardRuntimeOverview,
    enrichDashboardConnections,
    type DashboardConnectionHealthRow,
    type DashboardRuntimeOverview,
} from '@/features/dashboard/services/dashboard-connection-runtime.service'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import {t} from '@/i18n'

export function useDashboardConnectionRuntime(getConnections: () => DashboardConnectionRow[]) {
    const metrics = ref<SystemMetricsSnapshot | null>(null)
    const metricsLoading = ref(false)
    const metricsError = ref<string | null>(null)

    const enrichedConnections = computed<DashboardConnectionHealthRow[]>(() =>
        enrichDashboardConnections(getConnections(), metrics.value),
    )

    const runtimeOverview = computed<DashboardRuntimeOverview>(() =>
        buildDashboardRuntimeOverview(getConnections(), metrics.value, metricsError.value),
    )

    async function refreshRuntimeMetrics() {
        if (metricsLoading.value) return
        metricsLoading.value = true
        metricsError.value = null
        try {
            metrics.value = await settingsApi.fetchMetrics()
        } catch (error) {
            metrics.value = null
            metricsError.value = resolveCaughtApiErrorMessage(error, t, 'dashboard.runtimeMetricsUnavailable')
        } finally {
            metricsLoading.value = false
        }
    }

    return {
        enrichedConnections,
        runtimeOverview,
        metricsLoading,
        refreshRuntimeMetrics,
    }
}
