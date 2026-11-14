import {computed, ref} from 'vue'
import type {ComposerTranslation} from 'vue-i18n'
import type {TreeNode} from '@/core/types'
import {findAncestorByType} from '@/core/utils/tree'
import {resolveCatalogDeletedMessageKey} from '@/features/explorer/services/explorer-menu-intents.service'
import {resolveDeleteCatalogDialogCopy} from '@/features/explorer/services/explorer-context-menu-builders.service'
import {resolveExplorerCatalogMessageKey} from '@/features/explorer/services/explorer-catalog-messages'
import {resolveExplorerFeatureMessageKey} from '@/features/explorer/services/explorer-feature-messages'
import {resolveExplorerSqlFileMessageKey} from '@/features/explorer/services/explorer-sql-file-messages'
import {resolveViewModelMessageKey} from '@/features/explorer/services/view-model-messages'
import {resolveTableMigrationContext} from '@/features/explorer/services/table-migration.service'
import {
    buildDropTableSql,
    buildTruncateTableSql,
    resolveTableContext,
    resolveTableDataIoMessageKey,
} from '@/features/explorer/services/table-context-actions.service'
import {resolveCreateNamespaceErrorMessage} from '@/features/explorer/services/create-namespace.service'
import {resolveRenameViewModelPlan} from '@/features/explorer/services/view-model-naming'
import {resolveConnectionCatalogErrorMessage} from '@/features/connection/services/connection-catalog.service'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import {deleteInstanceSqlScript} from '@/features/explorer/services/sql-script.service'
import {resolveExplorerSqlFileScope} from '@/features/explorer/services/explorer-database-scope'
import {resolveViewModelScope, viewModelApi} from '@/api/modules/view-model'
import {explorerApi, sqlApi} from '@/api'
import type {useExplorerStore} from '@/features/explorer/stores/explorer'
import type {useLayoutStore} from '@/features/layout/stores/layout'
import type {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import type {DatabaseConsoleContext} from '@/features/explorer/services/sql-editor-actions.service'

export interface ExplorerTreeDangerDialogsDeps {
    t: ComposerTranslation
    explorer: ReturnType<typeof useExplorerStore>
    workspace: ReturnType<typeof useWorkspaceStore>
    layout: ReturnType<typeof useLayoutStore>
    findConnectionId: (node: TreeNode) => string | undefined
    deleteSshScriptRecordFromNode: (node: TreeNode) => Promise<void>
    renameSshScriptRecordFromNode: (node: TreeNode, nextTitle: string) => Promise<void>
}

export function useExplorerTreeDangerDialogs(deps: ExplorerTreeDangerDialogsDeps) {
    const {
        t,
        explorer,
        workspace,
        layout,
        findConnectionId,
        deleteSshScriptRecordFromNode,
        renameSshScriptRecordFromNode,
    } = deps
    
    const showDeleteSqlDialog = ref(false)
    const deleteSqlMessage = ref('')
    const showDeleteProjectFileDialog = ref(false)
    const deleteProjectFileMessage = ref('')
    const pendingGroupNode = ref<TreeNode | null>(null)
    const pendingSqlFileNode = ref<TreeNode | null>(null)
    const pendingProjectFileNode = ref<TreeNode | null>(null)
    const pendingViewModelNode = ref<TreeNode | null>(null)
    const showRenameViewModelDialog = ref(false)
    const renameViewModelDefaultName = ref('')
    const showDeleteViewModelDialog = ref(false)
    const deleteViewModelMessage = ref('')
    const showRenameSshScriptRecordDialog = ref(false)
    const renameSshScriptRecordDefaultName = ref('')
    const showDeleteSshScriptRecordDialog = ref(false)
    const deleteSshScriptRecordMessage = ref('')
    const pendingSshScriptRecordNode = ref<TreeNode | null>(null)
    const showMigrateViewModelDialog = ref(false)
    const migrateViewModelTargetTable = ref('')
    const pendingMigrateViewModelSql = ref('')
    const showRecentSqlDialog = ref(false)
    const recentSqlContext = ref<DatabaseConsoleContext | null>(null)
    const showTableActionDialog = ref(false)
    const pendingTableAction = ref<{
    type: 'truncate' | 'delete'
    node: TreeNode
    message: string
    } | null>(null)
    const showDeleteDatabaseDialog = ref(false)
    const pendingDeleteDatabase = ref<TreeNode | null>(null)
    const showDeleteCatalogDialog = ref(false)
    const pendingDeleteCatalogNode = ref<TreeNode | null>(null)
    const deleteCatalogDialogCopy = computed(() => resolveDeleteCatalogDialogCopy(pendingDeleteCatalogNode.value, t))
    const deleteCatalogTitle = computed(() => deleteCatalogDialogCopy.value.title)
    const deleteCatalogMessage = computed(() => deleteCatalogDialogCopy.value.message)
    const deleteCatalogConfirmLabel = computed(() => deleteCatalogDialogCopy.value.confirmLabel)
    
    async function confirmTableAction() {
    const pending = pendingTableAction.value
    if (!pending) return
    
    const ctx = resolveTableContext(explorer.tree, pending.node)
    if (!ctx) {
        layout.showErrorToast(t(resolveTableDataIoMessageKey('contextMissing')))
        return
    }
    
    const databaseNode = findAncestorByType(explorer.tree, pending.node.id, 'database')
    const sql =
        pending.type === 'truncate'
            ? buildTruncateTableSql(ctx)
            : buildDropTableSql(ctx)
    
    try {
        await sqlApi.execute(sql, {
            connectionId: ctx.connectionId,
            database: ctx.database,
        })
    
        if (pending.type === 'delete') {
            workspace.closeTableTabs({
                connectionId: ctx.connectionId,
                database: ctx.database,
                tableName: ctx.tableName,
            })
            if (explorer.selectedNodeId === pending.node.id && databaseNode) {
                explorer.selectNode(databaseNode.id)
            }
        }
    
        await explorer.reloadTablesFolder(
            ctx.connectionId,
            ctx.database,
            databaseNode?.id,
        )
    
    } catch (error) {
        layout.showErrorToast(
            resolveCaughtApiErrorMessage(
                error,
                t,
                pending.type === 'truncate'
                    ? 'explorer.truncateTableFailed'
                    : 'explorer.deleteTableFailed',
            ),
        )
    } finally {
        pendingTableAction.value = null
        showTableActionDialog.value = false
    }
}
    
    async function confirmDeleteDatabase() {
    const node = pendingDeleteDatabase.value
    if (!node || node.type !== 'database') return
    const connectionId = findConnectionId(node)
    if (!connectionId) {
        layout.showErrorToast(t(resolveTableDataIoMessageKey('contextMissing')))
        return
    }
    try {
        await explorerApi.deleteDatabase(connectionId, node.label)
        for (const tab of workspace.tabs.filter(
            (item) => item.connectionId === connectionId && item.database === node.label,
        )) {
            workspace.closeTab(tab.id)
        }
        if (explorer.selectedNodeId === node.id) {
            explorer.selectNode(connectionId)
        }
        await explorer.reloadConnectionCatalog(connectionId)
    } catch (error) {
        layout.showErrorToast(resolveCreateNamespaceErrorMessage(error, t))
    } finally {
        pendingDeleteDatabase.value = null
        showDeleteDatabaseDialog.value = false
    }
}
    
    async function confirmDeleteCatalogNode() {
    const node = pendingDeleteCatalogNode.value
    showDeleteCatalogDialog.value = false
    pendingDeleteCatalogNode.value = null
    if (!node || (node.type !== 'connection' && node.type !== 'group')) return
    const label = node.label
    const nodeType = node.type
    try {
        await explorer.deleteNode(node.id)
    } catch (error) {
        layout.showErrorToast(resolveConnectionCatalogErrorMessage(error, t, 'delete'))
    }
}
    
    async function confirmDeleteSqlFile() {
    const node = pendingSqlFileNode.value
    if (!node || node.type !== 'sql_file') return
    
    const connectionId = findConnectionId(node)
    const scope = resolveExplorerSqlFileScope(explorer.tree, node.id)
    if (!connectionId || !scope) {
        layout.showErrorToast(t(resolveExplorerSqlFileMessageKey('deleteFailed')))
        return
    }
    
    try {
        await deleteInstanceSqlScript({
            connectionId,
            instanceName: scope.instanceLabel,
            fileName: node.label,
        })
        workspace.closeConsoleTabsForSqlFile({
            connectionId,
            instanceId: scope.scopeNode.id,
            fileName: node.label,
        })
        await explorer.reloadWorkspacesFolder(
            connectionId,
            scope.instanceLabel,
            scope.scopeNode.id,
        )
        if (explorer.selectedNodeId === node.id) {
            explorer.selectNode(scope.scopeNode.id)
        }
    } catch {
        layout.showErrorToast(t(resolveExplorerSqlFileMessageKey('deleteFailed')))
    }
}

    async function confirmDeleteProjectFile() {
        const node = pendingProjectFileNode.value
        pendingProjectFileNode.value = null
        if (!node || !node.id.startsWith('project-file:')) return
        try {
            const {deleteProjectFileNode} = await import(
                '@/features/project/services/project-explorer-files'
            )
            const parentFolderId = await deleteProjectFileNode(node)
            if (parentFolderId && explorer.selectedNodeId === node.id) {
                explorer.selectNode(parentFolderId)
            }
        } catch {
            layout.showErrorToast(t('explorer.projectFileDeleteFailed'))
        }
    }
    
    async function openViewModelMigrationFromNode(node: TreeNode) {
    const connectionId = findConnectionId(node)
    const scope = resolveViewModelScope(explorer.tree, node.id)
    if (!connectionId || !scope) {
        layout.showErrorToast(t(resolveExplorerFeatureMessageKey('tableMigrationContextMissing')))
        return
    }
    try {
        const result = await viewModelApi.read({
            connectionId,
            instanceName: scope.instanceLabel,
            name: node.label,
        })
        const migrationCtx = resolveTableMigrationContext(explorer.tree, scope.scopeNode)
        if (!migrationCtx) {
            layout.showErrorToast(t(resolveExplorerFeatureMessageKey('tableMigrationContextMissing')))
            return
        }
        pendingViewModelNode.value = node
        pendingMigrateViewModelSql.value = result.sql
        migrateViewModelTargetTable.value = ''
        showMigrateViewModelDialog.value = true
    } catch {
        layout.showErrorToast(t(resolveViewModelMessageKey('loadFailed')))
    }
}
    
    async function confirmMigrateViewModel(targetTable: string) {
    const node = pendingViewModelNode.value
    const sql = pendingMigrateViewModelSql.value
    const tableName = targetTable.trim()
    if (!node || !sql || !tableName) return
    
    const connectionId = findConnectionId(node)
    const scope = resolveViewModelScope(explorer.tree, node.id)
    const migrationCtx = scope ? resolveTableMigrationContext(explorer.tree, scope.scopeNode) : null
    if (!connectionId || !scope || !migrationCtx) return
    
    layout.setModule('database')
    workspace.openViewModelMigration({
        source: migrationCtx.source,
        viewModelName: node.label,
        sourceSelectSql: sql,
        targetTableName: tableName,
    })
    showMigrateViewModelDialog.value = false
}
    
    async function confirmRenameViewModel(name: string) {
    const node = pendingViewModelNode.value
    if (!node || node.type !== 'view_model') return
    const plan = resolveRenameViewModelPlan(name, node.label)
    if (!plan.ok) {
        if (plan.reason === 'invalid-name') {
            layout.showErrorToast(t(resolveViewModelMessageKey('invalidName')))
        }
        return
    }
    
    const connectionId = findConnectionId(node)
    const scope = resolveViewModelScope(explorer.tree, node.id)
    if (!connectionId || !scope) {
        layout.showErrorToast(t(resolveViewModelMessageKey('renameFailed')))
        return
    }
    
    try {
        const result = await viewModelApi.rename({
            connectionId,
            instanceName: scope.instanceLabel,
            oldName: node.label,
            newName: plan.name,
        })
        await explorer.reloadViewsFolder(connectionId, scope.instanceLabel, scope.scopeNode.id)
    } catch {
        layout.showErrorToast(t(resolveViewModelMessageKey('renameFailed')))
    }
}
    
    async function confirmDeleteViewModel() {
    const node = pendingViewModelNode.value
    if (!node || node.type !== 'view_model') return
    
    const connectionId = findConnectionId(node)
    const scope = resolveViewModelScope(explorer.tree, node.id)
    if (!connectionId || !scope) {
        layout.showErrorToast(t(resolveViewModelMessageKey('deleteFailed')))
        return
    }
    
    try {
        await viewModelApi.delete({
            connectionId,
            instanceName: scope.instanceLabel,
            name: node.label,
        })
        await explorer.reloadViewsFolder(connectionId, scope.instanceLabel, scope.scopeNode.id)
        if (explorer.selectedNodeId === node.id) {
            explorer.selectNode(scope.scopeNode.id)
        }
    } catch {
        layout.showErrorToast(t(resolveViewModelMessageKey('deleteFailed')))
    }
}
    
    async function confirmDeleteSshScriptRecord() {
    const node = pendingSshScriptRecordNode.value
    pendingSshScriptRecordNode.value = null
    if (!node || node.type !== 'ssh-script-record') return
    await deleteSshScriptRecordFromNode(node)
}
    
    async function confirmRenameSshScriptRecord(name: string) {
    const node = pendingSshScriptRecordNode.value
    pendingSshScriptRecordNode.value = null
    if (!node || node.type !== 'ssh-script-record') return
    await renameSshScriptRecordFromNode(node, name)
}
    
    return {
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
        pendingMigrateViewModelSql,
        showRecentSqlDialog,
        recentSqlContext,
        showTableActionDialog,
        pendingTableAction,
        showDeleteDatabaseDialog,
        pendingDeleteDatabase,
        showDeleteCatalogDialog,
        pendingDeleteCatalogNode,
        deleteCatalogDialogCopy,
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
    }
}
