import {defineStore} from 'pinia'
import {computed, ref, shallowRef} from 'vue'
import type {TreeNode} from '@/core/types'
import {
    findNodeById,
    findParentNode,
    resolveConnectionId,
    walkTree,
    buildTreeNodeIndex,
    findAncestorByType,
    mergeTreeNodeIndex,
    pruneTreeNodeIndexSubtree,
} from '@/core/utils/tree'
import {markExpandedPath} from '@/features/explorer/services/explorer-tree-expansion'
import {platformApi} from '@/api'
import {bindExplorerFindNode} from '@/features/settings/services/perf-diagnostics.service'
import {createExplorerConnectionDomain} from '@/features/explorer/stores/explorer-connection.domain'
import {createExplorerCatalogDomain} from '@/features/explorer/stores/explorer-catalog.domain'
import {createExplorerLocateDomain} from '@/features/explorer/stores/explorer-locate.domain'
import {
    createExplorerLazyLoadDomain,
    type RebuildNodeIndexOptions,
} from '@/features/explorer/stores/explorer-lazy-load.domain'
import {
    readPinnedExplorerNodeIds,
    togglePinnedExplorerNodeId,
    writePinnedExplorerNodeIds,
} from '@/features/explorer/services/pinned-explorer-nodes.service'
import {applyPinnedSortToNodeChildren, applyPinnedSortInTree} from '@/features/explorer/services/explorer-pinned-sort.service'
import {
    isPinnedTableFavorite,
    readPinnedTableFavorites,
    removePinnedTableFavorite,
    upsertPinnedTableFavorite,
} from '@/features/explorer/services/pinned-table-favorites.service'
import {resolveTableContext} from '@/features/explorer/services/table-context-actions.service'
import {
    readFavoritesGroupExpanded,
    writeFavoritesGroupExpanded,
} from '@/features/explorer/services/explorer-favorites-ui.service'
import {useDebouncedRef} from '@/core/utils/debounced-ref'
import {resolveExplorerInstanceLabel} from '@/features/explorer/services/explorer-database-scope'
import {
    buildSemanticExplorerIndex,
    semanticScopeKey,
    type SemanticExplorerIndex,
} from '@/features/explorer/services/semantic-layer-explorer.service'

