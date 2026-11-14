import {computed, ref} from 'vue'
import type {ComposerTranslation} from 'vue-i18n'
import type {TreeNode} from '@/core/types'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import {resolveRestoreWizardContext, loadRestoreWizardFile, type RestoreWizardContext, type RestoreWizardFileState} from '@/features/explorer/services/restore-wizard.service'
import {resolveRestoreWizardMessageKey} from '@/features/explorer/services/restore-wizard-messages'
import {resolveExplorerFeatureMessageKey} from '@/features/explorer/services/explorer-feature-messages'
import {canDdlConnection, canDmlConnection} from '@/features/team/services/connection-access.service'
import {resolveProductionApprovalTeams} from '@/features/team/services/production-approval-policy.service'
import {executeSqlFileContent} from '@/features/explorer/services/run-sql-file.service'
import type {useAuthStore} from '@/features/auth/stores/auth-store'
import type {useExplorerStore} from '@/features/explorer/stores/explorer'
import type {useLayoutStore} from '@/features/layout/stores/layout'
import type {useTeamStore} from '@/features/team/stores/team-store'

export interface ExplorerRestoreWizardDeps {
    t: ComposerTranslation
    explorer: ReturnType<typeof useExplorerStore>
    layout: ReturnType<typeof useLayoutStore>
    auth: ReturnType<typeof useAuthStore>
    teamStore: ReturnType<typeof useTeamStore>
    findConnectionId: (node: TreeNode) => string | undefined
    findConnectionLabel: (connectionId?: string) => string | undefined
}

export function useExplorerRestoreWizard(deps: ExplorerRestoreWizardDeps) {
    const {t, explorer, layout, auth, teamStore, findConnectionId, findConnectionLabel} = deps

    const showRestoreWizard = ref(false)
    const restoreWizardContext = ref<RestoreWizardContext | null>(null)
    const restoreWizardFileState = ref<RestoreWizardFileState | null>(null)
    const restoreWizardLoadingFile = ref(false)
    const restoreWizardExecuting = ref(false)
    const restoreWizardApprovalError = ref('')
    const restoreWizardApprovalSubmitting = ref(false)
    const restoreWizardActionError = ref('')

    function openRestoreWizard(node: TreeNode) {
        if (node.type !== 'database') return
        const connectionId = findConnectionId(node)
        const ctx = resolveRestoreWizardContext(
            explorer.tree,
            node,
            connectionId ? findConnectionLabel(connectionId) : undefined,
        )
        if (!ctx) {
            layout.showErrorToast(t(resolveRestoreWizardMessageKey('contextMissing')))
            return
        }
        restoreWizardContext.value = ctx
        restoreWizardFileState.value = null
        restoreWizardApprovalError.value = ''
        restoreWizardActionError.value = ''
        showRestoreWizard.value = true
    }

    const restoreWizardCanWrite = computed(() => {
        const id = restoreWizardContext.value?.connectionId
        return id ? canDmlConnection(id, teamStore.teams) : false
    })

    const restoreWizardCanDdl = computed(() => {
        const id = restoreWizardContext.value?.connectionId
        return id ? canDdlConnection(id, teamStore.teams) : false
    })

    const restoreWizardProductionApprovalTeams = computed(() => {
        const ctx = restoreWizardContext.value
        const file = restoreWizardFileState.value
        if (!ctx || !file) return []
        return resolveProductionApprovalTeams({
            env: ctx.env,
            sql: file.sql,
            connectionId: ctx.connectionId,
            teams: teamStore.teams,
        })
    })

    async function pickRestoreWizardFile() {
        restoreWizardLoadingFile.value = true
        restoreWizardApprovalError.value = ''
        restoreWizardActionError.value = ''
        try {
            const loaded = await loadRestoreWizardFile()
            if (!loaded) {
                return
            }
            restoreWizardFileState.value = loaded
        } catch {
            restoreWizardActionError.value = t(resolveRestoreWizardMessageKey('readFailed'))
        } finally {
            restoreWizardLoadingFile.value = false
        }
    }

    async function confirmRestoreWizardExecute() {
        const ctx = restoreWizardContext.value
        const file = restoreWizardFileState.value
        if (!ctx || !file || restoreWizardExecuting.value) return
        if (auth.isGuest) {
            restoreWizardActionError.value = t(resolveRestoreWizardMessageKey('guestDenied'))
            return
        }
        restoreWizardExecuting.value = true
        restoreWizardActionError.value = ''
        try {
            const ok = await executeSqlFileContent({
                tree: explorer.tree,
                databaseNode: {id: ctx.databaseNodeId, label: ctx.database},
                connectionName: ctx.connectionLabel,
                sql: file.sql,
                fileName: file.fileName,
                statusPrefix: 'restoreWizard',
                notifyStarted: false,
            })
            if (ok) {
                showRestoreWizard.value = false
                layout.notifyQuiet({
                    category: 'workspace',
                    titleKey: 'operationDone',
                    bodyKey: 'operationDone',
                    params: {
                        detail: t(resolveRestoreWizardMessageKey('done'), {
                            name: file.fileName,
                            count: file.preflight.statementCount,
                        }),
                    },
                })
            } else {
                restoreWizardActionError.value = t(resolveRestoreWizardMessageKey('failed'))
            }
        } catch {
            restoreWizardActionError.value = t(resolveRestoreWizardMessageKey('failed'))
        } finally {
            restoreWizardExecuting.value = false
        }
    }

    async function submitRestoreWizardProductionApproval(teamId: string) {
        const ctx = restoreWizardContext.value
        const file = restoreWizardFileState.value
        if (!ctx || !file) return
        restoreWizardApprovalSubmitting.value = true
        restoreWizardApprovalError.value = ''
        try {
            await teamStore.submitProductionApproval(teamId, {
                connectionId: ctx.connectionId,
                connectionName: ctx.connectionLabel,
                database: ctx.database,
                sql: file.sql,
            })
            showRestoreWizard.value = false
            layout.notifyQuiet({
              category: 'workspace',
              titleKey: 'approvalDone',
              bodyKey: 'approvalDone',
              params: {detail: t(resolveExplorerFeatureMessageKey('productionApprovalSubmitted'))},
            })
        } catch (error) {
            restoreWizardApprovalError.value =
                resolveCaughtApiErrorMessage(error, t, 'console.productionApproval.submitFailed')
        } finally {
            restoreWizardApprovalSubmitting.value = false
        }
    }

    return {
        showRestoreWizard,
        restoreWizardContext,
        restoreWizardFileState,
        restoreWizardLoadingFile,
        restoreWizardExecuting,
        restoreWizardApprovalError,
        restoreWizardApprovalSubmitting,
        restoreWizardActionError,
        restoreWizardCanWrite,
        restoreWizardCanDdl,
        restoreWizardProductionApprovalTeams,
        openRestoreWizard,
        pickRestoreWizardFile,
        confirmRestoreWizardExecute,
        submitRestoreWizardProductionApproval,
    }
}
