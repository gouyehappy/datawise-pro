import {toRef} from 'vue'
import {useI18n} from 'vue-i18n'
import type {TreeNode} from '@/core/types'
import {
    resolveConnectionIdFromTree,
    resolveConnectionLabel,
} from '@/features/explorer/services/connection-tree-helpers'
import {useDataSourceFlatNodes} from '@/features/explorer/composables/useDataSourceFlatNodes'
import {
    buildPlatformWorkspaceOpenHandlers,
} from '@/features/explorer/services/explorer-platform-menu-actions.service'
import {useExplorerRestoreWizard} from '@/features/explorer/composables/useExplorerRestoreWizard'
import {useExplorerSqlExportWizard} from '@/features/explorer/composables/useExplorerSqlExportWizard'
import {useExplorerTreeDangerDialogs} from '@/features/explorer/composables/useExplorerTreeDangerDialogs'
import {useExplorerTreeInlineEdit} from '@/features/explorer/composables/useExplorerTreeInlineEdit'
import {useExplorerTreeNodeNavigation} from '@/features/explorer/composables/useExplorerTreeNodeNavigation'
import {useExplorerTreeMenuActions} from '@/features/explorer/composables/useExplorerTreeMenuActions'
import {useExplorerTreeSshActions} from '@/features/explorer/composables/useExplorerTreeSshActions'
import {useExplorerTreeCatalogDnD} from '@/features/explorer/composables/useExplorerTreeCatalogDnD'
import {useExplorerTreeContextMenu} from '@/features/explorer/composables/useExplorerTreeContextMenu'
import {useExplorerTreeShortcuts} from '@/features/explorer/composables/useExplorerTreeShortcuts'
import {useTeamStore} from '@/features/team/stores/team-store'
import {useProjectStore} from '@/features/project/stores/project'
import {useDatasourceCatalogStore} from '@/features/datasource/stores/datasource-catalog'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {useShortcutPanelStore} from '@/features/layout/stores/shortcut-panel-store'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import {tableDetailApi} from '@/api'

