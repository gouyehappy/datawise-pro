import {computed, ref, watch} from 'vue'
import type {TeamAuditLog, TeamSharedAiSessionSummary} from '@/core/types'
import type {DashboardWidgetConfig} from '@/features/dashboard/services/dashboard-widget.service'
import {useTeamStore} from '@/features/team/stores/team-store'

export function useDashboardTeamWidgets(
    dashboardWidgets: () => DashboardWidgetConfig[],
) {
    const teamStore = useTeamStore()
    const auditLogs = ref<TeamAuditLog[]>([])
    const sharedAiSessions = ref<TeamSharedAiSessionSummary[]>([])
    const loading = ref(false)

    const activeTeam = computed(() =>
        teamStore.teams.find((team) => team.id === teamStore.activeTeamId) ?? null,
    )

    const needsData = computed(() =>
        dashboardWidgets().some(
            (widget) =>
                widget.visible && (widget.id === 'teamActivity' || widget.id === 'recentAnalysis'),
        ),
    )

    async function load() {
        const team = activeTeam.value
        if (!team || !needsData.value) {
            auditLogs.value = []
            sharedAiSessions.value = []
            return
        }
        loading.value = true
        try {
            const wantsAudit = dashboardWidgets().some((w) => w.visible && w.id === 'teamActivity')
            const wantsAi =
                import.meta.env.VITE_DATAWISE_EDITION !== 'standard'
                && dashboardWidgets().some((w) => w.visible && w.id === 'recentAnalysis')
            const [audit, sessions] = await Promise.all([
                wantsAudit ? teamStore.fetchAuditLogs(team.id) : Promise.resolve([] as TeamAuditLog[]),
                wantsAi
                    ? teamStore.fetchSharedAiSessions(team.id)
                    : Promise.resolve([] as TeamSharedAiSessionSummary[]),
            ])
            auditLogs.value = audit.slice(0, 8)
            sharedAiSessions.value = sessions.slice(0, 8)
        } catch {
            auditLogs.value = []
            sharedAiSessions.value = []
        } finally {
            loading.value = false
        }
    }

    watch([activeTeam, needsData], load, {immediate: true})

    return {activeTeam, auditLogs, sharedAiSessions, loading}
}
