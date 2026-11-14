import {type Ref} from 'vue'
import type {ComposerTranslation} from 'vue-i18n'
import {askAppConfirm} from '@/core/services/app-confirm.service'
import type {TreeNode} from '@/core/types'
import {runAfterContextMenuClose as waitAfterContextMenuClose} from '@/core/ui/inline-rename'
import {findAncestorByType, findParentConnectionId} from '@/core/utils/tree'
import {communityInvokeMessage} from '@/features/explorer/services/connection-tree-helpers'
import {parseDbTypeMenuId} from '@/features/explorer/constants/explorer-add-menu'
import {
    buildDatabaseConsoleContext,
    createNewSqlEditor,
    openBlankSqlConsole,
    openLatestSqlEditor,
    type DatabaseConsoleContext,
} from '@/features/explorer/services/sql-editor-actions.service'
import {resolveDatabaseSqlEditorMenuAction} from '@/features/explorer/services/sql-editor-menu-actions'
import {
    isCopyNameMenuAction,
    isEditConnectionMenuAction,
    isMoveHereMenuAction,
    isOpenMenuAction,
    isPinMenuAction,
    isRestoreWizardMenuAction,
    isSqlExportClipboardMenuAction,
    resolveConnectionLifecycleMenuAction,
    resolveConnectionLifecycleToast,
    resolveConsoleMenuTarget,
    resolveCreateNamespaceMenuMode,
    resolveDatabaseCompareMenuAction,
    resolveGroupCatalogDialogIntent,
    resolveKafkaPublishMenuIntent,
    resolveMigrateDataMenuTarget,
    resolveRefreshMenuTarget,
    resolveSimpleScopedMenuAction,
    resolveSqlExportWizardMenuVariant,
    resolveSqlFileMenuIntent,
    resolveSshScriptMenuIntent,
    resolveTableOpenViewMenuAction,
    resolveTablesFolderViewAction,
    resolveTablesFolderViewContextMissingKey,
    resolveViewModelMenuIntent,
} from '@/features/explorer/services/explorer-menu-intents.service'
import {
    resolveDeleteMenuUiPlan,
    resolveSqlFileMenuDialogPlan,
    resolveSshScriptMenuDialogPlan,
    resolveTableDangerConfirmPlan,
    resolveViewModelMenuDialogPlan,
} from '@/features/explorer/services/explorer-menu-dialog-plans.service'
import {
    buildCreateNamespaceWorkspaceArgs,
    buildSqlFileScheduleDraft,
    resolveEditConnectionFormPlan,
    resolveNewConnectionFormPlan,
} from '@/features/explorer/services/explorer-workspace-open-plans.service'
import {resolveTablesRefreshScope} from '@/features/explorer/services/explorer-refresh-scope.service'
import {useScriptHistoryDrawerStore} from '@/features/explorer/stores/script-history-drawer-store'
import {runSqlFileForDatabase} from '@/features/explorer/services/run-sql-file.service'
import {resolveSchemaScopeFromDatabaseNode} from '@/features/schema-compare/services/schema-scope.service'
import {resolveExplorerSchemaErContext} from '@/features/explorer/services/schema-er-context.service'
import {
    copySqlToClipboard,
    downloadSqlFile,
    includeDataForExportAction,
    resolveExplorerSqlExportContext,
    resolveSqlClipboardExportMessageKey,
    shouldDownloadExportAction,
    type ExplorerSqlExportAction,
} from '@/features/explorer/services/table-sql-export.service'
import {
    buildInsertStatementsFromCsv,
    exportTableDataCsv,
    parseSpreadsheetFile,
    pickSpreadsheetFile,
    resolveTableContext,
    resolveTableDataIoMessageKey,
} from '@/features/explorer/services/table-context-actions.service'
import {canDdlConnection} from '@/features/team/services/connection-access.service'
import {buildTableAskPrompt, requestAiAsk} from '@/features/ai/shared/services/ai-ask.service'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import {resolveTableMigrationContext} from '@/features/explorer/services/table-migration.service'
import {resolveKafkaTablePublishContext} from '@/features/explorer/services/kafka-table-publish.service'
import {parseSshScriptRecordsConnectionId} from '@/features/explorer/services/ssh-feature-tree.service'
import {
    dispatchPlatformWorkspaceOpen,
    resolveNewSshTerminalConnectionId,
    resolvePlatformConnectionMenuOpen,
    type PlatformWorkspaceOpenHandlers,
} from '@/features/explorer/services/explorer-platform-menu-actions.service'
import {resolveExplorerSqlFileMessageKey} from '@/features/explorer/services/explorer-sql-file-messages'
import {resolveExplorerCatalogMessageKey} from '@/features/explorer/services/explorer-catalog-messages'
import {resolveExplorerFeatureMessageKey} from '@/features/explorer/services/explorer-feature-messages'
import {resolvePinToastMessageKey} from '@/features/explorer/services/explorer-pinned-sort.service'
import {resolveExplorerSqlFileScope} from '@/features/explorer/services/explorer-database-scope'
import {parseMoveTargetMenuId} from '@/features/explorer/services/explorer-move-connection.service'
import {parseProjectFileMoveTargetMenuId} from '@/features/explorer/services/explorer-project-file-move.service'
import {
    parseMoveToProjectMenuId,
    parseShareToProjectMenuId,
} from '@/features/explorer/services/explorer-project-connection.service'
import {isCsvImportSupported} from '@/shared/capabilities/db-type-capabilities'
import {CAPABILITY_HINT_I18N} from '@/shared/capabilities/capability-keys'
import {executeSqlBatch} from '@/features/workspace/services/sql-batch-execute.service'
import {resolveClientMaxResultRows} from '@/features/settings/services/query-limit.service'
import {canRunExplorerContextMenuAction} from '@/features/explorer/services/explorer-context-menu-permission.service'
import {explorerApi, tableDataApi, tableDetailApi} from '@/api'
import {resolveViewModelScope, resolveViewsFolderScope} from '@/api/modules/view-model'
import {parseCommunityContextMenuActionId} from '@/features/community-plugin/lib/community-context-menu'
import {createHttpCommunityPluginsApi} from '@/shared/api/http/community-plugins'
import {planOpenElasticsearchConsole} from '@/features/workspace'
import {usePluginStore} from '@/features/plugin/stores/plugin-store'
import type {useExplorerStore} from '@/features/explorer/stores/explorer'
import type {useLayoutStore} from '@/features/layout/stores/layout'
import type {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import type {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import type {useDatasourceCatalogStore} from '@/features/datasource/stores/datasource-catalog'
import type {useTeamStore} from '@/features/team/stores/team-store'

export interface ExplorerTreeMenuActionsDeps {
    t: ComposerTranslation
    explorer: ReturnType<typeof useExplorerStore>
    workspace: ReturnType<typeof useWorkspaceStore>
    layout: ReturnType<typeof useLayoutStore>
    entitlement: ReturnType<typeof useEntitlementStore>
    catalogStore: ReturnType<typeof useDatasourceCatalogStore>
    teamStore: ReturnType<typeof useTeamStore>
    findConnectionId: (node: TreeNode) => string | undefined
    findConnectionLabel: (connectionId?: string) => string | undefined
    contextNode: Ref<TreeNode | null>
    closeMenu: () => void
    // dialogs
    pendingSqlFileNode: Ref<TreeNode | null>
    deleteSqlMessage: Ref<string>
    showDeleteSqlDialog: Ref<boolean>
    pendingProjectFileNode: Ref<TreeNode | null>
    deleteProjectFileMessage: Ref<string>
    showDeleteProjectFileDialog: Ref<boolean>
    pendingSshScriptRecordNode: Ref<TreeNode | null>
    deleteSshScriptRecordMessage: Ref<string>
    showDeleteSshScriptRecordDialog: Ref<boolean>
    renameSshScriptRecordDefaultName: Ref<string>
    showRenameSshScriptRecordDialog: Ref<boolean>
    pendingTableAction: Ref<{
        type: 'truncate' | 'delete'
        node: TreeNode
        message: string
    } | null>
    showTableActionDialog: Ref<boolean>
    pendingViewModelNode: Ref<TreeNode | null>
    renameViewModelDefaultName: Ref<string>
    showRenameViewModelDialog: Ref<boolean>
    deleteViewModelMessage: Ref<string>
    showDeleteViewModelDialog: Ref<boolean>
    recentSqlContext: Ref<DatabaseConsoleContext | null>
    showRecentSqlDialog: Ref<boolean>
    pendingDeleteDatabase: Ref<TreeNode | null>
    showDeleteDatabaseDialog: Ref<boolean>
    pendingDeleteCatalogNode: Ref<TreeNode | null>
    showDeleteCatalogDialog: Ref<boolean>
    openViewModelMigrationFromNode: (node: TreeNode) => void | Promise<void>
    // inline
    createProjectSqlFromMenu: (node: TreeNode) => void | Promise<void>
    beginProjectInlineCreate: (node: TreeNode, mode: 'file' | 'folder') => void | Promise<void>
    beginRenameProjectFile: (node: TreeNode) => void | Promise<void>
    refreshProjectFilesFromMenu: (node: TreeNode) => void | Promise<void>
    beginCreateSubgroup: (node: TreeNode) => void | Promise<void>
    beginRenameGroup: (node: TreeNode) => void | Promise<void>
    beginRenameSqlFile: (node: TreeNode) => void | Promise<void>
    // nav
    onOpen: (node: TreeNode) => void | Promise<void>
    openTableFromNode: (node: TreeNode, tableView?: 'properties' | 'data' | 'ddl') => void
    openViewModelConsoleFromNode: (node: TreeNode) => void | Promise<void>
    // wizards / facade helpers
    openSqlExportWizard: (node: TreeNode, variant?: 'export' | 'backup') => void
    openRestoreWizard: (node: TreeNode) => void
    platformWorkspaceOpenHandlers: () => PlatformWorkspaceOpenHandlers
    createSshScriptRecord: (connectionId: string) => Promise<void>
    refreshSshScriptRecordsFolder: (node: TreeNode) => Promise<void>
    performMoveConnection: (connectionId: string, targetGroupId: string) => Promise<void>
    performMoveProjectFile: (sourceId: string, targetFolderId: string) => Promise<void>
    performMoveConnectionToProject: (connectionId: string, targetProjectId: string) => Promise<void>
    performShareConnectionToProject: (connectionId: string, targetProjectId: string) => Promise<void>
}

export function useExplorerTreeMenuActions(deps: ExplorerTreeMenuActionsDeps) {
    const {
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
    } = deps

    function openKafkaTablePublishWizard(node: TreeNode) {
        const connectionId = findConnectionId(node)
        const ctx = resolveKafkaTablePublishContext(
            explorer.tree,
            node,
            connectionId ? findConnectionLabel(connectionId) : undefined,
        )
        if (!ctx) {
            layout.showErrorToast(t(resolveExplorerFeatureMessageKey('kafkaPublishContextMissing')))
            return
        }
        layout.setModule('database')
        workspace.openKafkaTablePublish({
            source: {
                connectionId: ctx.sourceConnectionId,
                connectionLabel: ctx.sourceConnectionLabel,
                database: ctx.sourceDatabase,
                tableName: ctx.tableName,
            },
        })
    }

    function openKafkaTablePublishFromKafkaConnection(kafkaConnectionId: string) {
        layout.setModule('database')
        workspace.openKafkaTablePublish({
            kafkaConnectionId,
            kafkaConnectionName: findConnectionLabel(kafkaConnectionId),
            explorerNodeId: kafkaConnectionId,
            lockKafkaConnection: true,
        })
    }


    function openTableMigrationFromNode(node: TreeNode) {
        const ctx = resolveTableMigrationContext(explorer.tree, node)
        if (!ctx) {
            layout.showErrorToast(t(resolveExplorerFeatureMessageKey('tableMigrationContextMissing')))
            return
        }
        layout.setModule('database')
        workspace.openTableMigration({
            source: ctx.source,
            preselectedTables: ctx.preselectedTables,
        })
    }

    async function handleSqlExportAction(node: TreeNode, action: ExplorerSqlExportAction) {
        const ctx = resolveExplorerSqlExportContext(explorer.tree, node)
        if (!ctx) {
            layout.showErrorToast(t(resolveSqlClipboardExportMessageKey('contextMissing')))
            return
        }
        try {
            const includeData = includeDataForExportAction(action)
            const result = ctx.tableName
                ? await tableDetailApi.exportTableSql(ctx.tableName, {
                    connectionId: ctx.connectionId,
                    database: ctx.database,
                    includeData,
                })
                : await tableDetailApi.exportDatabaseSql({
                    connectionId: ctx.connectionId,
                    database: ctx.database,
                    includeData,
                })
            if (shouldDownloadExportAction(action)) {
                downloadSqlFile(result.sql, result.fileName)
                layout.startExport(result.fileName)
                return
            }
            const copied = await copySqlToClipboard(result.sql)
            if (copied) {
            } else {
                layout.showErrorToast(t(resolveSqlClipboardExportMessageKey('failed')))
            }
        } catch {
            layout.showErrorToast(t(resolveSqlClipboardExportMessageKey('failed')))
        }
    }

    async function openMetadataDocFromNode(node: TreeNode) {
        if (!entitlement.guardMetaDoc()) return
        const ctx = resolveExplorerSqlExportContext(explorer.tree, node)
        if (!ctx || node.type !== 'database') {
            layout.showErrorToast(t(resolveExplorerFeatureMessageKey('metadocContextMissing')))
            return
        }
        layout.setModule('database')
        workspace.openMetadataDoc({
            connectionId: ctx.connectionId,
            database: ctx.database,
            explorerNodeId: node.id,
            title: t(resolveExplorerFeatureMessageKey('metadocTabTitle'), {database: ctx.database}),
            loading: true,
            detailsLoading: false,
        })
        try {
            // Phase 1: fast summary (table list only)
            const summary = await tableDetailApi.previewDatabaseMetadoc({
                connectionId: ctx.connectionId,
                database: ctx.database,
                format: 'md',
                includeDetails: false,
            })
            workspace.openMetadataDoc({
                connectionId: ctx.connectionId,
                database: ctx.database,
                explorerNodeId: node.id,
                title: t(resolveExplorerFeatureMessageKey('metadocTabTitle'), {database: ctx.database}),
                html: summary.html,
                markdown: summary.markdown,
                fileName: summary.fileName,
                loading: false,
                detailsLoading: true,
            })

            // Phase 2: full details (runs in background, updates the tab when ready)
            void tableDetailApi.previewDatabaseMetadoc({
                connectionId: ctx.connectionId,
                database: ctx.database,
                format: 'md',
                includeDetails: true,
            }).then((full) => {
                workspace.openMetadataDoc({
                    connectionId: ctx.connectionId,
                    database: ctx.database,
                    explorerNodeId: node.id,
                    title: t(resolveExplorerFeatureMessageKey('metadocTabTitle'), {database: ctx.database}),
                    html: full.html,
                    markdown: full.markdown,
                    fileName: full.fileName,
                    loading: false,
                    detailsLoading: false,
                })
            }).catch(() => {
                workspace.openMetadataDoc({
                    connectionId: ctx.connectionId,
                    database: ctx.database,
                    explorerNodeId: node.id,
                    title: t(resolveExplorerFeatureMessageKey('metadocTabTitle'), {database: ctx.database}),
                    loading: false,
                    detailsLoading: false,
                })
            })
        } catch (e) {
            const message = resolveCaughtApiErrorMessage(e, t, 'explorer.metadocFailed')
            workspace.openMetadataDoc({
                connectionId: ctx.connectionId,
                database: ctx.database,
                explorerNodeId: node.id,
                title: t(resolveExplorerFeatureMessageKey('metadocTabTitle'), {database: ctx.database}),
                loading: false,
                detailsLoading: false,
                loadError: message,
            })
            layout.showErrorToast(t(resolveExplorerFeatureMessageKey('metadocFailed')))
        }
    }

    async function openConsoleForTableNode(node: TreeNode) {
        const databaseNode = findAncestorByType(explorer.tree, node.id, 'database')
        const connectionId = findConnectionId(node)
        if (!databaseNode || !connectionId) {
            layout.showErrorToast(t(resolveTableDataIoMessageKey('contextMissing')))
            return
        }
        try {
            await openBlankSqlConsole(explorer.tree, databaseNode, findConnectionLabel(connectionId))
        } catch {
            layout.showErrorToast(t(resolveExplorerFeatureMessageKey('loadSqlFileFailed')))
        }
    }

    async function handleExportTableData(node: TreeNode) {
        const ctx = resolveTableContext(explorer.tree, node)
        if (!ctx) {
            layout.showErrorToast(t(resolveTableDataIoMessageKey('contextMissing')))
            return
        }
        try {
            const data = await tableDataApi.fetch(ctx.tableName, {
                connectionId: ctx.connectionId,
                database: ctx.database,
                maxRows: resolveClientMaxResultRows(),
            })
            if (!data.rows.length) {
                layout.showErrorToast(t(resolveTableDataIoMessageKey('exportEmpty')))
                return
            }
            const fileName = await exportTableDataCsv(ctx.tableName, data.columns, data.rows)
            layout.startExport(fileName)
        } catch {
            layout.showErrorToast(t(resolveTableDataIoMessageKey('exportFailed')))
        }
    }

    async function handleImportTableData(node: TreeNode) {
        const ctx = resolveTableContext(explorer.tree, node)
        if (!ctx) {
            layout.showErrorToast(t(resolveTableDataIoMessageKey('contextMissing')))
            return
        }

        const file = await pickSpreadsheetFile()
        if (!file) {
            layout.showToast(t(resolveTableDataIoMessageKey('importCancelled')))
            return
        }

        try {
            const parsed = await parseSpreadsheetFile(file)
            if (!parsed.headers.length || !parsed.rows.length) {
                layout.showErrorToast(t(resolveTableDataIoMessageKey('importEmpty')))
                return
            }

            const statements = buildInsertStatementsFromCsv(ctx, parsed.headers, parsed.rows)
            if (!statements.length) {
                layout.showErrorToast(t(resolveTableDataIoMessageKey('importEmpty')))
                return
            }

            const result = await executeSqlBatch(statements, {
                connectionId: ctx.connectionId,
                database: ctx.database,
            }, undefined, {
                isPluginEnabled: (pluginId) => usePluginStore().isEnabled(pluginId),
            })

            if (result.lastErrorMessage) {
                layout.showErrorToast(result.lastErrorMessage)
                return
            }

        } catch {
            layout.showErrorToast(t(resolveTableDataIoMessageKey('importFailed')))
        }
    }
    async function runAfterContextMenuClose(action: () => void | Promise<void>) {
        closeMenu()
        await waitAfterContextMenuClose(action)
    }

    async function invokeCommunityContextMenu(
        pluginId: string,
        contributionId: string,
        node: TreeNode,
    ) {
        try {
            const api = createHttpCommunityPluginsApi()
            const connectionId = node.type === 'connection'
                ? node.id
                : findParentConnectionId(explorer.tree, node.id)
            const menu =
                node.type === 'table' || node.type === 'view' || node.type === 'connection'
                    ? node.type
                    : 'connection'
            const result = await api.invoke(pluginId, 'context-menu/invoke', {
                contributionId,
                menu,
                nodeType: node.type,
                nodeId: node.id,
                connectionId: connectionId ?? undefined,
                label: node.label,
                dbType: node.dbType,
            })
        } catch (error) {
            layout.showErrorToast(
                resolveCaughtApiErrorMessage(error, t, 'communityPlugin.contextMenuFailed'),
            )
        }
    }

    /**
     * P2-2：选中表直接向 AI 提问。
     * 表会被顺手纳入 AI 数据范围（打标降级为顺手动作），不再要求用户先去治理。
     */
    function askAiAboutTable(node: TreeNode) {
        const context = resolveTableContext(explorer.tree, node)
        if (!context) {
            layout.showWarningToast(t('explorer.context.askAiUnavailable'))
            return
        }
        layout.setModule('ai')
        void requestAiAsk({
            prompt: buildTableAskPrompt(context.tableName),
            scope: {
                connectionId: context.connectionId,
                database: context.database,
                tables: [context.tableName],
            },
        })
    }

    function onMenuSelect(id: string) {
        // Prefer context target; fall back to selection if close raced ahead (packaged JCEF).
        const node = contextNode.value ?? explorer.selectedNode
        if (!node) return
        if (!canRunExplorerContextMenuAction(id, {nodeType: node.type})) {
            layout.showErrorToast(t(resolveExplorerCatalogMessageKey('permissionDenied')))
            closeMenu()
            return
        }

        const communityAction = parseCommunityContextMenuActionId(id)
        if (communityAction) {
            void invokeCommunityContextMenu(
                communityAction.pluginId,
                communityAction.contributionId,
                node,
            )
            closeMenu()
            return
        }

        if (id === 'ask-ai') {
            askAiAboutTable(node)
            closeMenu()
            return
        }
        if (id === 'new-project-sql') {
            void createProjectSqlFromMenu(node)
            closeMenu()
            return
        }
        if (id === 'new-project-file') {
            void runAfterContextMenuClose(() => beginProjectInlineCreate(node, 'file'))
            return
        }
        if (id === 'new-project-folder') {
            void runAfterContextMenuClose(() => beginProjectInlineCreate(node, 'folder'))
            return
        }
        if (id === 'rename-project-file') {
            void runAfterContextMenuClose(() => beginRenameProjectFile(node))
            return
        }
        if (id === 'delete-project-file') {
            const isDirectory = node.type === 'project-docs' || node.type === 'project-scripts'
            pendingProjectFileNode.value = node
            deleteProjectFileMessage.value = t(
                isDirectory
                    ? 'explorer.deleteProjectFolderMessage'
                    : 'explorer.deleteProjectFileMessage',
                {name: node.label},
            )
            showDeleteProjectFileDialog.value = true
            closeMenu()
            return
        }
        if (id === 'refresh-project-files') {
            void refreshProjectFilesFromMenu(node)
            closeMenu()
            return
        }

        const dbType = parseDbTypeMenuId(id)
        if (dbType) {
            const formPlan = resolveNewConnectionFormPlan(dbType, node)
            workspace.openConnectionForm(formPlan.dbType, formPlan.options)
            closeMenu()
            return
        }

        const groupDialog = resolveGroupCatalogDialogIntent(id, node.type)
        if (groupDialog) {
            if (groupDialog === 'new-subgroup') {
                void runAfterContextMenuClose(() => beginCreateSubgroup(node))
            } else {
                void runAfterContextMenuClose(() => beginRenameGroup(node))
            }
            return
        }

        const sqlFileIntent = resolveSqlFileMenuIntent(id, node.type)
        const sqlFileDialog = sqlFileIntent ? resolveSqlFileMenuDialogPlan(sqlFileIntent, node.label) : null
        if (sqlFileDialog?.dialog === 'rename') {
            void runAfterContextMenuClose(() => beginRenameSqlFile(node))
            return
        }
        if (sqlFileDialog?.dialog === 'delete') {
            pendingSqlFileNode.value = node
            deleteSqlMessage.value = t(sqlFileDialog.messageKey, {name: node.label})
            showDeleteSqlDialog.value = true
            closeMenu()
            return
        }
        if (sqlFileIntent === 'script-history') {
            const connectionId = findConnectionId(node)
            const scope = resolveExplorerSqlFileScope(explorer.tree, node.id)
            if (!connectionId || !scope) {
                closeMenu()
                return
            }
            const connectionNode = explorer.findNode(connectionId)
            useScriptHistoryDrawerStore().openDrawer({
                connectionId,
                instanceName: scope.instanceLabel,
                fileName: node.label,
                connectionLabel: connectionNode?.label,
            })
            closeMenu()
            return
        }
        if (sqlFileIntent === 'schedule') {
            const connectionId = findConnectionId(node)
            const scope = resolveExplorerSqlFileScope(explorer.tree, node.id)
            if (!connectionId || !scope) {
                layout.showErrorToast(t(resolveExplorerSqlFileMessageKey('scheduleContextMissing')))
                closeMenu()
                return
            }
            layout.setModule('database')
            workspace.openPlatformCatalog({
                feature: 'scheduled_tasks',
                connectionId,
                database: scope.instanceLabel,
                instanceId: scope.scopeNode.id,
                explorerNodeId: node.id,
                openCreateForm: true,
                scheduleDraft: buildSqlFileScheduleDraft(node.label),
            })
            closeMenu()
            return
        }

        if (isOpenMenuAction(id)) void onOpen(node)

        if (
            (id === 'es-rest' || id === 'es-mapping' || id === 'es-settings' || id === 'es-stats' || id === 'es-clear')
            && node.type === 'table'
        ) {
            const tableCtx = resolveTableContext(explorer.tree, node)
            if (tableCtx?.dbType === 'elasticsearch') {
                layout.setModule('database')
                if (id === 'es-clear') {
                    void askAppConfirm({
                        title: t('common.confirm'),
                        message: t('explorer.elasticsearchConsole.confirmClear', {index: tableCtx.tableName}),
                        confirmVariant: 'danger',
                    }).then((ok) => {
                        if (!ok) return
                        void explorerApi.clearElasticsearchIndex(tableCtx.connectionId, tableCtx.tableName)
                            .catch((caught) => layout.showErrorToast(
                                resolveCaughtApiErrorMessage(caught, t, 'explorer.elasticsearchConsole.runFailed'),
                            ))
                    })
                    closeMenu()
                    return
                }
                const metadataKind =
                    id === 'es-mapping' ? 'mapping'
                        : id === 'es-settings' ? 'settings'
                            : id === 'es-stats' ? 'stats'
                                : undefined
                workspace.openWithPlan(
                    planOpenElasticsearchConsole,
                    {
                        connectionId: tableCtx.connectionId,
                        connectionName: findConnectionLabel(tableCtx.connectionId) ?? tableCtx.connectionId,
                        explorerNodeId: tableCtx.nodeId,
                        view: 'rest',
                        indexName: tableCtx.tableName,
                        metadataKind,
                    },
                    'elasticsearch',
                )
                closeMenu()
                return
            }
        }

        const lifecycleAction = resolveConnectionLifecycleMenuAction(id, node.type)
        if (lifecycleAction) {
            const lifecyclePromise = lifecycleAction === 'connect'
                ? explorer.connectConnection(node.id, {notify: true})
                : lifecycleAction === 'reconnect'
                    ? explorer.reconnectConnection(node.id, {notify: true})
                    : explorer.disconnectConnection(node.id)
            void lifecyclePromise.then((ok) => {
                const toast = resolveConnectionLifecycleToast(lifecycleAction, ok)
                if (!toast) return
                layout.showErrorToast(t(toast.key))
            })
            closeMenu()
            return
        }

        const platformOpen = resolvePlatformConnectionMenuOpen(id, node)
        if (platformOpen) {
            if (platformOpen.kind === 'ssh-terminal-new') {
                const connectionId = resolveNewSshTerminalConnectionId(node, findConnectionId(node))
                if (connectionId) {
                    dispatchPlatformWorkspaceOpen(
                        platformOpen,
                        {
                            connectionId,
                            connectionName: findConnectionLabel(connectionId) ?? connectionId,
                            explorerNodeId: connectionId,
                        },
                        platformWorkspaceOpenHandlers(),
                    )
                }
                closeMenu()
                return
            }
            dispatchPlatformWorkspaceOpen(
                platformOpen,
                {
                    connectionId: node.id,
                    connectionName: node.label,
                    explorerNodeId: node.id,
                },
                platformWorkspaceOpenHandlers(),
            )
            closeMenu()
            return
        }

        const sshScriptIntent = resolveSshScriptMenuIntent(id, node.type)
        if (sshScriptIntent === 'new-record') {
            const connectionId = parseSshScriptRecordsConnectionId(node.id) ?? findConnectionId(node)
            if (connectionId) {
                void createSshScriptRecord(connectionId)
            }
            closeMenu()
            return
        }
        if (sshScriptIntent === 'refresh-records') {
            void refreshSshScriptRecordsFolder(node)
            closeMenu()
            return
        }
        const sshScriptDialog = sshScriptIntent
            ? resolveSshScriptMenuDialogPlan(sshScriptIntent, node.label)
            : null
        if (sshScriptDialog?.dialog === 'delete-record') {
            pendingSshScriptRecordNode.value = node
            deleteSshScriptRecordMessage.value = t(sshScriptDialog.messageKey, {name: node.label})
            showDeleteSshScriptRecordDialog.value = true
            closeMenu()
            return
        }
        if (sshScriptDialog?.dialog === 'rename-record') {
            pendingSshScriptRecordNode.value = node
            renameSshScriptRecordDefaultName.value = sshScriptDialog.defaultName
            showRenameSshScriptRecordDialog.value = true
            closeMenu()
            return
        }

        const kafkaPublish = resolveKafkaPublishMenuIntent(id, node)
        if (kafkaPublish === 'from-kafka-connection') {
            openKafkaTablePublishFromKafkaConnection(node.id)
            closeMenu()
            return
        }

        const exportWizardVariant = resolveSqlExportWizardMenuVariant(id, node.type)
        if (exportWizardVariant) {
            openSqlExportWizard(node, exportWizardVariant)
            closeMenu()
            return
        }

        if (isRestoreWizardMenuAction(id, node.type)) {
            openRestoreWizard(node)
            closeMenu()
            return
        }

        if (kafkaPublish === 'from-table') {
            openKafkaTablePublishWizard(node)
            closeMenu()
            return
        }

        if (isSqlExportClipboardMenuAction(id)) {
            if (node.type === 'table' || node.type === 'database') {
                void handleSqlExportAction(node, id as ExplorerSqlExportAction)
            }
            closeMenu()
            return
        }

        const tableOpenView = resolveTableOpenViewMenuAction(id, node.type)
        if (tableOpenView) {
            explorer.selectNode(node.id)
            openTableFromNode(node, tableOpenView)
            closeMenu()
            return
        }

        const tablesFolderView = resolveTablesFolderViewAction(id, node)
        if (tablesFolderView) {
            const ctx = resolveExplorerSchemaErContext(explorer.tree, node)
            if (!ctx) {
                layout.showErrorToast(t(resolveTablesFolderViewContextMissingKey(tablesFolderView)))
                closeMenu()
                return
            }
            layout.setModule('database')
            if (tablesFolderView === 'schema-er') {
                workspace.openSchemaEr(ctx)
            } else {
                workspace.openSchemaTables(ctx)
            }
            closeMenu()
            return
        }

        if (isPinMenuAction(id, node)) {
            explorer.togglePinnedNode(node.id)
            closeMenu()
            return
        }

        const scopedAction = resolveSimpleScopedMenuAction(id, node.type)
        if (scopedAction === 'truncate') {
            const dangerPlan = resolveTableDangerConfirmPlan('truncate')
            pendingTableAction.value = {
                type: dangerPlan.type,
                node,
                message: t(dangerPlan.messageKey, {name: node.label}),
            }
            showTableActionDialog.value = true
            closeMenu()
            return
        }

        if (scopedAction === 'import') {
            const ctx = resolveTableContext(explorer.tree, node)
            if (!isCsvImportSupported(ctx?.dbType, catalogStore.items)) {
                workspace.setStatus(t(CAPABILITY_HINT_I18N.csvImport))
                closeMenu()
                return
            }
            void handleImportTableData(node)
            closeMenu()
            return
        }

        if (scopedAction === 'export-data') {
            void handleExportTableData(node)
            closeMenu()
            return
        }

        if (scopedAction === 'run-sql-file') {
            const connectionId = findConnectionId(node)
            void runSqlFileForDatabase(explorer.tree, node, findConnectionLabel(connectionId))
                .catch(() => layout.showErrorToast(t(resolveExplorerFeatureMessageKey('runSqlFileFailed'))))
            closeMenu()
            return
        }

        if (scopedAction === 'export-metadoc') {
            if (!entitlement.guardMetaDoc()) {
                closeMenu()
                return
            }
            void openMetadataDocFromNode(node)
            closeMenu()
            return
        }

        const compareAction = resolveDatabaseCompareMenuAction(id, node.type)
        if (compareAction) {
            // Wave 37: allow open for limited free preview; export / full diffs still gated elsewhere.
            const scope = resolveSchemaScopeFromDatabaseNode(explorer.tree, node)
            if (scope) {
                if (compareAction === 'schema-compare') workspace.openSchemaCompare({left: scope})
                else workspace.openCrossEnvCompare({left: scope})
            }
            closeMenu()
            return
        }

        const migrateTarget = resolveMigrateDataMenuTarget(id, node.type)
        if (migrateTarget === 'table-or-database') {
            openTableMigrationFromNode(node)
            closeMenu()
            return
        }
        if (migrateTarget === 'view-model') {
            void openViewModelMigrationFromNode(node)
            closeMenu()
            return
        }

        const viewModelIntent = resolveViewModelMenuIntent(id, node)
        if (viewModelIntent === 'new') {
            const scope = resolveViewsFolderScope(explorer.tree, node.id)
            if (scope?.connectionId) {
                layout.setModule('database')
                void workspace.openViewModelEditor({
                    connectionId: scope.connectionId,
                    instanceId: scope.scopeNode.id,
                    database: scope.instanceLabel,
                })
            }
            closeMenu()
            return
        }
        if (viewModelIntent === 'edit') {
            void openViewModelConsoleFromNode(node)
            closeMenu()
            return
        }
        if (viewModelIntent === 'lineage') {
            const connectionId = findConnectionId(node)
            const scope = resolveViewModelScope(explorer.tree, node.id)
            if (!connectionId || !scope) {
                layout.showErrorToast(t(resolveExplorerFeatureMessageKey('lineageMissingContext')))
                closeMenu()
                return
            }
            layout.setModule('database')
            workspace.openViewModelLineage({
                viewModelName: node.label,
                connectionId,
                instanceId: scope.scopeNode.id,
                database: scope.instanceLabel,
                explorerNodeId: node.id,
            })
            closeMenu()
            return
        }
        const viewModelDialog = viewModelIntent
            ? resolveViewModelMenuDialogPlan(viewModelIntent, node.label)
            : null
        if (viewModelDialog?.dialog === 'rename') {
            pendingViewModelNode.value = node
            renameViewModelDefaultName.value = viewModelDialog.defaultName
            showRenameViewModelDialog.value = true
            closeMenu()
            return
        }
        if (viewModelDialog?.dialog === 'delete') {
            pendingViewModelNode.value = node
            deleteViewModelMessage.value = t(viewModelDialog.messageKey, {name: node.label})
            showDeleteViewModelDialog.value = true
            closeMenu()
            return
        }

        const sqlEditorAction = resolveDatabaseSqlEditorMenuAction(id, node.type)
        if (sqlEditorAction) {
            const connectionId = findConnectionId(node)
            if (connectionId) {
                const connectionName = findConnectionLabel(connectionId)
                if (sqlEditorAction === 'show-recent') {
                    void buildDatabaseConsoleContext(explorer.tree, node, connectionName)
                        .then((ctx) => {
                            if (!ctx) return
                            recentSqlContext.value = ctx
                            showRecentSqlDialog.value = true
                        })
                } else {
                    layout.setModule('database')
                    const openEditor = sqlEditorAction === 'open-latest'
                        ? openLatestSqlEditor
                        : sqlEditorAction === 'create-new'
                            ? createNewSqlEditor
                            : openBlankSqlConsole
                    void openEditor(explorer.tree, node, connectionName)
                        .catch(() => layout.showErrorToast(t(resolveExplorerFeatureMessageKey('loadSqlFileFailed'))))
                }
            }
            closeMenu()
            return
        }

        const consoleTarget = resolveConsoleMenuTarget(id, node.type)
        if (consoleTarget === 'database') {
            const connectionId = findConnectionId(node)
            if (connectionId) {
                void openLatestSqlEditor(explorer.tree, node, findConnectionLabel(connectionId))
                    .catch(() => layout.showErrorToast(t(resolveExplorerFeatureMessageKey('loadSqlFileFailed'))))
            }
        } else if (consoleTarget === 'table') {
            void openConsoleForTableNode(node)
        } else if (consoleTarget === 'generic') {
            workspace.openConsole({
                connectionName: node.label,
                connectionId: node.type === 'connection' ? node.id : undefined,
            })
        }
        const moveTargetGroupId = parseMoveTargetMenuId(id)
        if (moveTargetGroupId && node.type === 'connection') {
            void performMoveConnection(node.id, moveTargetGroupId)
            closeMenu()
            return
        }

        const projectMoveTargetId = parseProjectFileMoveTargetMenuId(id)
        if (projectMoveTargetId) {
            void performMoveProjectFile(node.id, projectMoveTargetId)
            closeMenu()
            return
        }

        const moveToProjectId = parseMoveToProjectMenuId(id)
        if (moveToProjectId && node.type === 'connection') {
            void performMoveConnectionToProject(node.id, moveToProjectId)
            closeMenu()
            return
        }

        const shareToProjectId = parseShareToProjectMenuId(id)
        if (shareToProjectId && node.type === 'connection') {
            void performShareConnectionToProject(node.id, shareToProjectId)
            closeMenu()
            return
        }

        if (isMoveHereMenuAction(id, node.type)) {
            const connection = explorer.selectedNode
            if (connection?.type === 'connection') {
                void performMoveConnection(connection.id, node.id)
            }
            closeMenu()
            return
        }

        const createNamespaceMode = resolveCreateNamespaceMenuMode(id, node.type)
        if (createNamespaceMode) {
            if (!canDdlConnection(node.id, teamStore.teams)) {
                layout.showErrorToast(t(resolveExplorerFeatureMessageKey('createNamespaceAccessDenied')))
                closeMenu()
                return
            }
            layout.setModule('database')
            // Open the tab immediately — do not wait for connect/expand (slow or hung
            // connects used to look like the create page never opened).
            workspace.openCreateNamespace(buildCreateNamespaceWorkspaceArgs(createNamespaceMode, node))
            void explorer.connectConnection(node.id, {notify: false}).catch(() => undefined)
            closeMenu()
            return
        }
        const refreshTarget = resolveRefreshMenuTarget(id, node)
        if (refreshTarget === 'connection') {
            void (async () => {
                try {
                    await explorer.connectConnection(node.id, {notify: false}).catch(() => undefined)
                    await explorer.reloadConnectionCatalog(node.id)
                } catch (error) {
                    layout.showErrorToast(
                        resolveCaughtApiErrorMessage(error, t, 'explorer.refreshFailed'),
                    )
                }
            })()
            closeMenu()
            return
        }
        if (refreshTarget === 'tables-scope') {
            void (async () => {
                try {
                    const scope = resolveTablesRefreshScope(explorer.tree, node)
                    if (!scope) {
                        layout.showErrorToast(t(resolveTableDataIoMessageKey('contextMissing')))
                        return
                    }
                    await explorer.connectConnection(scope.connectionId, {notify: false}).catch(() => undefined)
                    await explorer.reloadTablesFolder(scope.connectionId, scope.scopeLabel, scope.scopeNodeId)
                } catch (error) {
                    layout.showErrorToast(
                        resolveCaughtApiErrorMessage(error, t, 'explorer.refreshFailed'),
                    )
                }
            })()
            closeMenu()
            return
        }

        const deletePlan = resolveDeleteMenuUiPlan(id, node.type)
        if (deletePlan?.kind === 'delete-database') {
            const connectionId = findConnectionId(node)
            if (!connectionId || !canDdlConnection(connectionId, teamStore.teams)) {
                layout.showErrorToast(t(resolveExplorerFeatureMessageKey('createNamespaceAccessDenied')))
                closeMenu()
                return
            }
            pendingDeleteDatabase.value = node
            showDeleteDatabaseDialog.value = true
            closeMenu()
            return
        }

        if (isEditConnectionMenuAction(id, node)) {
            const editPlan = resolveEditConnectionFormPlan(node)
            if (editPlan) {
                workspace.openConnectionForm(editPlan.dbType, {
                    connectionId: editPlan.connectionId,
                    connectionName: editPlan.connectionName,
                })
            }
        }

        if (deletePlan?.kind === 'delete-table') {
            pendingTableAction.value = {
                type: deletePlan.type,
                node,
                message: t(deletePlan.messageKey, {name: node.label}),
            }
            showTableActionDialog.value = true
            closeMenu()
            return
        }

        if (deletePlan?.kind === 'delete-catalog') {
            pendingDeleteCatalogNode.value = node
            showDeleteCatalogDialog.value = true
            closeMenu()
            return
        }

        if (isCopyNameMenuAction(id)) {
            void navigator.clipboard.writeText(node.label).catch(() => {
                layout.showErrorToast(t(resolveExplorerFeatureMessageKey('createNamespaceCopyFailed')))
            })
        }
        closeMenu()
    }
    return {
        onMenuSelect,
    }
}