/** 连接树交互：选中、打开、右键菜单 */
export function useConnectionTree() {
    const {t} = useI18n()
    const explorer = useExplorerStore()
    const workspace = useWorkspaceStore()
    const layout = useLayoutStore()
    const entitlement = useEntitlementStore()
    const shortcutPanel = useShortcutPanelStore()
    const catalogStore = useDatasourceCatalogStore()
    const auth = useAuthStore()
    const teamStore = useTeamStore()
    const projectStore = useProjectStore()

    function findConnectionId(node: TreeNode): string | undefined {
        return resolveConnectionIdFromTree(explorer.tree, node.id)
    }

    function findConnectionLabel(connectionId?: string): string | undefined {
        return resolveConnectionLabel((id) => explorer.findNode(id), connectionId)
    }

    function platformWorkspaceOpenHandlers() {
        return buildPlatformWorkspaceOpenHandlers(workspace)
    }

    const {
        createSshScriptRecord,
        refreshSshScriptRecordsFolder,
        deleteSshScriptRecordFromNode,
        renameSshScriptRecordFromNode,
    } = useExplorerTreeSshActions({
        t,
        explorer,
        workspace,
        layout,
        findConnectionId,
        findConnectionLabel,
    })

    const {
        showSqlExportWizard,
        sqlExportWizardContext,
        sqlExportWizardExporting,
        sqlExportWizardActionError,
        sqlExportWizardMaxRowsDefault,
        sqlExportWizardVariant,
        sqlExportWizardIsProduction,
        openSqlExportWizard,
        confirmSqlExportWizardExport,
    } = useExplorerSqlExportWizard({
        t,
        explorer,
        layout,
        findConnectionLabel,
        tableDetailApi,
    })

    const {
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
    } = useExplorerRestoreWizard({
        t,
        explorer,
        layout,
        auth,
        teamStore,
        findConnectionId,
        findConnectionLabel,
    })

    const dialogs = useExplorerTreeDangerDialogs({
        t,
        explorer,
        workspace,
        layout,
        findConnectionId,
        deleteSshScriptRecordFromNode,
        renameSshScriptRecordFromNode,
    })
    const {
        showDeleteSqlDialog,
        deleteSqlMessage,
        showDeleteProjectFileDialog,
        deleteProjectFileMessage,
        pendingGroupNode,
        pendingSqlFileNode,
        pendingProjectFileNode,
        pendingViewModelNode,
        showRenameViewModelDialog,
        renameViewModelDefaultName,
        showDeleteViewModelDialog,
        deleteViewModelMessage,
        showRenameSshScriptRecordDialog,
        renameSshScriptRecordDefaultName,
        showDeleteSshScriptRecordDialog,
        deleteSshScriptRecordMessage,
        pendingSshScriptRecordNode,
        showMigrateViewModelDialog,
        migrateViewModelTargetTable,
        showRecentSqlDialog,
        recentSqlContext,
        showTableActionDialog,
        pendingTableAction,
        showDeleteDatabaseDialog,
        pendingDeleteDatabase,
        showDeleteCatalogDialog,
        pendingDeleteCatalogNode,
        deleteCatalogTitle,
        deleteCatalogMessage,
        deleteCatalogConfirmLabel,
        confirmTableAction,
        confirmDeleteDatabase,
        confirmDeleteCatalogNode,
        confirmDeleteSqlFile,
        confirmDeleteProjectFile,
        openViewModelMigrationFromNode,
        confirmMigrateViewModel,
        confirmRenameViewModel,
        confirmDeleteViewModel,
        confirmDeleteSshScriptRecord,
        confirmRenameSshScriptRecord,
    } = dialogs

    const inline = useExplorerTreeInlineEdit({
        t,
        explorer,
        workspace,
        layout,
        auth,
        findConnectionId,
        findConnectionLabel,
        pendingGroupNode,
        pendingSqlFileNode,
    })
    const {
        treeInline,
        onTreeInlineInput,
        commitTreeInlineEdit,
        cancelTreeInlineEdit,
        beginProjectInlineCreate,
        beginCreateRootGroup,
        beginCreateSubgroup,
        beginRenameGroup,
        beginRenameSqlFile,
        beginRenameProjectFile,
        createProjectSqlFromMenu,
        refreshProjectFilesFromMenu,
    } = inline

    const nav = useExplorerTreeNodeNavigation({
        t,
        explorer,
        workspace,
        layout,
        auth,
        shortcutPanel,
        findConnectionId,
        findConnectionLabel,
        platformWorkspaceOpenHandlers,
    })
    const {
        onSelect,
        onOpen,
        openTableFromNode,
        openViewModelConsoleFromNode,
    } = nav

    const {
        connectionDragEnabled,
        performMoveConnection,
        performMoveProjectFile,
        performReorderCatalog,
        performMoveConnectionToProject,
        performShareConnectionToProject,
    } = useExplorerTreeCatalogDnD({
        t,
        explorer,
        layout,
        auth,
        projectStore,
    })

    const {
        menuVisible,
        menuPos,
        menuItems,
        contextNode,
        closeMenu,
        onContextMenu,
    } = useExplorerTreeContextMenu({
        t,
        explorer,
        catalogStore,
        teamStore,
        projectStore,
        findConnectionId,
    })

    const {onMenuSelect} = useExplorerTreeMenuActions({
        t,
        explorer,
        workspace,
        layout,
        entitlement,
        catalogStore,
        teamStore,
        findConnectionId,
        findConnectionLabel,
        contextNode,
        closeMenu,
        pendingSqlFileNode,
        deleteSqlMessage,
        showDeleteSqlDialog,
        pendingProjectFileNode,
        deleteProjectFileMessage,
        showDeleteProjectFileDialog,
        pendingSshScriptRecordNode,
        deleteSshScriptRecordMessage,
        showDeleteSshScriptRecordDialog,
        renameSshScriptRecordDefaultName,
        showRenameSshScriptRecordDialog,
        pendingTableAction,
        showTableActionDialog,
        pendingViewModelNode,
        renameViewModelDefaultName,
        showRenameViewModelDialog,
        deleteViewModelMessage,
        showDeleteViewModelDialog,
        recentSqlContext,
        showRecentSqlDialog,
        pendingDeleteDatabase,
        showDeleteDatabaseDialog,
        pendingDeleteCatalogNode,
        showDeleteCatalogDialog,
        openViewModelMigrationFromNode,
        createProjectSqlFromMenu,
        beginProjectInlineCreate,
        beginRenameProjectFile,
        refreshProjectFilesFromMenu,
        beginCreateSubgroup,
        beginRenameGroup,
        beginRenameSqlFile,
        onOpen,
        openTableFromNode,
        openViewModelConsoleFromNode,
        openSqlExportWizard,
        openRestoreWizard,
        platformWorkspaceOpenHandlers,
        createSshScriptRecord,
        refreshSshScriptRecordsFolder,
        performMoveConnection,
        performMoveProjectFile,
        performMoveConnectionToProject,
        performShareConnectionToProject,
    })

    useExplorerTreeShortcuts({
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
    })

    const flatNodes = useDataSourceFlatNodes(toRef(explorer, 'debouncedSearchQuery')).flatNodes

    return {
        explorer,
        flatNodes,
        menuVisible,
        menuPos,
        menuItems,
        showDeleteSqlDialog,
        deleteSqlMessage,
        showDeleteProjectFileDialog,
        deleteProjectFileMessage,
        treeInline,
        onTreeInlineInput,
        commitTreeInlineEdit,
        cancelTreeInlineEdit,
        beginCreateRootGroup,
        showRecentSqlDialog,
        recentSqlContext,
        showTableActionDialog,
        pendingTableAction,
        showDeleteDatabaseDialog,
        pendingDeleteDatabase,
        showDeleteCatalogDialog,
        pendingDeleteCatalogNode,
        deleteCatalogTitle,
        deleteCatalogMessage,
        deleteCatalogConfirmLabel,
        confirmDeleteCatalogNode,
        showSqlExportWizard,
        sqlExportWizardContext,
        sqlExportWizardExporting,
        sqlExportWizardActionError,
        sqlExportWizardMaxRowsDefault,
        sqlExportWizardVariant,
        sqlExportWizardIsProduction,
        confirmSqlExportWizardExport,
        showRestoreWizard,
        restoreWizardContext,
        restoreWizardFileState,
        restoreWizardLoadingFile,
        restoreWizardExecuting,
        restoreWizardCanWrite,
        restoreWizardCanDdl,
        restoreWizardProductionApprovalTeams,
        restoreWizardApprovalError,
        restoreWizardApprovalSubmitting,
        restoreWizardActionError,
        pickRestoreWizardFile,
        confirmRestoreWizardExecute,
        submitRestoreWizardProductionApproval,
        onSelect,
        onOpen,
        onContextMenu,
        closeMenu,
        onMenuSelect,
        confirmDeleteSqlFile,
        confirmDeleteProjectFile,
        performMoveConnection,
        performReorderCatalog,
        confirmTableAction,
        confirmDeleteDatabase,
        showRenameViewModelDialog,
        renameViewModelDefaultName,
        showDeleteViewModelDialog,
        deleteViewModelMessage,
        showMigrateViewModelDialog,
        migrateViewModelTargetTable,
        confirmRenameViewModel,
        confirmDeleteViewModel,
        confirmMigrateViewModel,
        showRenameSshScriptRecordDialog,
        renameSshScriptRecordDefaultName,
        showDeleteSshScriptRecordDialog,
        deleteSshScriptRecordMessage,
        confirmRenameSshScriptRecord,
        confirmDeleteSshScriptRecord,
        connectionDragEnabled,
    }
}
