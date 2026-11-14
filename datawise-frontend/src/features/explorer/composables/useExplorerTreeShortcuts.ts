import {onMounted, onUnmounted, type Ref} from 'vue'
import type {ComposerTranslation} from 'vue-i18n'
import type {TreeNode} from '@/core/types'
import {
    buildDatabaseConsoleContext,
    createNewSqlEditor,
    openBlankSqlConsole,
    openLatestSqlEditor,
    type DatabaseConsoleContext,
} from '@/features/explorer/services/sql-editor-actions.service'
import {mapDatabaseShortcutToSqlEditorAction} from '@/features/explorer/services/sql-editor-menu-actions'
import {
    resolveExplorerDeleteShortcutUiPlan,
    resolveShortcutEditCommand,
    resolveShortcutOpenCommand,
} from '@/features/explorer/services/explorer-shortcut-commands.service'
import {canDdlConnection} from '@/features/team/services/connection-access.service'
import {isExplorerUiBlocking} from '@/features/explorer/services/explorer-context-menu-builders.service'
import {resolveExplorerFeatureMessageKey} from '@/features/explorer/services/explorer-feature-messages'
import {
    registerExplorerDatabaseShortcutHandler,
    type ExplorerDatabaseShortcutAction,
} from '@/features/explorer/services/explorer-database-shortcuts.service'
import {
    clearExplorerNodeShortcutHandlers,
    registerExplorerNodeShortcutHandlers,
} from '@/features/explorer/services/explorer-node-shortcuts.service'
import {
    canRunExplorerContextMenuAction,
} from '@/features/explorer/services/explorer-context-menu-permission.service'
import {useCommunityPluginContributionStore} from '@/features/community-plugin/stores/community-plugin-contributions'
import type {useExplorerStore} from '@/features/explorer/stores/explorer'
import type {useLayoutStore} from '@/features/layout/stores/layout'
import type {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import type {useTeamStore} from '@/features/team/stores/team-store'
import type {useDatasourceCatalogStore} from '@/features/datasource/stores/datasource-catalog'

export interface ExplorerTreeShortcutsDeps {
    t: ComposerTranslation
    explorer: ReturnType<typeof useExplorerStore>
    workspace: ReturnType<typeof useWorkspaceStore>
    layout: ReturnType<typeof useLayoutStore>
    teamStore: ReturnType<typeof useTeamStore>
    catalogStore: ReturnType<typeof useDatasourceCatalogStore>
    findConnectionId: (node: TreeNode) => string | undefined
    findConnectionLabel: (connectionId?: string) => string | undefined
    onOpen: (node: TreeNode) => void | Promise<void>
    openTableFromNode: (node: TreeNode, tableView?: 'properties' | 'data' | 'ddl') => void
    menuVisible: Ref<boolean>
    treeInline: Ref<unknown>
    showDeleteSqlDialog: Ref<boolean>
    showDeleteProjectFileDialog: Ref<boolean>
    showRecentSqlDialog: Ref<boolean>
    showTableActionDialog: Ref<boolean>
    showDeleteDatabaseDialog: Ref<boolean>
    showDeleteCatalogDialog: Ref<boolean>
    showSqlExportWizard: Ref<boolean>
    showRestoreWizard: Ref<boolean>
    showRenameViewModelDialog: Ref<boolean>
    showDeleteViewModelDialog: Ref<boolean>
    showMigrateViewModelDialog: Ref<boolean>
    showRenameSshScriptRecordDialog: Ref<boolean>
    showDeleteSshScriptRecordDialog: Ref<boolean>
    pendingDeleteDatabase: Ref<TreeNode | null>
    pendingTableAction: Ref<{
        type: 'truncate' | 'delete'
        node: TreeNode
        message: string
    } | null>
    pendingSqlFileNode: Ref<TreeNode | null>
    deleteSqlMessage: Ref<string>
    pendingProjectFileNode: Ref<TreeNode | null>
    deleteProjectFileMessage: Ref<string>
    pendingDeleteCatalogNode: Ref<TreeNode | null>
    recentSqlContext: Ref<DatabaseConsoleContext | null>
}

export function useExplorerTreeShortcuts(deps: ExplorerTreeShortcutsDeps) {
    const {
        t,
        explorer,
        workspace,
        layout,
        teamStore,
        catalogStore,
        findConnectionId,
        findConnectionLabel,
        onOpen,
        openTableFromNode,
        menuVisible,
        treeInline,
        showDeleteSqlDialog,
        showDeleteProjectFileDialog,
        showRecentSqlDialog,
        showTableActionDialog,
        showDeleteDatabaseDialog,
        showDeleteCatalogDialog,
        showSqlExportWizard,
        showRestoreWizard,
        showRenameViewModelDialog,
        showDeleteViewModelDialog,
        showMigrateViewModelDialog,
        showRenameSshScriptRecordDialog,
        showDeleteSshScriptRecordDialog,
        pendingDeleteDatabase,
        pendingTableAction,
        pendingSqlFileNode,
        deleteSqlMessage,
        pendingProjectFileNode,
        deleteProjectFileMessage,
        pendingDeleteCatalogNode,
        recentSqlContext,
    } = deps

    function isExplorerDialogOpen(): boolean {
        return isExplorerUiBlocking({
            menuVisible: menuVisible.value,
            treeInline: Boolean(treeInline.value),
            showDeleteSqlDialog: showDeleteSqlDialog.value,
            showDeleteProjectFileDialog: showDeleteProjectFileDialog.value,
            showRecentSqlDialog: showRecentSqlDialog.value,
            showTableActionDialog: showTableActionDialog.value,
            showDeleteDatabaseDialog: showDeleteDatabaseDialog.value,
            showDeleteCatalogDialog: showDeleteCatalogDialog.value,
            showSqlExportWizard: showSqlExportWizard.value,
            showRestoreWizard: showRestoreWizard.value,
            showRenameViewModelDialog: showRenameViewModelDialog.value,
            showDeleteViewModelDialog: showDeleteViewModelDialog.value,
            showMigrateViewModelDialog: showMigrateViewModelDialog.value,
            showRenameSshScriptRecordDialog: showRenameSshScriptRecordDialog.value,
            showDeleteSshScriptRecordDialog: showDeleteSshScriptRecordDialog.value,
        })
    }

    function runShortcutOpenSelected() {
        if (isExplorerDialogOpen()) return
        if (!canRunExplorerContextMenuAction('open')) return
        const node = explorer.selectedNode
        if (!node) return
        const command = resolveShortcutOpenCommand(node)
        if (command.type === 'open-connection-form') {
            workspace.openConnectionForm(command.dbType, {
                connectionId: command.connectionId,
                connectionName: command.connectionName,
            })
            return
        }
        void onOpen(node)
    }

    function runShortcutEditSelected() {
        if (isExplorerDialogOpen()) return
        const node = explorer.selectedNode
        if (!node) return
        if (!canRunExplorerContextMenuAction('edit', {nodeType: node.type})) return
        const command = resolveShortcutEditCommand(node)
        if (command?.type === 'open-table-properties') {
            explorer.selectNode(node.id)
            openTableFromNode(node, 'properties')
            return
        }
        if (command?.type === 'open-connection-form') {
            workspace.openConnectionForm(command.dbType, {
                connectionId: command.connectionId,
                connectionName: command.connectionName,
            })
        }
    }

    function runShortcutDeleteSelected() {
        if (isExplorerDialogOpen()) return
        const node = explorer.selectedNode
        if (!node) return

        const plan = resolveExplorerDeleteShortcutUiPlan(node)
        if (!plan) return

        if (plan.kind === 'delete-database') {
            if (!canRunExplorerContextMenuAction(plan.permissionAction, {nodeType: node.type})) return
            const connectionId = findConnectionId(node)
            if (!connectionId || !canDdlConnection(connectionId, teamStore.teams)) {
                layout.showErrorToast(t(resolveExplorerFeatureMessageKey('createNamespaceAccessDenied')))
                return
            }
            pendingDeleteDatabase.value = node
            showDeleteDatabaseDialog.value = true
            return
        }

        if (!canRunExplorerContextMenuAction(plan.permissionAction, {nodeType: node.type})) return

        if (plan.kind === 'delete-table') {
            pendingTableAction.value = {
                type: 'delete',
                node,
                message: t(plan.messageKey, {name: node.label}),
            }
            showTableActionDialog.value = true
            return
        }

        if (plan.kind === 'delete-sql-file') {
            pendingSqlFileNode.value = node
            deleteSqlMessage.value = t(plan.messageKey, {name: node.label})
            showDeleteSqlDialog.value = true
            return
        }

        if (plan.kind === 'delete-project-file') {
            pendingProjectFileNode.value = node
            deleteProjectFileMessage.value = t(plan.messageKey, {name: node.label})
            showDeleteProjectFileDialog.value = true
            return
        }

        pendingDeleteCatalogNode.value = node
        showDeleteCatalogDialog.value = true
    }

    function runDatabaseShortcutAction(action: ExplorerDatabaseShortcutAction) {
        if (isExplorerDialogOpen()) return
        const node = explorer.selectedNode
        if (!node || node.type !== 'database') return

        const sqlEditorAction = mapDatabaseShortcutToSqlEditorAction(action)
        const connectionId = findConnectionId(node)
        if (!connectionId) return
        const connectionName = findConnectionLabel(connectionId)
        if (sqlEditorAction === 'show-recent') {
            void buildDatabaseConsoleContext(explorer.tree, node, connectionName)
                .then((ctx) => {
                    if (!ctx) return
                    recentSqlContext.value = ctx
                    showRecentSqlDialog.value = true
                })
            return
        }
        layout.setModule('database')
        const openEditor = sqlEditorAction === 'open-latest'
            ? openLatestSqlEditor
            : sqlEditorAction === 'create-new'
                ? createNewSqlEditor
                : openBlankSqlConsole
        void openEditor(explorer.tree, node, connectionName)
            .catch(() => layout.showErrorToast(t(resolveExplorerFeatureMessageKey('loadSqlFileFailed'))))
    }

    function onCommunityPluginChanged() {
        void useCommunityPluginContributionStore().refresh()
    }

    onMounted(() => {
        void catalogStore.ensureLoaded().catch(() => undefined)
        useCommunityPluginContributionStore().ensureLoaded()
        window.addEventListener('dw-community-plugin-changed', onCommunityPluginChanged)
        registerExplorerNodeShortcutHandlers({
            openSelected: runShortcutOpenSelected,
            editSelected: runShortcutEditSelected,
            deleteSelected: runShortcutDeleteSelected,
        })
        registerExplorerDatabaseShortcutHandler(runDatabaseShortcutAction)
    })

    onUnmounted(() => {
        window.removeEventListener('dw-community-plugin-changed', onCommunityPluginChanged)
        clearExplorerNodeShortcutHandlers()
        registerExplorerDatabaseShortcutHandler(null)
    })

    return {
        isExplorerDialogOpen,
        runShortcutOpenSelected,
        runShortcutEditSelected,
        runShortcutDeleteSelected,
        runDatabaseShortcutAction,
    }
}
