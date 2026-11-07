import {computed, nextTick, onMounted, onUnmounted, ref, toRef} from 'vue'
import {useI18n} from 'vue-i18n'
import type {ContextMenuItem, TreeNode} from '@/core/types'
import {useContextMenuAnchor} from '@/core/context-menu'
import {runAfterContextMenuClose as waitAfterContextMenuClose} from '@/core/ui/inline-rename'
import {canExpandTreeNode, findAncestorByType, findParentConnectionId} from '@/core/utils/tree'
import {
    communityInvokeMessage,
    filterRenameProjectFileMenuItems,
    resolveConnectionIdFromTree,
    resolveConnectionLabel,
    resolveProjectFilesActionFolder as resolveProjectFilesActionFolderHelper,
} from '@/features/explorer/services/connection-tree-helpers'
import {parseDbTypeMenuId} from '@/features/explorer/constants/explorer-add-menu'
import {getContextMenuForNodeType} from '@/features/explorer/constants/context-menus'
import {buildElasticsearchIndexMenuItems} from '@/features/explorer/services/elasticsearch-index-menu.service'
import {useDataSourceFlatNodes} from '@/features/explorer/composables/useDataSourceFlatNodes'
import {
    buildExplorerNodeInfo,
    buildViewModelExplorerInfo,
    isExplorerInfoNode,
    prepareExplorerInfoNode,
} from '@/features/explorer/services/explorer-node-info.service'
import {
    buildDatabaseConsoleContext,
    createNewSqlEditor,
    openBlankSqlConsole,
    openLatestSqlEditor,
} from '@/features/explorer/services/sql-editor-actions.service'
import type {DatabaseConsoleContext} from '@/features/explorer/services/sql-editor-actions.service'
import {normalizeRenameInput, resolveExplorerNodeOpenKind} from '@/features/explorer/services/explorer-node-open.service'
import {mapDatabaseShortcutToSqlEditorAction, resolveDatabaseSqlEditorMenuAction} from '@/features/explorer/services/sql-editor-menu-actions'
import {
    isCopyNameMenuAction,
    isEditConnectionMenuAction,
    isMoveHereMenuAction,
    isOpenMenuAction,
    isPinMenuAction,
    isRestoreWizardMenuAction,
    isSqlExportClipboardMenuAction,
    listSshScriptRecordTabIds,
    resolveCatalogDeletedMessageKey,
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
import {
    resolveExplorerDeleteShortcutUiPlan,
    resolveShortcutEditCommand,
    resolveShortcutOpenCommand,
} from '@/features/explorer/services/explorer-shortcut-commands.service'
import {resolveTablesRefreshScope} from '@/features/explorer/services/explorer-refresh-scope.service'
import {openSqlFileFromTree} from '@/features/explorer/services/instance-console.service'
import {deleteInstanceSqlScript} from '@/features/explorer/services/sql-script.service'
import {useScriptHistoryDrawerStore} from '@/features/explorer/stores/script-history-drawer-store'
import {executeSqlFileContent, runSqlFileForDatabase} from '@/features/explorer/services/run-sql-file.service'
import {
    resolvePlatformFeatureId,
} from '@/features/explorer/services/explorer-ai-tree.service'
import type {PlatformFeatureId} from '@/features/platform/types/platform.types'
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
    buildDropTableSql,
    buildInsertStatementsFromCsv,
    buildTruncateTableSql,
    exportTableDataCsv,
    parseSpreadsheetFile,
    pickSpreadsheetFile,
    resolveOpenTableWorkspaceArgs,
    resolveTableContext,
    resolveTableDataIoMessageKey,
} from '@/features/explorer/services/table-context-actions.service'
import {
    resolveExplorerFavoritesNavIntent,
    resolveExplorerNodeSelectIntent,
} from '@/features/explorer/services/explorer-node-select.service'
import {filterCreateNamespaceMenuItems, resolveCreateNamespaceErrorMessage} from '@/features/explorer/services/create-namespace.service'
import {canDdlConnection, canDmlConnection} from '@/features/team/services/connection-access.service'
import {useTeamStore} from '@/features/team/stores/team-store'
import {resolveCaughtApiErrorMessage} from '@/shared/api'
import {
    applySqlExportWizardOutput,
    countTablesUnderDatabase,
    resolveSqlExportWizardMessageKey,
    runSqlExportWizard,
    type SqlExportWizardContext,
    type SqlExportWizardForm,
} from '@/features/explorer/services/sql-export-wizard.service'
import {resolveRestoreWizardMessageKey} from '@/features/explorer/services/restore-wizard-messages'
import {
    loadRestoreWizardFile,
    resolveRestoreWizardContext,
    type RestoreWizardContext,
    type RestoreWizardFileState,
} from '@/features/explorer/services/restore-wizard.service'
import {resolveProductionApprovalTeams} from '@/features/team/services/production-approval-policy.service'
import {isProductionEnvironment} from '@/features/connection/services/connection-environment.service'
import {
    resolveTableMigrationContext,
} from '@/features/explorer/services/table-migration.service'
import {parseRedisKeyFromNodeId} from '@/features/explorer/services/redis-key.service'
import {parseKafkaTopicFromNodeId} from '@/features/explorer/services/kafka-topic.service'
import {
    resolveKafkaTablePublishContext,
} from '@/features/explorer/services/kafka-table-publish.service'
import {
    parseSshScriptRecordId,
    parseSshScriptRecordsConnectionId,
    parseSshTerminalConnectionId,
    sshScriptRecordNodeId,
    buildSshScriptRecordMenuItems as createSshScriptRecordMenuItems,
    buildSshScriptRecordsMenuItems as createSshScriptRecordsMenuItems,
    buildSshTerminalMenuItems as createSshTerminalMenuItems,
} from '@/features/explorer/services/ssh-feature-tree.service'
import {
    buildPinContextMenuItems as createPinContextMenuItems,
    buildSpecializedConnectionMenuItems,
    isExplorerUiBlocking,
    prependJdbcSshTunnelMenuItems,
    prependMoveConnectionHereMenuItems,
    resolveDeleteCatalogDialogCopy,
    resolveExplorerContextMenuType,
    withCsvImportMenuDisabled,
} from '@/features/explorer/services/explorer-context-menu-builders.service'
import {
    buildExplorerConnectionMenuItems as buildExplorerConnectionMenuItemsForTree,
    buildExplorerGroupMenuItems as buildExplorerGroupMenuItemsForTree,
    buildExplorerPinContextMenuItems as buildExplorerPinContextMenuItemsForTree,
    buildExplorerSshScriptRecordMenuItems as buildExplorerSshScriptRecordMenuItemsForTree,
    buildExplorerSshScriptRecordsMenuItems as buildExplorerSshScriptRecordsMenuItemsForTree,
    buildExplorerSshTerminalMenuItems as buildExplorerSshTerminalMenuItemsForTree,
    type ExplorerContextMenuDeps,
} from '@/features/explorer/services/explorer-context-menu.service'
import {useExplorerRestoreWizard} from '@/features/explorer/composables/useExplorerRestoreWizard'
import {useExplorerSqlExportWizard} from '@/features/explorer/composables/useExplorerSqlExportWizard'
import {
    buildPlatformWorkspaceOpenHandlers,
    dispatchPlatformWorkspaceOpen,
    resolveNewSshTerminalConnectionId,
    resolvePlatformConnectionMenuOpen,
    resolvePlatformFeatureNodeOpen,
    type PlatformWorkspaceOpenHandlers,
} from '@/features/explorer/services/explorer-platform-menu-actions.service'
import {
    createEmptySshScriptRecord,
} from '@/features/ssh/types/ssh-script-record.types'
import {resolveSshScriptRecordMessageKey} from '@/features/ssh/services/ssh-script-record-messages'
import {
    deleteSshScriptRecord,
    listSshScriptRecords,
    saveSshScriptRecord,
} from '@/features/ssh/services/ssh-script-records.service'
import {resolveViewModelMessageKey} from '@/features/explorer/services/view-model-messages'
import {resolveExplorerSqlFileMessageKey} from '@/features/explorer/services/explorer-sql-file-messages'
import {resolveExplorerCatalogMessageKey} from '@/features/explorer/services/explorer-catalog-messages'
import {resolveExplorerFeatureMessageKey} from '@/features/explorer/services/explorer-feature-messages'
import {resolvePinToastMessageKey} from '@/features/explorer/services/explorer-pinned-sort.service'
import {
    isExplorerFavoritesTreeNode,
    openPinnedTableFavorite,
    shouldOpenFavoriteTable,
} from '@/features/explorer/services/explorer-favorites.actions'
import {
    resolveExplorerSqlFileScope,
} from '@/features/explorer/services/explorer-database-scope'
import {
    canMoveConnectionToGroup,
    injectConnectionMoveSubmenu,
    listConnectionMoveTargets,
    parseMoveTargetMenuId,
} from '@/features/explorer/services/explorer-move-connection.service'
import {
    parseMoveToProjectMenuId,
    parseShareToProjectMenuId,
} from '@/features/explorer/services/explorer-project-connection.service'
import {useProjectStore} from '@/features/project/stores/project'
import {
    buildConnectionLifecycleMenuItems,
    prependConnectionLifecycleMenu,
    resolveConnectionLinkState,
} from '@/features/explorer/services/explorer-connection-lifecycle.service'
import {resolveConnectionDbType} from '@/features/explorer/services/explorer-lazy-load'
import {
    registerExplorerDatabaseShortcutHandler,
} from '@/features/explorer/services/explorer-database-shortcuts.service'
import type {ExplorerDatabaseShortcutAction} from '@/features/explorer/services/explorer-database-shortcuts.service'
import {
    clearExplorerNodeShortcutHandlers,
    registerExplorerNodeShortcutHandlers,
} from '@/features/explorer/services/explorer-node-shortcuts.service'
import {
    filterConnectionCapabilityMenuItems,
    filterSqlContextMenuItems,
    isCsvImportSupported,
} from '@/shared/capabilities/db-type-capabilities'
import {CAPABILITY_HINT_I18N} from '@/shared/capabilities/capability-keys'
import {executeSqlBatch} from '@/features/workspace/services/sql-batch-execute.service'
import {resolveClientMaxResultRows} from '@/features/settings/services/query-limit.service'
import {sqlFileNameFromTabLabel} from '@/features/workspace/services/console-tab-title'
import {useDatasourceCatalogStore} from '@/features/datasource/stores/datasource-catalog'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {resolveConnectionCatalogErrorMessage} from '@/features/connection/services/connection-catalog.service'
import {canManageExplorerConnectionLifecycle, canMutateConnectionCatalog} from '@/features/auth/services/feature-permission.service'
import {useAuthStore} from '@/features/auth/stores/auth-store'
import {useShortcutPanelStore} from '@/features/layout/stores/shortcut-panel-store'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import {
    planOpenElasticsearchConsole,
    planOpenKafkaTopics,
    planOpenMongoConsole,
    planOpenRedisConsole,
    planOpenRedisKey,
} from '@/features/workspace'
import {usePluginStore} from '@/features/plugin/stores/plugin-store'
import {useEntitlementStore} from '@/features/pack/stores/entitlement-store'
import {filterPluginGatedMenuItems} from '@/features/plugin/services/plugin-registry.service'
import {
    canRunExplorerContextMenuAction,
    filterExplorerContextMenuByPermission,
} from '@/features/explorer/services/explorer-context-menu-permission.service'
import {explorerApi, instanceSqlApi, sqlApi, tableDataApi, tableDetailApi} from '@/api'
import {
    resolveViewModelScope,
    resolveViewsFolderScope,
    viewModelApi,
} from '@/api/modules/view-model'
import {resolveRenameViewModelPlan} from '@/features/explorer/services/view-model-naming'
import {resolveRenameSqlFilePlan} from '@/features/explorer/services/sql-script-naming'
import {fetchConnectionConfig} from '@/shared/config/connections-catalog.service'
import {isJdbcSshTunnelEnabled, supportsJdbcTunnelSshMenu} from '@/features/ssh/services/ssh-jdbc-tunnel.service'
import {EXPLORER_INFO_SYNC_DELAY_MS} from '@/features/explorer/constants/explorer-info-sync'
import {
    appendCommunityContextMenuItems,
    parseCommunityContextMenuActionId,
} from '@/features/community-plugin/lib/community-context-menu'
import {useCommunityPluginContributionStore} from '@/features/community-plugin/stores/community-plugin-contributions'
import {createHttpCommunityPluginsApi} from '@/shared/api/http/community-plugins'

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
    const explorerMenuDeps: ExplorerContextMenuDeps = {t, explorer, catalogStore, teamStore, projectStore}

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
    const connectionDragEnabled = computed(() => canMutateConnectionCatalog(auth.isGuest))

    const {visible: menuVisible, pos: menuPos, target: contextNode, open, close: closeMenu} =
        useContextMenuAnchor<TreeNode>()
    const menuItems = ref<ContextMenuItem[]>([])

    const showDeleteSqlDialog = ref(false)
    const treeInline = ref<{
        kind:
            | 'create-project-file'
            | 'create-project-folder'
            | 'create-subgroup'
            | 'create-root-group'
            | 'rename-group'
            | 'rename-sql'
            | 'rename-project-file'
        nodeId: string
        value: string
        parentId?: string
        targetId?: string
    } | null>(null)
    const treeInlineCommitting = ref(false)
    const pendingProjectFilesFolder = ref<TreeNode | null>(null)
    const deleteSqlMessage = ref('')
    const pendingGroupNode = ref<TreeNode | null>(null)
    const pendingSqlFileNode = ref<TreeNode | null>(null)
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


    const flatNodes = useDataSourceFlatNodes(toRef(explorer, 'debouncedSearchQuery')).flatNodes

    let explorerInfoSyncToken = 0

    function cancelScheduledExplorerInfoSync() {
        explorerInfoSyncToken += 1
    }

    function scheduleExplorerInfoSync(node: TreeNode) {
        if (!isExplorerInfoNode(node)) return
        const token = ++explorerInfoSyncToken
        window.setTimeout(() => {
            if (token !== explorerInfoSyncToken) return
            void syncExplorerInfoForNode(node)
        }, EXPLORER_INFO_SYNC_DELAY_MS)
    }

    function scheduleViewModelExplorerInfoSync(node: TreeNode) {
        const token = ++explorerInfoSyncToken
        window.setTimeout(() => {
            if (token !== explorerInfoSyncToken) return
            void syncViewModelExplorerInfo(node)
        }, EXPLORER_INFO_SYNC_DELAY_MS)
    }

    async function syncViewModelExplorerInfo(node: TreeNode) {
        const connectionId = findConnectionId(node)
        const scope = resolveViewModelScope(explorer.tree, node.id)
        if (!connectionId || !scope) return
        const connection = findAncestorByType(explorer.tree, node.id, 'connection')
        try {
            const result = await viewModelApi.read({
                connectionId,
                instanceName: scope.instanceLabel,
                name: node.label,
            })
            shortcutPanel.syncExplorerInfo(buildViewModelExplorerInfo({
                title: node.label,
                sourceNodeId: node.id,
                connectionLabel: connection?.label,
                instanceLabel: scope.instanceLabel,
                sql: result.sql,
            }))
        } catch {
            shortcutPanel.syncExplorerInfo(buildViewModelExplorerInfo({
                title: node.label,
                sourceNodeId: node.id,
                connectionLabel: connection?.label,
                instanceLabel: scope.instanceLabel,
            }))
        }
    }

    async function syncExplorerInfoForNode(node: TreeNode) {
        if (!isExplorerInfoNode(node)) return
        const prepared = await prepareExplorerInfoNode(
            node,
            explorer.tree,
            (nodeId) => explorer.ensureChildrenLoaded(nodeId),
            (nodeId) => explorer.findNode(nodeId),
        )
        await explorer.prefetchSemanticMetricsForNode(prepared.id)
        const scope = findAncestorByType(explorer.tree, prepared.id, 'database')
        const connectionId = findConnectionId(prepared)
        const semanticIndex = connectionId && scope
            ? explorer.getSemanticIndex(connectionId, scope.label)
            : null
        shortcutPanel.syncExplorerInfo(buildExplorerNodeInfo(prepared, explorer.tree, semanticIndex))
    }

    function findConnectionId(node: TreeNode): string | undefined {
        return resolveConnectionIdFromTree(explorer.tree, node.id)
    }

    async function openViewModelDataFromNode(node: TreeNode) {
        const connectionId = findConnectionId(node)
        const scope = resolveViewModelScope(explorer.tree, node.id)
        if (!connectionId || !scope) return
        try {
            const result = await viewModelApi.read({
                connectionId,
                instanceName: scope.instanceLabel,
                name: node.label,
            })
            workspace.openViewModelData({
                viewModelName: node.label,
                viewModelSql: result.sql,
                connectionId,
                instanceId: scope.scopeNode.id,
                database: scope.instanceLabel,
                explorerNodeId: node.id,
            })
        } catch {
            layout.showErrorToast(t(resolveViewModelMessageKey('loadFailed')))
        }
    }

    async function openViewModelConsoleFromNode(node: TreeNode) {
        const connectionId = findConnectionId(node)
        const scope = resolveViewModelScope(explorer.tree, node.id)
        if (!connectionId || !scope) return
        try {
            const result = await viewModelApi.read({
                connectionId,
                instanceName: scope.instanceLabel,
                name: node.label,
            })
            await workspace.openViewModelConsole({
                viewModelName: node.label,
                sql: result.sql,
                connectionId,
                connectionName: findConnectionLabel(connectionId),
                instanceId: scope.scopeNode.id,
                database: scope.instanceLabel,
                explorerNodeId: node.id,
            })
            layout.setModule('database')
        } catch {
            layout.showErrorToast(t(resolveViewModelMessageKey('loadFailed')))
        }
    }

    async function openSqlFile(node: TreeNode) {
        layout.setModule('database')
        try {
            if (node.id.startsWith('project-file:')) {
                const {openProjectFileNode} = await import(
                    '@/features/project/services/project-explorer-files'
                )
                await openProjectFileNode(node)
                return
            }
            await openSqlFileFromTree(explorer.tree, node)
        } catch {
            layout.showErrorToast(t(resolveExplorerFeatureMessageKey('loadSqlFileFailed')))
        }
    }

    async function openProjectFile(node: TreeNode) {
        layout.setModule('database')
        const {openProjectFileNode} = await import('@/features/project/services/project-explorer-files')
        await openProjectFileNode(node)
    }

    function resolveProjectFilesActionFolder(node: TreeNode): TreeNode {
        return resolveProjectFilesActionFolderHelper(node, (id) => explorer.findNode(id))
    }

    async function clearTreeInlineDraftNodes() {
        const {
            PROJECT_FILES_DRAFT_ID,
            GROUP_DRAFT_ID,
            removeProjectFilesDraft,
            ensureProjectFilesEmptyHint,
        } = await import('@/features/project/services/project-explorer-files')
        const {findParentNode} = await import('@/core/utils/tree')
        const projectDraftParent =
            pendingProjectFilesFolder.value
            ?? findParentNode(explorer.tree, PROJECT_FILES_DRAFT_ID)
        if (projectDraftParent) {
            const live = explorer.findNode(projectDraftParent.id) ?? projectDraftParent
            removeProjectFilesDraft(live)
            ensureProjectFilesEmptyHint(live)
        }
        pendingProjectFilesFolder.value = null

        const groupParent = findParentNode(explorer.tree, GROUP_DRAFT_ID)
        if (groupParent?.children) {
            groupParent.children = groupParent.children.filter((c) => c.id !== GROUP_DRAFT_ID)
            if (!groupParent.children.length) {
                groupParent.expanded = false
            }
        } else {
            const idx = explorer.tree.findIndex((n) => n.id === GROUP_DRAFT_ID)
            if (idx >= 0) explorer.tree.splice(idx, 1)
        }
        explorer.touchTree()
    }

    async function cancelTreeInlineEdit() {
        if (!treeInline.value) return
        const kind = treeInline.value.kind
        treeInline.value = null
        if (
            kind === 'create-project-file'
            || kind === 'create-project-folder'
            || kind === 'create-subgroup'
            || kind === 'create-root-group'
        ) {
            await clearTreeInlineDraftNodes()
        }
    }

    function onTreeInlineInput(value: string) {
        if (!treeInline.value) return
        treeInline.value = {...treeInline.value, value}
        const draft = explorer.findNode(treeInline.value.nodeId)
        if (draft && (draft.type === 'project-files-draft' || draft.type === 'group-draft')) {
            draft.label = value
        }
    }

    async function beginProjectInlineCreate(node: TreeNode, mode: 'file' | 'folder') {
        const {
            PROJECT_FILES_DRAFT_ID,
            removeProjectFilesDraft,
            isProjectFilesHintNode,
            resolveProjectFilesFolderContext,
        } = await import('@/features/project/services/project-explorer-files')
        await cancelTreeInlineEdit()

        const folder = resolveProjectFilesActionFolder(node)
        if (!resolveProjectFilesFolderContext(folder)) {
            layout.showErrorToast(t('explorer.projectFiles.createFailed'))
            return
        }

        await explorer.expandAndLoad(folder.id, {load: true, notify: false})
        const live = explorer.findNode(folder.id)
        if (!live) return

        removeProjectFilesDraft(live)
        live.children = (live.children ?? []).filter((child) => !isProjectFilesHintNode(child))
        const defaultName =
            mode === 'file'
                ? t('explorer.projectFiles.fileDefault')
                : t('explorer.projectFiles.folderDefault')
        live.children = [
            {
                id: PROJECT_FILES_DRAFT_ID,
                label: defaultName,
                type: 'project-files-draft',
                meta: mode,
            },
            ...(live.children ?? []),
        ]
        live.expanded = true
        live.meta = 'loaded'
        pendingProjectFilesFolder.value = live
        treeInline.value = {
            kind: mode === 'file' ? 'create-project-file' : 'create-project-folder',
            nodeId: PROJECT_FILES_DRAFT_ID,
            value: defaultName,
            parentId: live.id,
        }
        explorer.touchTree()
        explorer.selectNode(PROJECT_FILES_DRAFT_ID)
    }

    async function beginCreateRootGroup() {
        if (!canMutateConnectionCatalog(auth.isGuest)) {
            layout.showErrorToast(t(resolveExplorerCatalogMessageKey('permissionDenied')))
            return
        }
        await cancelTreeInlineEdit()
        const {GROUP_DRAFT_ID} = await import('@/features/project/services/project-explorer-files')
        const defaultName = t(resolveExplorerCatalogMessageKey('folderNameDefault'))
        const existing = explorer.tree.findIndex((n) => n.id === GROUP_DRAFT_ID)
        if (existing >= 0) explorer.tree.splice(existing, 1)
        explorer.tree.unshift({
            id: GROUP_DRAFT_ID,
            label: defaultName,
            type: 'group-draft',
        })
        treeInline.value = {
            kind: 'create-root-group',
            nodeId: GROUP_DRAFT_ID,
            value: defaultName,
        }
        explorer.touchTree()
        explorer.selectNode(GROUP_DRAFT_ID)
    }

    async function beginCreateSubgroup(parent: TreeNode) {
        if (!canMutateConnectionCatalog(auth.isGuest)) {
            layout.showErrorToast(t(resolveExplorerCatalogMessageKey('permissionDenied')))
            return
        }
        await cancelTreeInlineEdit()
        const {GROUP_DRAFT_ID} = await import('@/features/project/services/project-explorer-files')
        const live = explorer.findNode(parent.id) ?? parent
        if (live.type !== 'group') return
        live.expanded = true
        const defaultName = t(resolveExplorerCatalogMessageKey('folderNameDefault'))
        live.children = [
            {
                id: GROUP_DRAFT_ID,
                label: defaultName,
                type: 'group-draft',
            },
            ...(live.children ?? []).filter((c) => c.id !== GROUP_DRAFT_ID),
        ]
        treeInline.value = {
            kind: 'create-subgroup',
            nodeId: GROUP_DRAFT_ID,
            value: defaultName,
            parentId: live.id,
        }
        pendingGroupNode.value = live
        explorer.touchTree()
        explorer.selectNode(GROUP_DRAFT_ID)
    }

    async function beginRenameGroup(node: TreeNode) {
        if (!canMutateConnectionCatalog(auth.isGuest)) {
            layout.showErrorToast(t(resolveExplorerCatalogMessageKey('permissionDenied')))
            return
        }
        await cancelTreeInlineEdit()
        pendingGroupNode.value = node
        treeInline.value = {
            kind: 'rename-group',
            nodeId: node.id,
            value: node.label,
            targetId: node.id,
        }
    }

    async function beginRenameSqlFile(node: TreeNode) {
        await cancelTreeInlineEdit()
        const {stripSqlExtension} = await import('@/features/explorer/services/sql-script-naming')
        pendingSqlFileNode.value = node
        treeInline.value = {
            kind: 'rename-sql',
            nodeId: node.id,
            value: stripSqlExtension(node.label),
            targetId: node.id,
        }
    }

    async function beginRenameProjectFile(node: TreeNode) {
        if (node.type === 'project-files-hint' || !node.id.startsWith('project-file:')) return
        await cancelTreeInlineEdit()
        treeInline.value = {
            kind: 'rename-project-file',
            nodeId: node.id,
            value: node.label,
            targetId: node.id,
        }
    }

    async function createProjectSqlFromMenu(node: TreeNode) {
        const folder = resolveProjectFilesActionFolder(node)
        try {
            const {createProjectSqlFile, openProjectFileNode} = await import(
                '@/features/project/services/project-explorer-files'
            )
            const created = await createProjectSqlFile(folder)
            if (!created) {
                layout.showErrorToast(t('explorer.projectFiles.createFailed'))
                return
            }
            layout.showSuccessToast(t('explorer.projectFiles.created', {name: created.name}))
            const createdNode = explorer.findNode(created.nodeId)
            if (createdNode) {
                explorer.selectNode(created.nodeId)
                await openProjectFileNode(createdNode)
            }
        } catch {
            layout.showErrorToast(t('explorer.projectFiles.createFailed'))
        }
    }

    async function commitTreeInlineEdit() {
        if (treeInlineCommitting.value || !treeInline.value) return
        treeInlineCommitting.value = true
        const session = treeInline.value
        const trimmed = session.value.trim()
        try {
            if (session.kind === 'create-project-file' || session.kind === 'create-project-folder') {
                const {
                    createProjectTextFile,
                    createProjectFolder,
                    openProjectFileNode,
                    removeProjectFilesDraft,
                    ensureProjectFilesEmptyHint,
                } = await import('@/features/project/services/project-explorer-files')
                const {isLocalBinaryFileName} = await import(
                    '@/features/local-files/services/local-files-path'
                )
                const folder = pendingProjectFilesFolder.value
                treeInline.value = null
                if (!folder) return
                removeProjectFilesDraft(folder)
                pendingProjectFilesFolder.value = null
                explorer.touchTree()

                if (!trimmed || /[/\\]/.test(trimmed)) {
                    ensureProjectFilesEmptyHint(folder)
                    explorer.touchTree()
                    return
                }
                if (session.kind === 'create-project-folder') {
                    const nodeId = await createProjectFolder({folderNode: folder, folderName: trimmed})
                    if (!nodeId) {
                        layout.showErrorToast(t('explorer.projectFiles.createFailed'))
                        return
                    }
                    layout.showSuccessToast(t('explorer.projectFiles.folderCreated', {name: trimmed}))
                    explorer.selectNode(nodeId)
                    await explorer.toggleExpand(nodeId)
                    return
                }
                const fileName = trimmed.includes('.') ? trimmed : `${trimmed}.txt`
                if (isLocalBinaryFileName(fileName)) {
                    layout.showErrorToast(t('explorer.projectFiles.unsupportedType'))
                    ensureProjectFilesEmptyHint(folder)
                    explorer.touchTree()
                    return
                }
                const created = await createProjectTextFile({
                    folderNode: folder,
                    fileName,
                    content: '',
                })
                if (!created) {
                    layout.showErrorToast(t('explorer.projectFiles.createFailed'))
                    return
                }
                layout.showSuccessToast(t('explorer.projectFiles.created', {name: created.name}))
                const createdNode = explorer.findNode(created.nodeId)
                if (createdNode) {
                    explorer.selectNode(created.nodeId)
                    await openProjectFileNode(createdNode)
                }
                return
            }

            if (session.kind === 'create-root-group' || session.kind === 'create-subgroup') {
                treeInline.value = null
                await clearTreeInlineDraftNodes()
                if (!trimmed) return
                try {
                    if (session.kind === 'create-root-group') {
                        await explorer.addRootFolder(trimmed)
                        layout.showSuccessToast(t('explorer.folderCreated', {name: trimmed}))
                    } else {
                        const parentId = session.parentId
                        if (!parentId) return
                        await explorer.addGroup(trimmed, parentId)
                        layout.showSuccessToast(
                            t(resolveExplorerCatalogMessageKey('subgroupCreated'), {name: trimmed}),
                        )
                    }
                } catch (error) {
                    layout.showErrorToast(resolveConnectionCatalogErrorMessage(error, t, 'save'))
                }
                return
            }

            if (session.kind === 'rename-group') {
                const node = pendingGroupNode.value
                treeInline.value = null
                pendingGroupNode.value = null
                if (!node || node.type !== 'group' || !trimmed || trimmed === node.label) return
                try {
                    await explorer.renameGroup(node.id, trimmed)
                    layout.showSuccessToast(
                        t(resolveExplorerCatalogMessageKey('groupRenamed'), {name: trimmed}),
                    )
                } catch (error) {
                    layout.showErrorToast(resolveConnectionCatalogErrorMessage(error, t, 'save'))
                }
                return
            }

            if (session.kind === 'rename-sql') {
                const node = pendingSqlFileNode.value
                treeInline.value = null
                pendingSqlFileNode.value = null
                if (!node || node.type !== 'sql_file') return
                if (!trimmed) return
                const plan = resolveRenameSqlFilePlan(sqlFileNameFromTabLabel(trimmed), node.label)
                if (!plan.ok) {
                    if (plan.reason === 'invalid-name') {
                        layout.showErrorToast(t(resolveExplorerSqlFileMessageKey('invalidName')))
                    }
                    return
                }
                const connectionId = findConnectionId(node)
                const scope = resolveExplorerSqlFileScope(explorer.tree, node.id)
                if (!connectionId || !scope) {
                    layout.showErrorToast(t(resolveExplorerSqlFileMessageKey('renameFailed')))
                    return
                }
                try {
                    const result = await instanceSqlApi.rename({
                        connectionId,
                        instanceName: scope.instanceLabel,
                        oldFileName: node.label,
                        newFileName: plan.newBaseName,
                    })
                    await explorer.reloadWorkspacesFolder(
                        connectionId,
                        scope.instanceLabel,
                        scope.scopeNode.id,
                    )
                    workspace.updateConsoleSqlFile({
                        connectionId,
                        instanceId: scope.scopeNode.id,
                        oldFileName: node.label,
                        newFileName: result.fileName,
                        connectionName: findConnectionLabel(connectionId),
                    })
                    layout.showSuccessToast(
                        t(resolveExplorerSqlFileMessageKey('renamed'), {name: result.fileName}),
                    )
                } catch {
                    layout.showErrorToast(t(resolveExplorerSqlFileMessageKey('renameFailed')))
                }
                return
            }

            if (session.kind === 'rename-project-file') {
                const targetId = session.targetId
                treeInline.value = null
                if (!targetId || !trimmed) return
                const node = explorer.findNode(targetId)
                if (!node) return
                if (trimmed === node.label) return
                try {
                    const {renameProjectFileNode} = await import(
                        '@/features/project/services/project-explorer-files'
                    )
                    const result = await renameProjectFileNode(node, trimmed)
                    if (!result) {
                        layout.showErrorToast(t('explorer.projectFiles.renameFailed'))
                        return
                    }
                    layout.showSuccessToast(t('explorer.projectFiles.renamed', {name: result.name}))
                    explorer.selectNode(result.nodeId)
                } catch (err) {
                    if (err instanceof Error && err.message === 'unsupported_file') {
                        layout.showErrorToast(t('explorer.projectFiles.unsupportedType'))
                    } else {
                        layout.showErrorToast(t('explorer.projectFiles.renameFailed'))
                    }
                }
            }
        } catch {
            layout.showErrorToast(t('explorer.projectFiles.createFailed'))
        } finally {
            treeInlineCommitting.value = false
        }
    }

    async function refreshProjectFilesFromMenu(node: TreeNode) {
        const folder = resolveProjectFilesActionFolder(node)
        const {refreshProjectFilesFolder} = await import(
            '@/features/project/services/project-explorer-files'
        )
        try {
            await refreshProjectFilesFolder(folder.id)
        } catch {
            layout.showErrorToast(t('explorer.projectFiles.createFailed'))
        }
    }

    async function onSelect(node: TreeNode) {
        const selectIntent = resolveExplorerNodeSelectIntent(node)
        if (selectIntent.kind === 'load-more') {
            if (explorer.loadingNodeIds.has(node.id)) return
            await explorer.toggleExpand(node.id)
            return
        }
        if (selectIntent.kind === 'favorites-show-all') {
            explorer.showAllFavoriteTables()
            return
        }
        if (selectIntent.kind === 'favorites-select') {
            explorer.selectNode(node.id)
            return
        }
        explorer.selectNode(node.id)
        if (selectIntent.sync === 'view-model') {
            scheduleViewModelExplorerInfoSync(node)
            return
        }
        scheduleExplorerInfoSync(node)
    }

    async function onOpen(node: TreeNode) {
        cancelScheduledExplorerInfoSync()
        const favoritesNav = resolveExplorerFavoritesNavIntent(node)
        if (favoritesNav === 'show-all') {
            explorer.showAllFavoriteTables()
            return
        }
        if (favoritesNav === 'select-group') {
            explorer.selectNode(node.id)
            return
        }
        const favorite = shouldOpenFavoriteTable(node)
        if (favorite && !explorer.findNode(node.id)) {
            await openPinnedTableFavorite(favorite)
            return
        }
        explorer.selectNode(node.id)
        const openKind = resolveExplorerNodeOpenKind(node)
        if (openKind === 'table-or-view') {
            const favorite = shouldOpenFavoriteTable(node)
            if (favorite && !explorer.findNode(node.id)) {
                await openPinnedTableFavorite(favorite)
                return
            }
            const tableCtx = resolveTableContext(explorer.tree, node)
            if (tableCtx?.dbType === 'mongodb') {
                layout.setModule('database')
                workspace.openWithPlan(
                    planOpenMongoConsole,
                    {
                        connectionId: tableCtx.connectionId,
                        connectionName: findConnectionLabel(tableCtx.connectionId) ?? tableCtx.connectionId,
                        database: tableCtx.database,
                        collectionName: tableCtx.tableName,
                        explorerNodeId: tableCtx.nodeId,
                    },
                    'mongodb',
                )
                return
            }
            if (tableCtx?.dbType === 'elasticsearch') {
                layout.setModule('database')
                workspace.openWithPlan(
                    planOpenElasticsearchConsole,
                    {
                        connectionId: tableCtx.connectionId,
                        connectionName: findConnectionLabel(tableCtx.connectionId) ?? tableCtx.connectionId,
                        explorerNodeId: tableCtx.nodeId,
                        view: 'documents',
                        indexName: tableCtx.tableName,
                    },
                    'elasticsearch',
                )
                return
            }
            openTableFromNode(node, 'data')
            return
        }
        if (openKind === 'sql-file') {
            void openSqlFile(node)
            return
        }
        if (openKind === 'project-file') {
            void openProjectFile(node)
            return
        }
        if (openKind === 'view-model-draft') {
            await openViewModelConsoleFromNode(node)
            return
        }
        if (openKind === 'view-model-data') {
            await openViewModelDataFromNode(node)
            return
        }
        if (openKind === 'platform-feature') {
            const connectionId = findConnectionId(node)
            const scope = resolveExplorerSqlFileScope(explorer.tree, node.id)
            if (!connectionId || !scope) return
            const feature = resolvePlatformFeatureId(node) as PlatformFeatureId
            workspace.openPlatformCatalog({
                feature,
                connectionId,
                database: scope.instanceLabel,
                instanceId: scope.scopeNode.id,
                explorerNodeId: node.id,
            })
            layout.setModule('database')
            return
        }
        if (openKind === 'redis-key') {
            const connectionId = findConnectionId(node)
            const key = connectionId ? parseRedisKeyFromNodeId(node.id, connectionId) : null
            if (!connectionId || !key) return
            workspace.openWithPlan(
                planOpenRedisKey,
                {connectionId, key, explorerNodeId: node.id},
                'redis',
            )
            return
        }
        if (openKind === 'redis-browser') {
            const connectionId = findConnectionId(node)
            if (!connectionId) return
            workspace.openWithPlan(
                planOpenRedisConsole,
                {
                    connectionId,
                    connectionName: findConnectionLabel(connectionId) ?? connectionId,
                    explorerNodeId: connectionId,
                    view: 'keys',
                },
                'redis',
            )
            return
        }
        const platformFeatureOpen = resolvePlatformFeatureNodeOpen(node)
        if (platformFeatureOpen) {
            const connectionId = findConnectionId(node)
            if (!connectionId) return
            dispatchPlatformWorkspaceOpen(
                platformFeatureOpen,
                {
                    connectionId,
                    connectionName: findConnectionLabel(connectionId) ?? connectionId,
                    explorerNodeId: connectionId,
                },
                platformWorkspaceOpenHandlers(),
            )
            return
        }
        if (openKind === 'kafka-topic') {
            const connectionId = findConnectionId(node)
            const topic = connectionId ? parseKafkaTopicFromNodeId(node.id, connectionId) : null
            if (!connectionId || !topic) return
            workspace.openWithPlan(
                planOpenKafkaTopics,
                {
                    connectionId,
                    connectionName: findConnectionLabel(connectionId) ?? connectionId,
                    explorerNodeId: connectionId,
                    topic,
                },
                'kafka',
            )
            return
        }
        if (openKind === 'ssh-terminal') {
            const connectionId = findConnectionId(node) ?? parseSshTerminalConnectionId(node.id) ?? undefined
            if (!connectionId) return
            workspace.openSshTerminal({
                connectionId,
                connectionName: findConnectionLabel(connectionId) ?? connectionId,
                explorerNodeId: connectionId,
            })
            return
        }
        if (openKind === 'ssh-script-record') {
            const connectionId = findConnectionId(node)
            const recordId = parseSshScriptRecordId(node)
            if (!connectionId || !recordId) return
            void openSshScriptRecordFromNode(connectionId, recordId, node.label, node.id)
            return
        }
        if (openKind === 'ssh-script-records') {
            await explorer.toggleExpand(node.id)
            return
        }
        if (openKind === 'connection') {
            if (!canManageExplorerConnectionLifecycle(auth.isGuest)) return
            await explorer.connectConnection(node.id, {notify: true})
            return
        }
        if (openKind === 'database') {
            const connectionId = findConnectionId(node)
            if (!connectionId) return
            layout.setModule('database')
            const connectionNode = explorer.findNode(connectionId)
            if (connectionNode?.dbType === 'mongodb') {
                workspace.openWithPlan(
                    planOpenMongoConsole,
                    {
                        connectionId,
                        connectionName: findConnectionLabel(connectionId) ?? connectionId,
                        database: node.label,
                        explorerNodeId: node.id,
                    },
                    'mongodb',
                )
                return
            }
            void openLatestSqlEditor(explorer.tree, node, findConnectionLabel(connectionId))
                .catch(() => layout.showErrorToast(t(resolveExplorerFeatureMessageKey('loadSqlFileFailed'))))
            return
        }
        if (openKind === 'expand') {
            if (canExpandTreeNode(node)) await explorer.toggleExpand(node.id)
        }
    }

    function findConnectionLabel(connectionId?: string): string | undefined {
        return resolveConnectionLabel((id) => explorer.findNode(id), connectionId)
    }

    async function openSshScriptRecordFromNode(
        connectionId: string,
        recordId: string,
        title: string,
        explorerNodeId?: string,
    ) {
        try {
            const records = await listSshScriptRecords(connectionId)
            const record = records.find((item) => item.id === recordId)
            workspace.openSshScriptRecord({
                connectionId,
                connectionName: findConnectionLabel(connectionId) ?? connectionId,
                recordId,
                title: record?.title ?? title,
                contentHtml: record?.contentHtml ?? '',
                updatedAt: record?.updatedAt,
                explorerNodeId,
            })
        } catch {
            layout.showErrorToast(t(resolveSshScriptRecordMessageKey('loadFailed')))
        }
    }

    async function createSshScriptRecord(connectionId: string) {
        const record = createEmptySshScriptRecord(
            `record-${Date.now()}`,
            t(resolveSshScriptRecordMessageKey('newRecord')),
        )
        try {
            const saved = await saveSshScriptRecord(connectionId, record)
            const folder = explorer.findNode(`${connectionId}:ssh:script-records`)
            if (folder) {
                folder.meta = undefined
                folder.children = []
                await explorer.expandAndLoad(folder.id, {notify: false})
            }
            workspace.openSshScriptRecord({
                connectionId,
                connectionName: findConnectionLabel(connectionId) ?? connectionId,
                recordId: saved.id,
                title: saved.title,
                contentHtml: saved.contentHtml,
                updatedAt: saved.updatedAt,
                explorerNodeId: sshScriptRecordNodeId(connectionId, saved.id),
            })
        } catch {
            layout.showErrorToast(t(resolveSshScriptRecordMessageKey('createFailed')))
        }
    }

    async function refreshSshScriptRecordsFolder(node: TreeNode) {
        const connectionId = parseSshScriptRecordsConnectionId(node.id) ?? findConnectionId(node)
        if (!connectionId) return
        node.meta = undefined
        node.children = []
        await explorer.expandAndLoad(node.id, {notify: false})
    }

    async function deleteSshScriptRecordFromNode(node: TreeNode) {
        const connectionId = findConnectionId(node)
        const recordId = parseSshScriptRecordId(node)
        if (!connectionId || !recordId) return
        try {
            await deleteSshScriptRecord(connectionId, recordId)
            for (const tabId of listSshScriptRecordTabIds(workspace.tabs, connectionId, recordId)) {
                workspace.closeTab(tabId)
            }
            const folder = explorer.findNode(`${connectionId}:ssh:script-records`)
            if (folder) {
                await refreshSshScriptRecordsFolder(folder)
            }
            layout.showSuccessToast(t(resolveSshScriptRecordMessageKey('deleteSuccess')))
        } catch {
            layout.showErrorToast(t(resolveSshScriptRecordMessageKey('deleteFailed')))
        }
    }

    async function renameSshScriptRecordFromNode(node: TreeNode, nextTitle: string) {
        const connectionId = findConnectionId(node)
        const recordId = parseSshScriptRecordId(node)
        if (!connectionId || !recordId) return
        const trimmed = normalizeRenameInput(nextTitle, node.label)
        if (!trimmed) return
        try {
            const records = await listSshScriptRecords(connectionId)
            const record = records.find((item) => item.id === recordId)
            if (!record) {
                layout.showErrorToast(t(resolveSshScriptRecordMessageKey('loadFailed')))
                return
            }
            const saved = await saveSshScriptRecord(connectionId, {
                ...record,
                title: trimmed,
            })
            node.label = saved.title
            explorer.touchTree()
            layout.showSuccessToast(t(resolveSshScriptRecordMessageKey('renameSuccess')))
        } catch {
            layout.showErrorToast(t(resolveSshScriptRecordMessageKey('saveFailed')))
        }
    }

    function buildSshScriptRecordsMenuItems(): ContextMenuItem[] {
        return buildExplorerSshScriptRecordsMenuItemsForTree(explorerMenuDeps)
    }

    function buildSshScriptRecordMenuItems(): ContextMenuItem[] {
        return buildExplorerSshScriptRecordMenuItemsForTree(explorerMenuDeps)
    }

    function buildSshTerminalMenuItems(): ContextMenuItem[] {
        return buildExplorerSshTerminalMenuItemsForTree(explorerMenuDeps)
    }

    function buildConnectionMenuItems(node: TreeNode): ContextMenuItem[] {
        const base = buildExplorerConnectionMenuItemsForTree(node, explorerMenuDeps)
        const community = useCommunityPluginContributionStore()
        community.ensureLoaded()
        return appendCommunityContextMenuItems(base, community.contextMenusFor('connection'))
    }

    function buildGroupMenuItems(node: TreeNode): ContextMenuItem[] {
        return buildExplorerGroupMenuItemsForTree(node, explorerMenuDeps)
    }

    async function performMoveConnection(connectionId: string, targetGroupId: string) {
        if (!canMutateConnectionCatalog(auth.isGuest)) {
            layout.showErrorToast(t(resolveExplorerCatalogMessageKey('permissionDenied')))
            return
        }
        const connection = explorer.findNode(connectionId)
        const targetGroup = explorer.findNode(targetGroupId)
        if (!connection || connection.type !== 'connection') return
        if (!canMoveConnectionToGroup(explorer.tree, connectionId, targetGroupId)) return
        try {
            await explorer.moveConnection(connectionId, targetGroupId)
            layout.showSuccessToast(t(resolveExplorerCatalogMessageKey('connectionMoved'), {
                name: connection.label,
                folder: targetGroup?.label ?? targetGroupId,
            }))
        } catch (error) {
            layout.showErrorToast(resolveConnectionCatalogErrorMessage(error, t, 'save'))
        }
    }

    async function performReorderCatalog(
        nodeId: string,
        targetId: string,
        position: 'before' | 'after' | 'inside',
    ) {
        if (!canMutateConnectionCatalog(auth.isGuest)) {
            layout.showErrorToast(t(resolveExplorerCatalogMessageKey('permissionDenied')))
            return
        }
        const node = explorer.findNode(nodeId)
        const target = explorer.findNode(targetId)
        if (!node || !target) return
        if (node.type === 'connection' && position === 'inside') {
            if (!canMoveConnectionToGroup(explorer.tree, nodeId, targetId)) return
        }
        try {
            await explorer.reorderCatalogNode(nodeId, targetId, position)
            if (node.type === 'connection' && position === 'inside') {
                layout.showSuccessToast(t(resolveExplorerCatalogMessageKey('connectionMoved'), {
                    name: node.label,
                    folder: target.label,
                }))
            }
        } catch (error) {
            layout.showErrorToast(resolveConnectionCatalogErrorMessage(error, t, 'save'))
        }
    }

    async function performMoveConnectionToProject(connectionId: string, targetProjectId: string) {
        if (!canMutateConnectionCatalog(auth.isGuest)) {
            layout.showErrorToast(t(resolveExplorerCatalogMessageKey('permissionDenied')))
            return
        }
        const sourceProjectId = projectStore.activeProjectId
        if (!sourceProjectId || projectStore.apiUnavailable) {
            layout.showErrorToast(t('explorer.context.projectActionUnavailable'))
            return
        }
        const connection = explorer.findNode(connectionId)
        if (!connection || connection.type !== 'connection') return
        const target = projectStore.projects.find((p) => p.id === targetProjectId)
        try {
            await projectStore.moveConnections(sourceProjectId, [connectionId], targetProjectId)
            await explorer.refreshTree()
            layout.showSuccessToast(t('explorer.context.movedToProject', {
                name: connection.label,
                project: target?.name ?? targetProjectId,
            }))
        } catch (error) {
            layout.showErrorToast(
                resolveCaughtApiErrorMessage(error, t, 'explorer.context.moveToProjectFailed'),
            )
        }
    }

    async function performShareConnectionToProject(connectionId: string, targetProjectId: string) {
        if (!canMutateConnectionCatalog(auth.isGuest)) {
            layout.showErrorToast(t(resolveExplorerCatalogMessageKey('permissionDenied')))
            return
        }
        const sourceProjectId = projectStore.activeProjectId
        if (!sourceProjectId || projectStore.apiUnavailable) {
            layout.showErrorToast(t('explorer.context.projectActionUnavailable'))
            return
        }
        const connection = explorer.findNode(connectionId)
        if (!connection || connection.type !== 'connection') return
        const target = projectStore.projects.find((p) => p.id === targetProjectId)
        try {
            await projectStore.shareConnections(sourceProjectId, [connectionId], [targetProjectId])
            layout.showSuccessToast(t('explorer.context.sharedToProject', {
                name: connection.label,
                project: target?.name ?? targetProjectId,
            }))
        } catch (error) {
            layout.showErrorToast(
                resolveCaughtApiErrorMessage(error, t, 'explorer.context.shareToProjectFailed'),
            )
        }
    }

    function buildPinContextMenuItems(node: TreeNode, items: ContextMenuItem[]): ContextMenuItem[] {
        return buildExplorerPinContextMenuItemsForTree(node, items, explorerMenuDeps)
    }

    function onContextMenu(e: MouseEvent, node: TreeNode) {
        void openContextMenu(e, node)
    }

    async function openContextMenu(e: MouseEvent, node: TreeNode) {
        if (isExplorerFavoritesTreeNode(node)) return
        if (node.type === 'project-files-draft' || node.type === 'group-draft') return
        explorer.selectNode(node.id)
        let items = getContextMenuForNodeType(resolveExplorerContextMenuType(node), t)
        // 仅真实项目文件/子目录可重命名；根节点与空目录提示除外
        items = filterRenameProjectFileMenuItems(node, items)
        if (node.type === 'table') {
            const ctx = resolveTableContext(explorer.tree, node)
            if (ctx?.dbType === 'elasticsearch') {
                items = buildElasticsearchIndexMenuItems(t)
            } else if (!isCsvImportSupported(ctx?.dbType, catalogStore.items)) {
                items = withCsvImportMenuDisabled(items, t(CAPABILITY_HINT_I18N.csvImport))
            }
            const community = useCommunityPluginContributionStore()
            community.ensureLoaded()
            items = appendCommunityContextMenuItems(items, community.contextMenusFor('table'))
        }
        if (node.type === 'view') {
            const community = useCommunityPluginContributionStore()
            community.ensureLoaded()
            items = appendCommunityContextMenuItems(items, community.contextMenusFor('view'))
        }
        if (node.type === 'connection') {
            void projectStore.load().catch(() => undefined)
            items = buildConnectionMenuItems(node)
            if (supportsJdbcTunnelSshMenu(node.dbType)) {
                try {
                    const config = await fetchConnectionConfig(node.id)
                    if (isJdbcSshTunnelEnabled(config)) {
                        items = prependJdbcSshTunnelMenuItems(items, t)
                    }
                } catch {
                    // ignore lookup failures
                }
            }
        }
        if (node.type === 'ssh-script-records') {
            items = buildSshScriptRecordsMenuItems()
        }
        if (node.type === 'ssh-script-record') {
            items = buildSshScriptRecordMenuItems()
        }
        if (node.type === 'ssh-terminal') {
            items = buildSshTerminalMenuItems()
        }
        if (node.type === 'group') {
            items = buildGroupMenuItems(node)
        }
        const connectionDbType = resolveConnectionDbType(explorer.tree, node.id)
        if (node.type === 'database' || node.type === 'table') {
            items = filterConnectionCapabilityMenuItems(items, connectionDbType, catalogStore.items)
        }
        if (node.type === 'database') {
            const connectionId = findConnectionId(node)
            items = filterCreateNamespaceMenuItems(items, connectionDbType, {
                canDdl: connectionId ? canDdlConnection(connectionId, teamStore.teams) : false,
            })
        }
        items = filterPluginGatedMenuItems(items, (id) => usePluginStore().isEnabled(id))
        items = buildPinContextMenuItems(node, items)
        items = filterExplorerContextMenuByPermission(items, {nodeType: node.type})
        if (items.length === 0) return
        menuItems.value = items
        open(e, node)
    }

    function openTableFromNode(node: TreeNode, tableView?: 'properties' | 'data' | 'ddl') {
        const args = resolveOpenTableWorkspaceArgs(explorer.tree, node, tableView)
        if (!args) return
        workspace.openTable(
            args.tableName,
            args.connectionId,
            args.catalogNodeId,
            args.database,
            args.nodeId,
            args.tableView,
            args.objectType,
        )
    }

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

    function platformWorkspaceOpenHandlers(): PlatformWorkspaceOpenHandlers {
        return buildPlatformWorkspaceOpenHandlers(workspace)
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
                layout.showSuccessToast(
                    t(resolveSqlClipboardExportMessageKey('success'), {name: result.fileName}),
                )
                return
            }
            const copied = await copySqlToClipboard(result.sql)
            if (copied) {
                layout.showSuccessToast(t(resolveSqlClipboardExportMessageKey('copied')))
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
            layout.showSuccessToast(t(resolveTableDataIoMessageKey('exportSuccess'), {name: fileName}))
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

            layout.showSuccessToast(
                t(resolveTableDataIoMessageKey('importSuccess'), {
                    count: parsed.rows.length,
                    name: ctx.tableName,
                }),
            )
        } catch {
            layout.showErrorToast(t(resolveTableDataIoMessageKey('importFailed')))
        }
    }

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

            layout.showSuccessToast(
                t(
                    pending.type === 'truncate'
                        ? 'explorer.truncateTableSuccess'
                        : 'explorer.deleteTableSuccess',
                    {name: ctx.tableName},
                ),
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
            layout.showSuccessToast(t(resolveExplorerCatalogMessageKey('deleteDatabaseSuccess'), {name: node.label}))
        } catch (error) {
            layout.showErrorToast(resolveCreateNamespaceErrorMessage(error, t))
        } finally {
            pendingDeleteDatabase.value = null
            showDeleteDatabaseDialog.value = false
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
            layout.showSuccessToast(
                communityInvokeMessage(result) || t('communityPlugin.contextMenuInvoked'),
            )
        } catch (error) {
            layout.showErrorToast(
                resolveCaughtApiErrorMessage(error, t, 'communityPlugin.contextMenuFailed'),
            )
        }
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
                    const ok = window.confirm(
                        t('explorer.elasticsearchConsole.confirmClear', {index: tableCtx.tableName}),
                    )
                    if (ok) {
                        void explorerApi.clearElasticsearchIndex(tableCtx.connectionId, tableCtx.tableName)
                            .then(() => layout.showSuccessToast(
                                t('explorer.elasticsearchDocuments.cleared', {index: tableCtx.tableName}),
                            ))
                            .catch((caught) => layout.showErrorToast(
                                resolveCaughtApiErrorMessage(caught, t, 'explorer.elasticsearchConsole.runFailed'),
                            ))
                    }
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
                if (toast.tone === 'success') {
                    layout.showSuccessToast(t(toast.key, {name: node.label}))
                } else {
                    layout.showErrorToast(t(toast.key))
                }
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
            const pinned = explorer.togglePinnedNode(node.id)
            layout.showSuccessToast(t(resolvePinToastMessageKey(node.type, pinned), {name: node.label}))
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
                    layout.showSuccessToast(t(resolveExplorerFeatureMessageKey('refreshDone')))
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
                    layout.showSuccessToast(t(resolveExplorerFeatureMessageKey('refreshDone')))
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

    async function confirmDeleteCatalogNode() {
        const node = pendingDeleteCatalogNode.value
        showDeleteCatalogDialog.value = false
        pendingDeleteCatalogNode.value = null
        if (!node || (node.type !== 'connection' && node.type !== 'group')) return
        const label = node.label
        const nodeType = node.type
        try {
            await explorer.deleteNode(node.id)
            layout.showSuccessToast(t(resolveCatalogDeletedMessageKey(nodeType), {name: label}))
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
            layout.showSuccessToast(
                t(resolveExplorerSqlFileMessageKey('deleted'), {name: node.label}),
            )
        } catch {
            layout.showErrorToast(t(resolveExplorerSqlFileMessageKey('deleteFailed')))
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
            layout.showSuccessToast(t(resolveViewModelMessageKey('renamed'), {name: result.name}))
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
            layout.showSuccessToast(t(resolveViewModelMessageKey('deleted'), {name: node.label}))
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

    function isExplorerDialogOpen(): boolean {
        return isExplorerUiBlocking({
            menuVisible: menuVisible.value,
            treeInline: Boolean(treeInline.value),
            showDeleteSqlDialog: showDeleteSqlDialog.value,
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

        const plan = resolveExplorerDeleteShortcutUiPlan(node.type)
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
        explorer,
        flatNodes,
        menuVisible,
        menuPos,
        menuItems,
        showDeleteSqlDialog,
        deleteSqlMessage,
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
