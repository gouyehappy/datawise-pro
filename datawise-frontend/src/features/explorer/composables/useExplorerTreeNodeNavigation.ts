import type {ComposerTranslation} from 'vue-i18n'
import type {TreeNode} from '@/core/types'
import {canExpandTreeNode, findAncestorByType} from '@/core/utils/tree'
import {
    buildExplorerNodeInfo,
    buildViewModelExplorerInfo,
    isExplorerInfoNode,
    prepareExplorerInfoNode,
} from '@/features/explorer/services/explorer-node-info.service'
import {openLatestSqlEditor} from '@/features/explorer/services/sql-editor-actions.service'
import {resolveExplorerNodeOpenKind} from '@/features/explorer/services/explorer-node-open.service'
import {openSqlFileFromTree} from '@/features/explorer/services/instance-console.service'
import {resolvePlatformFeatureId} from '@/features/explorer/services/explorer-ai-tree.service'
import type {PlatformFeatureId} from '@/features/platform/types/platform.types'
import {resolveExplorerSqlFileScope} from '@/features/explorer/services/explorer-database-scope'
import {parseRedisKeyFromNodeId} from '@/features/explorer/services/redis-key.service'
import {parseKafkaTopicFromNodeId} from '@/features/explorer/services/kafka-topic.service'
import {
    parseSshScriptRecordId,
    parseSshTerminalConnectionId,
} from '@/features/explorer/services/ssh-feature-tree.service'
import {
    resolveExplorerFavoritesNavIntent,
    resolveExplorerNodeSelectIntent,
} from '@/features/explorer/services/explorer-node-select.service'
import {
    openPinnedTableFavorite,
    shouldOpenFavoriteTable,
} from '@/features/explorer/services/explorer-favorites.actions'
import {resolveOpenTableWorkspaceArgs, resolveTableContext} from '@/features/explorer/services/table-context-actions.service'
import {resolveViewModelMessageKey} from '@/features/explorer/services/view-model-messages'
import {resolveExplorerFeatureMessageKey} from '@/features/explorer/services/explorer-feature-messages'
import {resolveSshScriptRecordMessageKey} from '@/features/ssh/services/ssh-script-record-messages'
import {listSshScriptRecords} from '@/features/ssh/services/ssh-script-records.service'
import {resolveViewModelScope, viewModelApi} from '@/api/modules/view-model'
import {EXPLORER_INFO_SYNC_DELAY_MS} from '@/features/explorer/constants/explorer-info-sync'
import {canManageExplorerConnectionLifecycle} from '@/features/auth/services/feature-permission.service'
import {
    dispatchPlatformWorkspaceOpen,
    resolvePlatformFeatureNodeOpen,
    type PlatformWorkspaceOpenHandlers,
} from '@/features/explorer/services/explorer-platform-menu-actions.service'
import {
    planOpenElasticsearchConsole,
    planOpenKafkaTopics,
    planOpenMongoConsole,
    planOpenRedisConsole,
    planOpenRedisKey,
} from '@/features/workspace'
import type {useExplorerStore} from '@/features/explorer/stores/explorer'
import type {useLayoutStore} from '@/features/layout/stores/layout'
import type {useWorkspaceStore} from '@/features/workspace/stores/workspace'
import type {useAuthStore} from '@/features/auth/stores/auth-store'
import type {useShortcutPanelStore} from '@/features/layout/stores/shortcut-panel-store'

export interface ExplorerTreeNodeNavigationDeps {
    t: ComposerTranslation
    explorer: ReturnType<typeof useExplorerStore>
    workspace: ReturnType<typeof useWorkspaceStore>
    layout: ReturnType<typeof useLayoutStore>
    auth: ReturnType<typeof useAuthStore>
    shortcutPanel: ReturnType<typeof useShortcutPanelStore>
    findConnectionId: (node: TreeNode) => string | undefined
    findConnectionLabel: (connectionId?: string) => string | undefined
    platformWorkspaceOpenHandlers: () => PlatformWorkspaceOpenHandlers
}

export function useExplorerTreeNodeNavigation(deps: ExplorerTreeNodeNavigationDeps) {
    const {
        t,
        explorer,
        workspace,
        layout,
        auth,
        shortcutPanel,
        findConnectionId,
        findConnectionLabel,
        platformWorkspaceOpenHandlers,
    } = deps

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
    
    return {
        onSelect,
        onOpen,
        openTableFromNode,
        openViewModelConsoleFromNode,
        openViewModelDataFromNode,
        openSqlFile,
        openProjectFile,
        openSshScriptRecordFromNode,
        cancelScheduledExplorerInfoSync,
        scheduleExplorerInfoSync,
        scheduleViewModelExplorerInfoSync,
    }
}
