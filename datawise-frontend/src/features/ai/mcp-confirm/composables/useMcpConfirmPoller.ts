import {computed, onMounted, onUnmounted, ref, watch} from 'vue'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {useTeamStore} from '@/features/team/stores/team-store'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {canAccessFeature} from '@/features/auth/services/feature-permission.service'
import {FeaturePermission} from '@/features/auth/types/feature-permission.types'
import {
    decideMcpConfirmation,
    listPendingMcpConfirmations,
} from '@/features/ai/mcp-confirm/services/mcp-confirm.api'
import {
    mcpConfirmRequiresProductionApproval,
    readMcpExecutionString,
    resolveMcpProductionApprovalTeams,
} from '@/features/ai/mcp-confirm/services/mcp-confirm-governance.service'
import type {McpConfirmTicket} from '@/features/ai/mcp-confirm/types'
import {useAppToast} from '@/features/layout/composables/useAppToast'
import {useI18n} from 'vue-i18n'
import {resolveCaughtApiErrorMessage} from '@/shared/api/http/api-error-message'

const POLL_MS = 4_000

const pending = ref<McpConfirmTicket[]>([])
const drawerOpen = ref(false)
const decidingId = ref<string | null>(null)

export function useMcpConfirmState() {
    return {
        pending: computed(() => pending.value),
        pendingCount: computed(() => pending.value.length),
        drawerOpen,
    }
}

export function useMcpConfirmPoller() {
    const auth = useAuthStore()
    const workspace = useWorkspaceStore()
    const teamStore = useTeamStore()
    const explorer = useExplorerStore()
    const toast = useAppToast()
    const {t} = useI18n()
    let timer: ReturnType<typeof setInterval> | null = null
    let disposed = false

    /** Backend `@RequiresFeature(NAV_AI)`; guests / unsigned users must not poll. */
    function canPollConfirmations(): boolean {
        return Boolean(auth.sessionId) && !auth.isGuest && canAccessFeature(FeaturePermission.NavAi)
    }

    async function refresh() {
        if (disposed || !canPollConfirmations()) {
            pending.value = []
            drawerOpen.value = false
            return
        }
        try {
            // Polling must stay silent: 403 after logout must not toast PERMISSION_DENIED.
            pending.value = await listPendingMcpConfirmations({silent: true})
            if (pending.value.length > 0 && !drawerOpen.value) {
                // Soft nudge: open drawer once when first pending arrives
                drawerOpen.value = true
            }
        } catch {
            // ignore poll errors
        }
    }

    async function decide(ticketId: string, decision: 'confirm' | 'reject') {
        decidingId.value = ticketId
        try {
            const updated = await decideMcpConfirmation(ticketId, decision)
            if (decision === 'confirm' && updated.execution?.type === 'open_console') {
                const exec = updated.execution
                const connectionId = readMcpExecutionString(exec, 'connectionId')
                const database = readMcpExecutionString(exec, 'database')
                const sql = readMcpExecutionString(exec, 'sql')
                const title = readMcpExecutionString(exec, 'title')

                if (mcpConfirmRequiresProductionApproval(exec, updated.preview) && sql && connectionId) {
                    if (teamStore.teams.length === 0) {
                        await teamStore.load()
                    }
                    const teams = resolveMcpProductionApprovalTeams(connectionId, teamStore.teams)
                    const team = teams[0]
                    if (!team) {
                        toast.error(t('mcpConfirm.approvalTeamMissing'))
                        await refresh()
                        return
                    }
                    const connectionName = explorer.findNode(connectionId)?.label
                    await teamStore.submitProductionApproval(team.teamId, {
                        connectionId,
                        connectionName,
                        database,
                        sql,
                    })
                    await workspace.openConsole({connectionId, database, sql, title})
                    toast.notify({
                      category: 'workspace',
                      titleKey: 'approvalDone',
                      bodyKey: 'approvalDone',
                      params: {detail: t('mcpConfirm.submittedApproval')},
                    })
                } else {
                    await workspace.openConsole({connectionId, database, sql, title})
                }
            } else if (decision === 'reject') {
                toast.show(t('mcpConfirm.rejected'), {variant: 'info'})
            }
            await refresh()
        } catch (error) {
            toast.error(resolveCaughtApiErrorMessage(error, t, 'mcpConfirm.decideFailed'))
        } finally {
            decidingId.value = null
        }
    }

    function startTimer() {
        if (timer || disposed) return
        timer = setInterval(() => {
            void refresh()
        }, POLL_MS)
    }

    function stopTimer() {
        if (!timer) return
        clearInterval(timer)
        timer = null
    }

    function syncPolling() {
        if (disposed) return
        if (canPollConfirmations()) {
            startTimer()
            void refresh()
        } else {
            stopTimer()
            pending.value = []
            drawerOpen.value = false
        }
    }

    onMounted(() => {
        syncPolling()
    })

    onUnmounted(() => {
        disposed = true
        stopTimer()
    })

    watch(
        () => [auth.sessionId, auth.isGuest, canAccessFeature(FeaturePermission.NavAi)] as const,
        () => {
            syncPolling()
        },
    )

    return {
        pending,
        drawerOpen,
        decidingId,
        refresh,
        decide,
        pendingCount: computed(() => pending.value.length),
    }
}