/** Explorer 全局状态（Pinia Store） */
export const useExplorerStore = defineStore('explorer', () => {
    const tree = shallowRef<TreeNode[]>([])
    /** 树结构或 expanded 等 UI 状态变更时递增，供 derived computed 订阅 */
    const treeVersion = ref(0)
    const treeReady = ref(false)
    const searchQuery = ref('')
    const debouncedSearchQuery = useDebouncedRef(searchQuery, 200)
    /** Explorer 面板：数据库连接树 | 本地文件 */
    const panelMode = ref<'database' | 'files'>(
        (localStorage.getItem('dw-cli-explorer-panel-mode') as 'database' | 'files' | null) === 'files'
            ? 'files'
            : 'database',
    )

    /** 仅由 Explorer 标题下拉菜单手动切换；其它功能不得调用 setPanelMode。 */
    function setPanelMode(mode: 'database' | 'files') {
        panelMode.value = mode
        localStorage.setItem('dw-cli-explorer-panel-mode', mode)
    }
    const selectedNodeId = ref<string | null>(null)
    const width = ref(248)
    const showColumnComment = ref(true)
    const showTableComment = ref(true)
    const showSemanticLayer = ref(true)
    const semanticIndexByScope = ref<Map<string, SemanticExplorerIndex>>(new Map())
    const semanticLoadPromises = new Map<string, Promise<void>>()
    const isRefreshing = ref(false)
    const nodeIndex = ref<Map<string, TreeNode>>(new Map())
    const pinnedNodeIds = ref<Set<string>>(new Set(readPinnedExplorerNodeIds()))
    const favoritesGroupExpanded = ref(readFavoritesGroupExpanded())
    const favoritesShowAll = ref(false)

    const allCommentsVisible = computed(
        () => showColumnComment.value && showTableComment.value,
    )

    const selectedNode = computed((): TreeNode | null => {
        if (!selectedNodeId.value) return null
        return findNode(selectedNodeId.value)
    })

    const connectionCount = computed(() => {
        void treeVersion.value
        let count = 0
        walkTree(tree.value, (node) => {
            if (node.type === 'connection') count++
        })
        return count
    })

    function touchTree() {
        treeVersion.value += 1
    }

    function rebuildNodeIndex(options?: RebuildNodeIndexOptions) {
        if (options?.mode === 'full' || !options?.parent) {
            nodeIndex.value = buildTreeNodeIndex(tree.value)
            touchTree()
            return
        }
        const parent = options.parent
        const next = new Map(nodeIndex.value)
        next.set(parent.id, parent)
        if (options.previousChildren?.length) {
            pruneTreeNodeIndexSubtree(next, options.previousChildren)
        }
        const nodesToMerge = options.loadedNodes ?? parent.children ?? []
        if (nodesToMerge.length) {
            mergeTreeNodeIndex(next, nodesToMerge)
        }
        nodeIndex.value = next
        touchTree()
    }

    function findNode(nodeId: string): TreeNode | null {
        return nodeIndex.value.get(nodeId) ?? findNodeById(tree.value, nodeId)
    }

    function selectNode(nodeId: string) {
        selectedNodeId.value = nodeId
    }

    /** @deprecated 仅用于 group 等无懒加载节点；连接/schema 请用 expandPathToNode */
    function expandToNode(nodeId: string) {
        markExpandedPath(tree.value, nodeId)
        touchTree()
    }

    // --- Late-bound slots for domain cycles (same pattern as connection Phase A) ---
    let expandAndLoadFn: (
        nodeId: string,
        options?: {load?: boolean; notify?: boolean},
    ) => Promise<void> = async () => undefined
    let resetConnectionTreeStateFn: (connectionId: string) => void = () => undefined
    let restoreExpandedNodesFn: (ids: string[]) => void = () => undefined
    let expandPathToNodeFn: (nodeId: string, options?: {notify?: boolean}) => Promise<void> = async () => undefined
    let toggleExpandFn: (nodeId: string, options?: {notify?: boolean}) => Promise<void> = async () => undefined
    let ensureChildrenLoadedFn: (nodeId: string, options?: {notify?: boolean}) => Promise<void> = async () => undefined
    let reloadWorkspacesFolderFn: (
        connectionId: string,
        instanceLabel: string,
        instanceId?: string | null,
    ) => Promise<void> = async () => undefined
    let findDatabaseNodeFn: (
        connectionId: string,
        instanceLabel: string,
        instanceId?: string | null,
    ) => TreeNode | null = () => null
    let clearFlashFn: () => void = () => undefined
    let revealNodeFn: (nodeId: string, options?: {select?: boolean}) => Promise<TreeNode | null> = async () => null
    let markConnectionPooledFn: (connectionId: string) => void = () => undefined
    let markConnectionAttemptedFn: (connectionId: string) => void = () => undefined
    let setConnectionHealthFn: (connectionId: string, health: 'ok' | 'error' | null) => void = () => undefined
    let reportConnectionFailureFn: (
        connectionId: string,
        error: unknown,
        options?: {notify?: boolean; retry?: () => Promise<boolean>},
    ) => Promise<void> = async () => undefined
    let isConnectionPooledFn: (connectionId: string) => boolean = () => false
    let connectConnectionFn: (
        connectionId: string,
        options?: {notify?: boolean},
    ) => Promise<boolean> = async () => false
    let toggleFavoritesGroupExpandedFn: () => void = () => undefined
    let invalidateSemanticMetricsFn: (connectionId?: string) => void = () => undefined

    const lazyDomain = createExplorerLazyLoadDomain({
        tree,
        findNode,
        touchTree,
        rebuildNodeIndex,
        markConnectionPooled: (id) => markConnectionPooledFn(id),
        markConnectionAttempted: (id) => markConnectionAttemptedFn(id),
        setConnectionHealth: (id, health) => setConnectionHealthFn(id, health),
        reportConnectionFailure: (...args) => reportConnectionFailureFn(...args),
        isConnectionPooled: (id) => isConnectionPooledFn(id),
        connectConnection: (...args) => connectConnectionFn(...args),
        toggleFavoritesGroupExpanded: () => toggleFavoritesGroupExpandedFn(),
        invalidateSemanticMetrics: (id) => invalidateSemanticMetricsFn(id),
    })

    const {
        loadingNodeIds,
        ensureChildrenLoaded,
        expandAndLoad,
        restoreExpandedNodes,
        expandPathToNode,
        collapseNode,
        toggleExpand,
        findDatabaseNode,
        reloadConnectionCatalog,
        reloadTablesFolder,
        reloadWorkspacesFolder,
        reloadModelsFolder,
        reloadViewsFolder,
        resetConnectionTreeState,
        reloadRedisKeys,
    } = lazyDomain

    expandAndLoadFn = expandAndLoad
    resetConnectionTreeStateFn = resetConnectionTreeState
    restoreExpandedNodesFn = restoreExpandedNodes
    expandPathToNodeFn = expandPathToNode
    toggleExpandFn = toggleExpand
    ensureChildrenLoadedFn = ensureChildrenLoaded
    reloadWorkspacesFolderFn = reloadWorkspacesFolder
    findDatabaseNodeFn = findDatabaseNode

    const connectionDomain = createExplorerConnectionDomain({
        findNode,
        loadingNodeIds,
        expandAndLoad: (...args) => expandAndLoadFn(...args),
        resetConnectionTreeState: (connectionId) => resetConnectionTreeStateFn(connectionId),
    })

    const {
        connectionHealthById,
        connectionDisplayHealthById,
        pooledConnectionIds,
        isConnectionPooled,
        markConnectionPooled,
        needsReconnectConnectionIds,
        connectionNeedsReconnect,
        markConnectionNeedsReconnect,
        clearConnectionNeedsReconnect,
        attemptedConnectionIds,
        hasAttemptedConnections,
        markConnectionAttempted,
        pruneAttemptedConnections,
        setConnectionHealth,
        connectionHealthChecking,
        connectionHealthCheckedAt,
        reportConnectionFailure,
        probeAllConnectionHealth,
        syncPooledConnectionState,
        disconnectConnection,
        connectConnection,
        reconnectConnection,
    } = connectionDomain

    markConnectionPooledFn = markConnectionPooled
    markConnectionAttemptedFn = markConnectionAttempted
    setConnectionHealthFn = setConnectionHealth
    reportConnectionFailureFn = reportConnectionFailure
    isConnectionPooledFn = isConnectionPooled
    connectConnectionFn = connectConnection

    const locateDomain = createExplorerLocateDomain({
        tree,
        searchQuery,
        selectedNodeId,
        findNode,
        selectNode,
        touchTree,
        findDatabaseNode: (...args) => findDatabaseNodeFn(...args),
        ensureChildrenLoaded: (...args) => ensureChildrenLoadedFn(...args),
        expandPathToNode: (...args) => expandPathToNodeFn(...args),
        reloadWorkspacesFolder: (...args) => reloadWorkspacesFolderFn(...args),
    })

    const {
        flashNodeId,
        revealNode,
        locateActiveTabNode,
        locateSelectedNode,
        locateNode,
        clearFlash,
    } = locateDomain

    clearFlashFn = clearFlash
    revealNodeFn = revealNode

    const catalogDomain = createExplorerCatalogDomain({
        tree,
        treeReady,
        isRefreshing,
        selectedNodeId,
        connectionHealthById,
        pruneAttemptedConnections,
        rebuildNodeIndex,
        findNode,
        selectNode,
        expandToNode,
        restoreExpandedNodes: (ids) => restoreExpandedNodesFn(ids),
        clearFlash: () => clearFlashFn(),
        revealNode: (...args) => revealNodeFn(...args),
        expandPathToNode: (...args) => expandPathToNodeFn(...args),
        toggleExpand: (...args) => toggleExpandFn(...args),
    })

    const {
        loadTree,
        refreshTree,
        addRootFolder,
        addGroup,
        renameGroup,
        addConnection,
        updateConnection,
        moveConnection,
        reorderCatalogNode,
        deleteNode,
        importConnections,
    } = catalogDomain

    function setAllCommentsVisible(visible: boolean) {
        showColumnComment.value = visible
        showTableComment.value = visible
    }

    function toggleAllComments() {
        setAllCommentsVisible(!allCommentsVisible.value)
    }

    function getSemanticIndex(connectionId: string, database: string): SemanticExplorerIndex | null {
        return semanticIndexByScope.value.get(semanticScopeKey(connectionId, database)) ?? null
    }

    async function ensureSemanticMetrics(connectionId: string, database: string): Promise<void> {
        if (!showSemanticLayer.value || !connectionId || !database) return
        const scopeKey = semanticScopeKey(connectionId, database)
        if (semanticIndexByScope.value.has(scopeKey)) return

        const inFlight = semanticLoadPromises.get(scopeKey)
        if (inFlight) {
            await inFlight
            return
        }

        const task = (async () => {
            try {
                const metrics = await platformApi.listSemanticMetrics(connectionId, database)
                semanticIndexByScope.value = new Map(semanticIndexByScope.value).set(
                    scopeKey,
                    buildSemanticExplorerIndex(metrics),
                )
            } catch {
                semanticIndexByScope.value = new Map(semanticIndexByScope.value).set(
                    scopeKey,
                    buildSemanticExplorerIndex([]),
                )
            }
        })()

        semanticLoadPromises.set(scopeKey, task)
        try {
            await task
        } finally {
            semanticLoadPromises.delete(scopeKey)
        }
    }

    function resolveSemanticScope(nodeId: string): {connectionId: string; database: string} | null {
        const connectionId = resolveConnectionId(tree.value, nodeId)
        if (!connectionId) return null
        const connection = findNode(connectionId)
        const schemaNode = findAncestorByType(tree.value, nodeId, 'schema')
        const databaseNode = findAncestorByType(tree.value, nodeId, 'database')
        const scopeNode = schemaNode ?? databaseNode
        if (!scopeNode) return null
        const database =
            resolveExplorerInstanceLabel(tree.value, scopeNode.id, connection?.dbType) ?? scopeNode.label
        return {connectionId, database}
    }

    async function prefetchSemanticMetricsForNode(nodeId: string): Promise<void> {
        if (!showSemanticLayer.value) return
        const scope = resolveSemanticScope(nodeId)
        if (!scope) return
        await ensureSemanticMetrics(scope.connectionId, scope.database)
    }

    function invalidateSemanticMetrics(connectionId?: string) {
        if (!connectionId) {
            semanticIndexByScope.value = new Map()
            return
        }
        const next = new Map(semanticIndexByScope.value)
        for (const key of next.keys()) {
            if (key.startsWith(`${connectionId}:`)) {
                next.delete(key)
            }
        }
        semanticIndexByScope.value = next
    }
    invalidateSemanticMetricsFn = invalidateSemanticMetrics

    function refreshPinnedNodeIds() {
        pinnedNodeIds.value = new Set(readPinnedExplorerNodeIds())
    }

    /** Hydrate pins from durable app-config (survives Chromium origin / restart). */
    function replacePinnedNodeIds(ids: readonly string[]) {
        const next = [...new Set(ids.filter((id) => typeof id === 'string' && id.trim()))]
        writePinnedExplorerNodeIds(next)
        pinnedNodeIds.value = new Set(next)
    }

    function reapplyPinnedSort() {
        applyPinnedSortInTree(tree.value)
        touchTree()
    }

    function isNodePinned(nodeId: string): boolean {
        return pinnedNodeIds.value.has(nodeId)
    }

    /** @returns 切换后是否已置顶 */
    function togglePinnedNode(nodeId: string): boolean {
        const node = findNode(nodeId)
        const wasTableFavorite = isPinnedTableFavorite(nodeId)
        const pinned = togglePinnedExplorerNodeId(nodeId)
        if (pinned && node?.type === 'table') {
            const ctx = resolveTableContext(tree.value, node)
            if (ctx) {
                const connection = findNode(ctx.connectionId)
                upsertPinnedTableFavorite({
                    nodeId: ctx.nodeId,
                    connectionId: ctx.connectionId,
                    database: ctx.database,
                    tableName: ctx.tableName,
                    connectionLabel: connection?.label,
                    dbType: ctx.dbType,
                })
            }
        } else if (!pinned && (node?.type === 'table' || wasTableFavorite)) {
            removePinnedTableFavorite(nodeId)
            if (!readPinnedTableFavorites().length) {
                favoritesShowAll.value = false
            }
        }
        refreshPinnedNodeIds()
        const parent = findParentNode(tree.value, nodeId)
        if (parent) {
            applyPinnedSortToNodeChildren(parent)
            touchTree()
        }
        return pinned
    }

    function toggleFavoritesGroupExpanded() {
        favoritesGroupExpanded.value = !favoritesGroupExpanded.value
        writeFavoritesGroupExpanded(favoritesGroupExpanded.value)
    }
    toggleFavoritesGroupExpandedFn = toggleFavoritesGroupExpanded

    function showAllFavoriteTables() {
        favoritesShowAll.value = true
        favoritesGroupExpanded.value = true
        writeFavoritesGroupExpanded(true)
    }

    const visibleTree = computed(() => {
        void treeVersion.value
        return tree.value
    })

    bindExplorerFindNode(findNode)

    return {
        tree,
        treeVersion,
        treeReady,
        searchQuery,
        panelMode,
        setPanelMode,
        debouncedSearchQuery,
        selectedNodeId,
        selectedNode,
        width,
        showColumnComment,
        showTableComment,
        showSemanticLayer,
        getSemanticIndex,
        ensureSemanticMetrics,
        prefetchSemanticMetricsForNode,
        invalidateSemanticMetrics,
        isRefreshing,
        flashNodeId,
        loadingNodeIds,
        pinnedNodeIds,
        favoritesGroupExpanded,
        favoritesShowAll,
        connectionHealthById,
        connectionDisplayHealthById,
        pooledConnectionIds,
        isConnectionPooled,
        markConnectionPooled,
        needsReconnectConnectionIds,
        connectionNeedsReconnect,
        markConnectionNeedsReconnect,
        clearConnectionNeedsReconnect,
        attemptedConnectionIds,
        hasAttemptedConnections,
        markConnectionAttempted,
        setConnectionHealth,
        connectionHealthChecking,
        connectionHealthCheckedAt,
        allCommentsVisible,
        setAllCommentsVisible,
        toggleAllComments,
        connectionCount,
        visibleTree,
        findNode,
        isNodePinned,
        togglePinnedNode,
        refreshPinnedNodeIds,
        replacePinnedNodeIds,
        reapplyPinnedSort,
        toggleFavoritesGroupExpanded,
        showAllFavoriteTables,
        ensureChildrenLoaded,
        expandAndLoad,
        expandPathToNode,
        restoreExpandedNodes,
        collapseNode,
        toggleExpand,
        selectNode,
        expandToNode,
        locateNode,
        locateActiveTabNode,
        locateSelectedNode,
        clearFlash,
        loadTree,
        refreshTree,
        addRootFolder,
        addGroup,
        renameGroup,
        addConnection,
        updateConnection,
        moveConnection,
        reorderCatalogNode,
        deleteNode,
        reloadWorkspacesFolder,
        reloadModelsFolder,
        reloadViewsFolder,
        reloadTablesFolder,
        reloadConnectionCatalog,
        importConnections,
        reloadRedisKeys,
        probeAllConnectionHealth,
        syncPooledConnectionState,
        disconnectConnection,
        connectConnection,
        reconnectConnection,
        touchTree,
    }
})
