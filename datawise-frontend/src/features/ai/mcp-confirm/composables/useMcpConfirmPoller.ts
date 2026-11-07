import {computed, onMounted, onUnmounted, ref, watch} from 'vue'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {useTeamStore} from '@/features/team/stores/team-store'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
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

    async function refresh() {
        if (disposed || !auth.sessionId) {
            pending.value = []
            return
        }
        try {
            pending.value = await listPendingMcpConfirmations()
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
                    toast.success(t('mcpConfirm.submittedApproval'))
                } else {
                    await workspace.openConsole({connectionId, database, sql, title})
                    toast.success(t('mcpConfirm.openedConsole'))
                }
            } else if (decision === 'reject') {
                toast.show(t('mcpConfirm.rejected'), {variant: 'info'})
            }
            await refresh()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : String(error))
        } finally {
            decidingId.value = null
        }
    }

    onMounted(() => {
        void refresh()
        timer = setInterval(() => {
            void refresh()
        }, POLL_MS)
    })

    onUnmounted(() => {
        disposed = true
        if (timer) clearInterval(timer)
    })

    watch(
        () => auth.sessionId,
        (id) => {
            if (id) void refresh()
            else pending.value = []
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
