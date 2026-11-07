import {defineStore} from 'pinia'
import {computed, ref, shallowRef} from 'vue'
import type {ConnectionConfig, TreeNode, WorkspaceTab} from '@/core/types'
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
import {logPerf, perfNow} from '@/core/utils/perf-log'
import {markStartupPhase} from '@/app/services/startup-timing.service'
import {scrollExplorerNodeIntoView} from '@/core/shortcuts/action-registry'
import {resolveConsoleInstanceLabel, buildExplorerScopedLabelResolver} from '@/features/workspace/services/resolve-console-instance'
import {
    findExplorerScopeNode,
    findExplorerTablesFolder,
} from '@/features/explorer/services/explorer-database-scope'
import {
    markExpandedPath,
    shouldCollapseOnToggle,
} from '@/features/explorer/services/explorer-tree-expansion'
import {catalogNeedsSchemaReload} from '@/shared/db-type-families'
import {
    appendTablePageChildren,
    buildExplorerLoadChildKey,
    clearExplorerFolderLoadedIds,
    markExplorerFolderLoadedIfNeeded,
    mergeLoadedChildren,
    needsLazyLoad,
    parseLoadMoreOffset,
    resolveConnectionDbType,
    resolveTablesFolderIdFromLoadMore,
    isCatalogSchemaDbType,
    isExplorerNodeNotFoundError,
    pruneConnectionHealthByIds,
    shouldAffirmConnectionHealthForCachedChildren,
} from '@/features/explorer/services/explorer-lazy-load'
import {
    injectProjectFileRoots,
    listProjectFileAncestorFolderIds,
    loadProjectFilesChildren,
} from '@/features/project/services/project-explorer-files'
import {ensureFlatConnectionFeatureChildren} from '@/features/explorer/services/flat-connection-feature-tree.service'
import {ensureExplorerUiCatalogLoaded} from '@/features/explorer/services/explorer-ui-catalog.service'
import {refreshSshScriptRecordChildren} from '@/features/explorer/services/ssh-feature-tree.service'
import {
    resolveActiveTabLocateNodeId as resolveLocateNodeId,
    resolveLocateFolderForNode,
    resolveProjectSandboxTabLocateUri,
    countTreeNodesWithId,
} from '@/features/explorer/services/explorer-locate.service'
import {resolveSqlFileForLocate} from '@/features/workspace/services/console-tab-title'
import {explorerApi, platformApi} from '@/api'
import {bindExplorerFindNode} from '@/features/settings/services/perf-diagnostics.service'
import {applyExplorerTreeStructure} from '@/shared/config/connections-explorer-tree'
import {
    applyExpandedNodeIds,
    applyFirstLevelExpandedNodeIds,
    collectExpandedNodeIds,
    collectFirstLevelExpandedNodeIds,
} from '@/features/explorer/utils/tree-session'
import {isJdbcDriverError, resolveConnectionErrorMessage} from '@/features/explorer/services/connection-error-message'
import {installMissingConnectorIfNeeded} from '@/features/connection/services/missing-connector-install.service'
import {jdbcArtifactName, useDriverInstallStore} from '@/features/connection/stores/driver-install'
import {useDatasourceCatalogStore} from '@/features/datasource/stores/datasource-catalog'
import {
    buildConnectionDisplayHealthMap,
    mergePooledConnectionSync,
    usesConnectionReconnectOverlay,
    usesPeriodicConnectionHealthProbe,
} from '@/features/explorer/services/explorer-connection-state.service'
import {i18n} from '@/i18n'
import {
    readPinnedExplorerNodeIds,
    togglePinnedExplorerNodeId,
    writePinnedExplorerNodeIds,
} from '@/features/explorer/services/pinned-explorer-nodes.service'
import {applyPinnedSortToNodeChildren, applyPinnedSortInTree} from '@/features/explorer/services/explorer-pinned-sort.service'
import {
    backfillPinnedTableMetadata,
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
import {isExplorerFavoritesGroupId} from '@/features/explorer/services/explorer-favorites.constants'
import {notifyAiTableTagsChanged} from '@/features/ai/tag/services/ai-table-tag.events'
import {useLayoutStore} from '@/features/layout/stores/layout'
import {
    disposeSshTerminalsForConnection,
    reconnectSshTerminalsForConnection,
} from '@/features/terminal/services/ssh-terminal-session.service'
import {useDebouncedRef} from '@/core/utils/debounced-ref'
import {
    EXPLORER_EXPAND_PATH_CONCURRENCY,
    EXPLORER_HEALTH_PROBE_CONCURRENCY,
    runWithConcurrencyLimit,
} from '@/core/utils/concurrency-limit'
import {resolveExplorerInstanceLabel} from '@/features/explorer/services/explorer-database-scope'
import {
    isAiFolder,
    ensureAiFolderInScopeChildren,
    migrateExplorerTreeAiStructure,
} from '@/features/explorer/services/explorer-ai-tree.service'
import {
    buildSemanticExplorerIndex,
    semanticScopeKey,
    type SemanticExplorerIndex,
} from '@/features/explorer/services/semantic-layer-explorer.service'

function resolveExplorerLoadPerfOperation(
    connectionId: string,
    nodeId: string,
    node: TreeNode | null | undefined,
): string {
    if (connectionId === nodeId) return 'connection.expand'
    if (node?.type === 'folder') {
        if (node.label === 'tables') return 'explorer.loadTables'
        if (node.label === 'workspaces') return 'explorer.loadWorkspaces'
        if (node.label === 'models') return 'explorer.loadModels'
        if (node.label === 'views') return 'explorer.loadViews'
        if (node.label === 'ai') return 'explorer.loadAi'
    }
    return 'explorer.loadChildren'
}

/** Explorer 全局状态（Pinia Store） */
type RebuildNodeIndexOptions = {
    mode?: 'full'
    parent?: TreeNode
    /** merge/replace 前的 children 快照，用于从索引剔除旧子树 */
    previousChildren?: TreeNode[]
    /** 分页追加时仅索引本批 loaded 节点 */
    loadedNodes?: TreeNode[]
}

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
    const flashNodeId = ref<string | null>(null)
    const loadingNodeIds = ref<Set<string>>(new Set())
    const connectionHealthById = ref<Record<string, 'ok' | 'error'>>({})
    /** 后端仍保持温热 JDBC 池的连接（绿标 / 已连接状态以此为准，与 ping 可达性分离） */
    const pooledConnectionIds = ref<Set<string>>(new Set())
    /** 连接已从服务端释放，打开的工作区 Tab 需遮罩提示重新连接 */
    const needsReconnectConnectionIds = ref<Set<string>>(new Set())
    /** 用户已点击/展开过的连接，仅这些连接参与健康检查 */
    const attemptedConnectionIds = ref<Set<string>>(new Set())
    const connectionHealthChecking = ref(false)
    const connectionHealthCheckedAt = ref<number | null>(null)
    const loadChildPromises = new Map<string, Promise<boolean>>()
    const childEtags = new Map<string, string>()
    const nodeIndex = ref<Map<string, TreeNode>>(new Map())
    const pinnedNodeIds = ref<Set<string>>(new Set(readPinnedExplorerNodeIds()))
    const favoritesGroupExpanded = ref(readFavoritesGroupExpanded())
    const favoritesShowAll = ref(false)

    let flashTimer: ReturnType<typeof setTimeout> | null = null

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

    const connectionDisplayHealthById = computed(() =>
        buildConnectionDisplayHealthMap(pooledConnectionIds.value, connectionHealthById.value),
    )

    function isConnectionPooled(connectionId: string) {
        return pooledConnectionIds.value.has(connectionId)
    }

    function connectionNeedsReconnect(connectionId: string | undefined | null): boolean {
        if (!connectionId) return false
        if (!needsReconnectConnectionIds.value.has(connectionId)) return false
        const dbType = findNode(connectionId)?.dbType
        return usesConnectionReconnectOverlay(dbType)
    }

    function markConnectionNeedsReconnect(connectionId: string) {
        if (!connectionId) return
        const dbType = findNode(connectionId)?.dbType
        if (!usesConnectionReconnectOverlay(dbType)) return
        if (!needsReconnectConnectionIds.value.has(connectionId)) {
            needsReconnectConnectionIds.value = new Set([
                ...needsReconnectConnectionIds.value,
                connectionId,
            ])
        }
        void disposeSshTerminalsForConnection(connectionId)
    }

    function clearConnectionNeedsReconnect(connectionId: string) {
        if (!needsReconnectConnectionIds.value.has(connectionId)) return
        const next = new Set(needsReconnectConnectionIds.value)
        next.delete(connectionId)
        needsReconnectConnectionIds.value = next
    }

    function markConnectionPooled(connectionId: string) {
        if (pooledConnectionIds.value.has(connectionId)) return
        pooledConnectionIds.value = new Set([...pooledConnectionIds.value, connectionId])
    }

    function unmarkConnectionPooled(connectionId: string) {
        if (!pooledConnectionIds.value.has(connectionId)) return
        const next = new Set(pooledConnectionIds.value)
        next.delete(connectionId)
        pooledConnectionIds.value = next
    }

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

    function setConnectionHealth(connectionId: string, health: 'ok' | 'error' | null) {
        if (!health) {
            if (!(connectionId in connectionHealthById.value)) return
            const next = {...connectionHealthById.value}
            delete next[connectionId]
            connectionHealthById.value = next
            return
        }
        connectionHealthById.value = {...connectionHealthById.value, [connectionId]: health}
    }

    function markConnectionAttempted(connectionId: string) {
        if (attemptedConnectionIds.value.has(connectionId)) return
        attemptedConnectionIds.value = new Set([...attemptedConnectionIds.value, connectionId])
    }

    function hasAttemptedConnections() {
        return attemptedConnectionIds.value.size > 0
    }

    function pruneAttemptedConnections(validIds: readonly string[]) {
        const valid = new Set(validIds)
        attemptedConnectionIds.value = new Set(
            [...attemptedConnectionIds.value].filter((id) => valid.has(id)),
        )
    }

    async function reportConnectionFailure(connectionId: string, error: unknown, options?: {
        notify?: boolean
        retry?: () => Promise<boolean>
    }) {
        if (options?.notify !== true) return
        const node = findNode(connectionId)
        const installed = await installMissingConnectorIfNeeded(error, {
            fallbackDbType: node?.dbType ?? '',
        })
        if (installed && options.retry) {
            const ok = await options.retry()
            if (ok) return
        }
        if (!installed && isJdbcDriverError(error) && node?.dbType) {
            const catalog = useDatasourceCatalogStore()
            const item = catalog.items.find((entry) => entry.id === node.dbType)
            const maven = item?.defaultDriverMaven?.trim() ?? ''
            const driverClass = item?.defaultDriverClass?.trim() ?? ''
            if (maven && driverClass && item?.jdbcDriverRequired) {
                const outcome = await useDriverInstallStore().ensure(
                    maven,
                    driverClass,
                    item.label || jdbcArtifactName(maven),
                )
                if ((outcome === 'installed' || outcome === 'cached') && options.retry) {
                    const ok = await options.retry()
                    if (ok) return
                }
                if (outcome === 'failed' || outcome === 'cancelled') return
            }
        }
        if (!installed) {
            useLayoutStore().showErrorToast(resolveConnectionErrorMessage(error))
        }
    }

    function collectConnectionIdsFromTree(): string[] {
        const ids: string[] = []
        walkTree(tree.value, (node) => {
            if (node.type === 'connection') ids.push(node.id)
        })
        return ids
    }

    async function probeAllConnectionHealth() {
        if (connectionHealthChecking.value) return
        const ids = [...pooledConnectionIds.value].filter((connectionId) => {
            const dbType = findNode(connectionId)?.dbType
            return usesPeriodicConnectionHealthProbe(dbType)
        })
        connectionHealthChecking.value = true
        try {
            if (!ids.length) {
                return
            }
            await runWithConcurrencyLimit(ids, EXPLORER_HEALTH_PROBE_CONCURRENCY, async (connectionId) => {
                try {
                    const result = await explorerApi.pingConnection(connectionId)
                    setConnectionHealth(connectionId, result.ok ? 'ok' : 'error')
                } catch {
                    setConnectionHealth(connectionId, 'error')
                }
            })
            connectionHealthCheckedAt.value = Date.now()
        } finally {
            connectionHealthChecking.value = false
        }
    }

    async function loadNodeChildren(
        connectionId: string,
        nodeId: string,
        options?: {notify?: boolean; refresh?: boolean; offset?: number; append?: boolean},
    ): Promise<boolean> {
        const requestKey = buildExplorerLoadChildKey(connectionId, nodeId, options)
        const inFlight = loadChildPromises.get(requestKey)
        if (inFlight) return inFlight

        const task = (async (): Promise<boolean> => {
        const silent = {silent: true}
        const notify = options?.notify === true
        const node = findNode(nodeId)
        const startedAt = perfNow()
        const etagKey = `${connectionId}:${nodeId}`
        const connectionDbType = resolveConnectionDbType(tree.value, nodeId)
        const skipConditionalCache =
            options?.refresh
            || options?.offset != null
            || (node?.type === 'database' && catalogNeedsSchemaReload(node.children, connectionDbType))
        try {
            const result = await explorerApi.loadChildren(connectionId, nodeId, {
                ...silent,
                refresh: options?.refresh,
                offset: options?.offset,
                ifNoneMatch: skipConditionalCache ? undefined : childEtags.get(etagKey),
            })
            if (result.etag) {
                childEtags.set(etagKey, result.etag)
            }
            const latest = findNode(nodeId)
            if (result.unchanged) {
                if (result.etag) {
                    childEtags.set(etagKey, result.etag)
                }
                if (latest) markExplorerFolderLoadedIfNeeded(latest)
                markConnectionPooled(connectionId)
                return true
            }
            if (latest) {
                if (options?.append) {
                    appendTablePageChildren(latest, result.tree)
                    rebuildNodeIndex({parent: latest, loadedNodes: result.tree})
                } else {
                    const previousChildren = latest.children?.length ? [...latest.children] : undefined
                    mergeLoadedChildren(latest, result.tree)
                    if (latest.type === 'connection') {
                        migrateExplorerTreeAiStructure(tree.value)
                        rebuildNodeIndex({mode: 'full'})
                    } else {
                        if (latest.type === 'database' || latest.type === 'schema') {
                            ensureAiFolderInScopeChildren(latest, connectionId)
                        }
                        rebuildNodeIndex({parent: latest, previousChildren})
                    }
                }
                markExplorerFolderLoadedIfNeeded(latest)
            }
            logPerf(resolveExplorerLoadPerfOperation(connectionId, nodeId, latest), startedAt, {
                connectionId,
                nodeId,
                childCount: result.tree.length,
            })
            markConnectionPooled(connectionId)
            return true
        } catch (error) {
            if (nodeId === connectionId) {
                reportConnectionFailure(connectionId, error, {notify})
                return false
            }
            if (!isExplorerNodeNotFoundError(error)) {
                return false
            }
            // 后端 schema 缓存与前端节点 id 不同步：先重载连接层再重试一次
            try {
                const failedNode = findNode(nodeId)
                const failedLabel = failedNode?.label
                const failedType = failedNode?.type
                const parentBefore = failedNode ? findParentNode(tree.value, nodeId) : null
                const parentLabel = parentBefore?.label
                const parentType = parentBefore?.type

                childEtags.delete(etagKey)
                const databases = await explorerApi.loadChildren(connectionId, connectionId, {
                    ...silent,
                    refresh: true,
                })
                const connection = findNode(connectionId)
                if (connection) {
                    const previousChildren = connection.children?.length ? [...connection.children] : undefined
                    mergeLoadedChildren(connection, databases.tree)
                    rebuildNodeIndex({parent: connection, previousChildren})
                }

                let retryNodeId = nodeId
                if (!findNode(nodeId) && parentLabel && parentType && failedLabel && failedType) {
                    let refreshedParentId: string | null = null
                    walkTree(tree.value, (n) => {
                        if (
                            n.type === parentType
                            && n.label === parentLabel
                            && resolveConnectionId(tree.value, n.id) === connectionId
                        ) {
                            refreshedParentId = n.id
                            return true
                        }
                    })
                    if (refreshedParentId) {
                        await loadNodeChildren(connectionId, refreshedParentId, {notify: false})
                        const refreshedParent = findNode(refreshedParentId)
                        const refreshedTarget = refreshedParent?.children?.find(
                            (child) => child.type === failedType && child.label === failedLabel,
                        )
                        if (refreshedTarget) {
                            retryNodeId = refreshedTarget.id
                        }
                    }
                }

                const children = await explorerApi.loadChildren(connectionId, retryNodeId, silent)
                const latest = findNode(retryNodeId)
                if (latest) {
                    const previousChildren = latest.children?.length ? [...latest.children] : undefined
                    mergeLoadedChildren(latest, children.tree)
                    markExplorerFolderLoadedIfNeeded(latest)
                    rebuildNodeIndex({parent: latest, previousChildren})
                }
                if (children.etag) {
                    childEtags.set(`${connectionId}:${retryNodeId}`, children.etag)
                }
                markConnectionPooled(connectionId)
                return Boolean(latest)
            } catch (retryError) {
                reportConnectionFailure(connectionId, retryError, {notify})
                return false
            }
        }
        })()

        loadChildPromises.set(requestKey, task)
        try {
            return await task
        } finally {
            loadChildPromises.delete(requestKey)
        }
    }

    async function loadMoreTables(loadMoreNode: TreeNode) {
        const folderId = resolveTablesFolderIdFromLoadMore(loadMoreNode)
        if (!folderId) return
        const connectionId = resolveConnectionId(tree.value, folderId)
        if (!connectionId) return
        if (loadingNodeIds.value.has(loadMoreNode.id)) return
        const offset = parseLoadMoreOffset(loadMoreNode)
        loadingNodeIds.value.add(loadMoreNode.id)
        try {
            await loadNodeChildren(connectionId, folderId, {offset, append: true})
        } finally {
            loadingNodeIds.value.delete(loadMoreNode.id)
        }
    }

    async function ensureChildrenLoaded(nodeId: string, options?: {notify?: boolean}): Promise<void> {
        const node = findNode(nodeId)
        if (!node) return

        if (node.type === 'project-docs' || node.type === 'project-scripts') {
            if (node.meta === 'loaded') return
            loadingNodeIds.value.add(nodeId)
            try {
                const children = await loadProjectFilesChildren(node)
                const previousChildren = node.children?.length ? [...node.children] : undefined
                node.children = children
                node.meta = 'loaded'
                rebuildNodeIndex({parent: node, previousChildren, loadedNodes: children})
            } catch {
                node.children = []
                node.meta = 'loaded'
                touchTree()
            } finally {
                loadingNodeIds.value.delete(nodeId)
            }
            return
        }

        const connectionId = resolveConnectionId(tree.value, nodeId)
        if (!connectionId) return

        const isConnectionProbe = node.type === 'connection' && nodeId === connectionId
        const notify = options?.notify === true

        if (node.type === 'ssh-script-records') {
            if (node.meta === 'loaded') {
                return
            }
            loadingNodeIds.value.add(nodeId)
            try {
                await refreshSshScriptRecordChildren(node, connectionId)
                touchTree()
            } catch {
                node.children = []
                node.meta = 'loaded'
                touchTree()
            } finally {
                loadingNodeIds.value.delete(nodeId)
            }
            return
        }

        if (!needsLazyLoad(node, resolveConnectionDbType(tree.value, nodeId))) {
            if (shouldAffirmConnectionHealthForCachedChildren(node, connectionId, nodeId, notify)) {
                markConnectionAttempted(connectionId)
                setConnectionHealth(connectionId, 'ok')
            }
            return
        }

        const inFlight = loadChildPromises.get(buildExplorerLoadChildKey(connectionId, nodeId))
        if (inFlight) {
            await inFlight
            return
        }

        loadingNodeIds.value.add(nodeId)
        try {
            if (isConnectionProbe && notify) {
                markConnectionAttempted(connectionId)
            }
            const ok = await loadNodeChildren(connectionId, nodeId, {notify})
            if (isConnectionProbe && notify) {
                setConnectionHealth(connectionId, ok ? 'ok' : 'error')
                if (ok) markConnectionPooled(connectionId)
            }
        } finally {
            loadingNodeIds.value.delete(nodeId)
        }
    }

    /** 加载子级并展开（expanded 仅表示 UI 状态，不表示已加载） */
    async function expandAndLoad(nodeId: string, options?: {load?: boolean; notify?: boolean}) {
        const node = findNode(nodeId)
        if (!node) return
        await ensureFlatConnectionFeatureChildren(node)
        if (options?.load !== false) {
            await ensureChildrenLoaded(nodeId, {notify: options?.notify})
        }
        node.expanded = true
        touchTree()
    }

    function isRootTreeNode(nodeId: string) {
        return tree.value.some((root) => root.id === nodeId)
    }

    /** 按 app-config 恢复根分组展开；不写回配置（仅手动展开/收起才落盘）。 */
    function restoreExpandedNodes(ids: string[]) {
        applyFirstLevelExpandedNodeIds(tree.value, ids ?? [])
        treeVersion.value += 1
    }

    /** 从根到目标：逐层 load + expand，避免 expandToNode 只改 UI 标志导致空节点 */
    async function expandPathToNode(nodeId: string, options?: {notify?: boolean}) {
        const chain: TreeNode[] = []
        walkTree(tree.value, (node, parents) => {
            if (node.id === nodeId) {
                chain.push(...parents, node)
                return true
            }
        })
        const segments: TreeNode[][] = []
        let currentSegment: TreeNode[] = []
        let currentConnectionId: string | null = null
        for (const item of chain) {
            const connectionId = resolveConnectionId(tree.value, item.id) ?? ''
            if (currentConnectionId !== null && connectionId !== currentConnectionId) {
                segments.push(currentSegment)
                currentSegment = []
            }
            currentConnectionId = connectionId
            currentSegment.push(item)
        }
        if (currentSegment.length) {
            segments.push(currentSegment)
        }
        await runWithConcurrencyLimit(segments, EXPLORER_EXPAND_PATH_CONCURRENCY, async (segment) => {
            const pendingLoads: Array<{nodeId: string; notify: boolean}> = []
            for (const item of segment) {
                const node = findNode(item.id)
                if (!node) continue
                await ensureFlatConnectionFeatureChildren(node)
                const connectionId = resolveConnectionId(tree.value, item.id) ?? ''
                const notify = options?.notify === true && item.type === 'connection'
                const dbType = resolveConnectionDbType(tree.value, item.id)
                if (needsLazyLoad(node, dbType)) {
                    pendingLoads.push({nodeId: item.id, notify})
                    continue
                }
                if (
                    shouldAffirmConnectionHealthForCachedChildren(
                        node,
                        connectionId,
                        item.id,
                        notify,
                    )
                ) {
                    markConnectionAttempted(connectionId)
                    setConnectionHealth(connectionId, 'ok')
                }
                node.expanded = true
            }
            for (const load of pendingLoads) {
                await ensureChildrenLoaded(load.nodeId, {notify: load.notify})
                const loaded = findNode(load.nodeId)
                if (loaded) loaded.expanded = true
            }
        })
        touchTree()
    }

    function collapseNode(nodeId: string) {
        const node = findNode(nodeId)
        if (node) {
            node.expanded = false
            touchTree()
            if (isRootTreeNode(nodeId)) {
                persistFirstLevelExpandedSoon()
            }
        }
    }

    async function toggleExpand(nodeId: string, options?: {notify?: boolean}) {
        if (isExplorerFavoritesGroupId(nodeId)) {
            toggleFavoritesGroupExpanded()
            return
        }
        const node = findNode(nodeId)
        if (!node) return

        if (node.type === 'load_more') {
            await loadMoreTables(node)
            return
        }

        const dbType = resolveConnectionDbType(tree.value, nodeId)
        if (shouldCollapseOnToggle(node, dbType)) {
            collapseNode(nodeId)
            return
        }
        const notify = options?.notify ?? node.type === 'connection'
        if (node.type === 'connection' && notify && !isConnectionPooled(nodeId)) {
            await connectConnection(nodeId, {notify})
            return
        }
        await expandAndLoad(nodeId, {notify})
        if (isRootTreeNode(nodeId)) {
            persistFirstLevelExpandedSoon()
        }
    }

    /** 根分组手动展开/收起后写入 app-config。 */
    function persistFirstLevelExpandedSoon() {
        void import('@/features/layout/stores/app-config-store').then(({useAppConfigStore}) => {
            useAppConfigStore().persistExplorerExpandedSoon()
        })
    }

    function selectNode(nodeId: string) {
        selectedNodeId.value = nodeId
    }

    /** @deprecated 仅用于 group 等无懒加载节点；连接/schema 请用 expandPathToNode */
    function expandToNode(nodeId: string) {
        markExpandedPath(tree.value, nodeId)
        touchTree()
    }

    function locatePathNeedsFetch(activeTab: WorkspaceTab): boolean {
        if (!activeTab.connectionId) return false

        const conn = findNode(activeTab.connectionId)
        if (conn && needsLazyLoad(conn, conn.dbType)) return true

        if (activeTab.type !== 'console' && activeTab.type !== 'table') return false

        const databaseLabel =
            activeTab.type === 'table'
                ? activeTab.database?.trim()
                ?? (activeTab.instanceId
                    ? findNode(activeTab.instanceId)?.label?.trim()
                    : undefined)
                : resolveConsoleInstanceLabel({
                    tabInstanceId: activeTab.instanceId,
                    tabDatabase: activeTab.database,
                    findNodeLabel: (nodeId) => findNode(nodeId)?.label,
                    resolveScopedLabel: buildExplorerScopedLabelResolver(tree.value, findNode),
                })

        if (!databaseLabel) return false

        const databaseNode = findDatabaseNode(
            activeTab.connectionId,
            databaseLabel,
            activeTab.instanceId,
        )
        if (!databaseNode) return true
        const connectionDbType = resolveConnectionDbType(tree.value, activeTab.connectionId)
        if (needsLazyLoad(databaseNode, connectionDbType)) return true

        const needsFolder =
            activeTab.type === 'table'
                ? !!activeTab.tableName?.trim()
                : !!resolveSqlFileForLocate(activeTab)
        if (!needsFolder) return false

        const folderLabel = activeTab.type === 'table' ? 'tables' : 'workspaces'
        const folder =
            folderLabel === 'tables'
                ? findExplorerTablesFolder(databaseNode)
                : databaseNode.children?.find(
                    (child) => child.type === 'folder' && child.label.toLowerCase() === folderLabel,
                )
        if (!folder) return true
        return needsLazyLoad(folder, connectionDbType)
    }

    function findTableNodeId(tableName: string): string | null {
        let found: string | null = null
        walkTree(tree.value, (node) => {
            if (node.type === 'table' && node.label === tableName) {
                found = node.id
                return true
            }
        })
        return found
    }

    function resolveActiveTabLocateNodeId(activeTab: WorkspaceTab | null): string | null {
        return resolveLocateNodeId(activeTab, {
            findNode,
            findDatabaseNode,
            findNodeLabel: (nodeId) => findNode(nodeId)?.label,
            findTableNodeGlobal: findTableNodeId,
        })
    }

    async function ensureDatabaseBranchLoaded(
        connectionId: string,
        instanceLabel: string,
        instanceId?: string | null,
    ): Promise<TreeNode | null> {
        await ensureChildrenLoaded(connectionId)
        const databaseNode = findDatabaseNode(connectionId, instanceLabel, instanceId)
        if (!databaseNode) return null
        await ensureChildrenLoaded(databaseNode.id)
        if (!databaseNode.expanded) {
            databaseNode.expanded = true
            touchTree()
        }
        return findDatabaseNode(connectionId, instanceLabel, instanceId)
    }

    async function ensureFolderBranchLoaded(
        connectionId: string,
        databaseNode: TreeNode,
        folderLabel: 'tables' | 'workspaces',
    ) {
        const folder = databaseNode.children?.find(
            (child) => child.type === 'folder' && child.label.toLowerCase() === folderLabel,
        )
        if (!folder) return
        await ensureChildrenLoaded(folder.id)
        if (!folder.expanded) {
            folder.expanded = true
            touchTree()
        }
    }

    async function ensureLocatePathLoaded(activeTab: WorkspaceTab): Promise<void> {
        if (!activeTab.connectionId) return

        const pinnedId = activeTab.explorerNodeId?.trim()
        const pinnedNode = pinnedId ? findNode(pinnedId) : null
        const folderLabel = pinnedNode ? resolveLocateFolderForNode(pinnedNode) : null

        if (activeTab.type === 'console') {
            const instanceLabel = resolveConsoleInstanceLabel({
                tabInstanceId: activeTab.instanceId,
                tabDatabase: activeTab.database,
                findNodeLabel: (nodeId) => findNode(nodeId)?.label,
                resolveScopedLabel: buildExplorerScopedLabelResolver(tree.value, findNode),
            })
            if (!instanceLabel) {
                await ensureChildrenLoaded(activeTab.connectionId)
                return
            }
            const databaseNode = await ensureDatabaseBranchLoaded(
                activeTab.connectionId,
                instanceLabel,
                activeTab.instanceId,
            )
            if (!databaseNode) return
            const needsWorkspaces =
                folderLabel === 'workspaces'
                || !!resolveSqlFileForLocate(activeTab)
            if (needsWorkspaces) {
                await ensureFolderBranchLoaded(activeTab.connectionId, databaseNode, 'workspaces')
            }
            return
        }

        if (activeTab.type === 'table' && activeTab.tableName?.trim()) {
            const databaseLabel =
                activeTab.database?.trim()
                ?? (activeTab.instanceId
                    ? findNode(activeTab.instanceId)?.label?.trim()
                    : undefined)
            if (!databaseLabel) {
                await ensureChildrenLoaded(activeTab.connectionId)
                return
            }
            const databaseNode = await ensureDatabaseBranchLoaded(
                activeTab.connectionId,
                databaseLabel,
                activeTab.instanceId,
            )
            if (!databaseNode) return
            if (folderLabel === 'tables' || activeTab.tableName.trim()) {
                await ensureFolderBranchLoaded(activeTab.connectionId, databaseNode, 'tables')
            }
            return
        }

        await ensureChildrenLoaded(activeTab.connectionId)
    }

    async function ensureProjectSandboxLocatePath(uri: string): Promise<void> {
        for (const folderId of listProjectFileAncestorFolderIds(uri)) {
            await ensureChildrenLoaded(folderId)
            const folder = findNode(folderId)
            if (folder && !folder.expanded) {
                folder.expanded = true
                touchTree()
            }
        }
    }

    async function resolveActiveTabLocateNodeIdAsync(
        activeTab: WorkspaceTab | null,
    ): Promise<string | null> {
        if (!activeTab) return null

        const projectUri = resolveProjectSandboxTabLocateUri(activeTab)
        if (projectUri) {
            await ensureProjectSandboxLocatePath(projectUri)
            return resolveActiveTabLocateNodeId(activeTab)
        }

        const cachedTargetId = resolveActiveTabLocateNodeId(activeTab)
        if (cachedTargetId && findNode(cachedTargetId) && !locatePathNeedsFetch(activeTab)) {
            return cachedTargetId
        }

        if (activeTab.connectionId && (activeTab.type === 'console' || activeTab.type === 'table')) {
            await ensureLocatePathLoaded(activeTab)
        } else if (activeTab.connectionId) {
            await ensureChildrenLoaded(activeTab.connectionId)
        }
        return resolveActiveTabLocateNodeId(activeTab)
    }

    async function revealNode(nodeId: string, options?: { select?: boolean }): Promise<TreeNode | null> {
        const node = findNode(nodeId)
        if (!node) return null
        const wasSelected = selectedNodeId.value === nodeId
        if (searchQuery.value.trim()) searchQuery.value = ''
        await expandPathToNode(nodeId)
        if (options?.select !== false) selectNode(nodeId)
        if (!wasSelected) triggerFlash(nodeId)
        scrollExplorerNodeIntoView(nodeId)
        return node
    }

    async function locateActiveTabNode(activeTab: WorkspaceTab | null): Promise<TreeNode | null> {
        let nodeId = await resolveActiveTabLocateNodeIdAsync(activeTab)
        if (!nodeId) return null

        if (
            activeTab?.type === 'console'
            && activeTab.connectionId
            && resolveSqlFileForLocate(activeTab)
            && countTreeNodesWithId(tree.value, nodeId) > 1
        ) {
            const instanceLabel = resolveConsoleInstanceLabel({
                tabInstanceId: activeTab.instanceId,
                tabDatabase: activeTab.database,
                findNodeLabel: (id) => findNode(id)?.label,
                resolveScopedLabel: buildExplorerScopedLabelResolver(tree.value, findNode),
            })
            if (instanceLabel) {
                await reloadWorkspacesFolder(activeTab.connectionId, instanceLabel, activeTab.instanceId)
                nodeId = await resolveActiveTabLocateNodeIdAsync(activeTab)
                if (!nodeId) return null
            }
        }

        return revealNode(nodeId, {select: true})
    }

    async function locateSelectedNode(): Promise<TreeNode | null> {
        if (!selectedNodeId.value) return null
        return revealNode(selectedNodeId.value, {select: false})
    }

    function triggerFlash(nodeId: string) {
        if (flashTimer) clearTimeout(flashTimer)
        flashNodeId.value = nodeId
        flashTimer = setTimeout(() => {
            flashNodeId.value = null
            flashTimer = null
        }, 700)
    }

    async function locateNode(nodeId: string): Promise<TreeNode | null> {
        return revealNode(nodeId, {select: true})
    }

    function clearFlash() {
        if (flashTimer) clearTimeout(flashTimer)
        flashTimer = null
        flashNodeId.value = null
    }

    function commitExplorerTree(nextRoots: TreeNode[]) {
        const expandedIds = collectExpandedNodeIds(tree.value)
        const roots = injectProjectFileRoots(nextRoots)
        tree.value = applyExplorerTreeStructure(roots, tree.value)
        // 会话内展开态以本地为准；服务端 group.expanded 不参与 UI。
        applyExpandedNodeIds(tree.value, expandedIds)
        migrateExplorerTreeAiStructure(tree.value)
        rebuildNodeIndex({mode: 'full'})
        backfillPinnedTableMetadata(tree.value)
        applyPinnedSortInTree(tree.value)
        const validConnectionIds = collectConnectionIdsFromTree()
        connectionHealthById.value = pruneConnectionHealthByIds(
            connectionHealthById.value,
            validConnectionIds,
        )
        pruneAttemptedConnections(validConnectionIds)
    }

    async function reloadExplorerTree(refresh = false) {
        const nextRoots = await explorerApi.fetchTree(refresh ? {refresh: true} : undefined)
        commitExplorerTree(nextRoots)
    }

    async function afterExplorerMutation<T extends {tree: TreeNode[]}>(
        mutate: () => Promise<T>,
    ): Promise<T> {
        const result = await mutate()
        commitExplorerTree(result.tree)
        return result
    }

    async function afterExplorerTreeUpdate(mutate: () => Promise<TreeNode[]>): Promise<void> {
        commitExplorerTree(await mutate())
    }

    async function loadTree(options?: {restoreExpandedIds?: string[]}) {
        try {
            await ensureExplorerUiCatalogLoaded()
            await reloadExplorerTree()
            const nodes = tree.value
            if (!selectedNodeId.value) {
                selectedNodeId.value = nodes[0]?.children?.[0]?.id ?? nodes[0]?.id ?? null
            }
            restoreExpandedNodes(options?.restoreExpandedIds ?? [])
        } finally {
            treeReady.value = true
        }
    }

    async function refreshTree() {
        if (isRefreshing.value) return
        isRefreshing.value = true
        try {
            await ensureExplorerUiCatalogLoaded({force: true})
            const expandedIds = collectFirstLevelExpandedNodeIds(tree.value)
            await reloadExplorerTree(true)
            restoreExpandedNodes(expandedIds)
        } finally {
            isRefreshing.value = false
        }
    }

    async function addRootFolder(label: string) {
        const {groupId} = await afterExplorerMutation(() => explorerApi.createGroup(label))
        clearFlash()
        await revealNode(groupId, {select: true})
        return groupId
    }

    async function addGroup(label: string, parentId: string) {
        const {groupId} = await afterExplorerMutation(() => explorerApi.createGroup(label, parentId))
        clearFlash()
        await expandPathToNode(parentId)
        await revealNode(groupId, {select: true})
        return groupId
    }

    async function renameGroup(groupId: string, label: string) {
        await afterExplorerTreeUpdate(() => explorerApi.updateGroup(groupId, label))
        selectNode(groupId)
        expandToNode(groupId)
    }

    async function addConnection(config: ConnectionConfig, groupId?: string) {
        const {connectionId} = await afterExplorerMutation(() =>
            explorerApi.createConnection(config, groupId),
        )
        void import('@/features/workspace/services/welcome-recent-connections.service')
            .then(({touchAddedConnection}) => touchAddedConnection(connectionId))
            .catch(() => undefined)
        selectNode(connectionId)
        expandToNode(connectionId)
        const connection = findNode(connectionId)
        if (connection && !connection.expanded) {
            await toggleExpand(connectionId)
        }
        return connectionId
    }

    async function updateConnection(connectionId: string, config: ConnectionConfig) {
        await afterExplorerTreeUpdate(() => explorerApi.updateConnection(connectionId, config))
    }

    async function moveConnection(connectionId: string, targetGroupId: string) {
        await afterExplorerTreeUpdate(() => explorerApi.moveConnection(connectionId, targetGroupId))
        selectNode(connectionId)
        expandToNode(targetGroupId)
        expandToNode(connectionId)
    }

    async function reorderCatalogNode(
        nodeId: string,
        targetId: string,
        position: 'before' | 'after' | 'inside',
    ) {
        await afterExplorerTreeUpdate(() =>
            explorerApi.reorderCatalogNode(nodeId, targetId, position),
        )
        selectNode(nodeId)
        expandToNode(nodeId)
        if (position === 'inside') {
            expandToNode(targetId)
        }
    }

    async function deleteNode(nodeId: string) {
        await afterExplorerTreeUpdate(() => explorerApi.deleteNode(nodeId))
        if (selectedNodeId.value === nodeId) {
            selectedNodeId.value = tree.value[0]?.id ?? null
        }
        // AI table tags are cascaded server-side; refresh any open Agent scope panels.
        notifyAiTableTagsChanged()
    }

    function findDatabaseNode(connectionId: string, instanceLabel: string, instanceId?: string | null): TreeNode | null {
        const connection = findNode(connectionId)
        const dbType = resolveConnectionDbType(tree.value, connectionId) ?? connection?.dbType

        if (instanceId) {
            const byId = findNode(instanceId)
            if (byId && (byId.type === 'database' || byId.type === 'schema')) {
                const parentConnectionId = resolveConnectionId(tree.value, byId.id)
                if (parentConnectionId === connectionId) {
                    return byId
                }
            }
        }

        if (connection && isCatalogSchemaDbType(dbType) && instanceLabel.includes('.')) {
            return findExplorerScopeNode(connection, dbType, instanceLabel)
        }

        let found: TreeNode | null = null
        walkTree(tree.value, (node, parents) => {
            if (node.type !== 'database' || node.label !== instanceLabel) return
            const connectionNode = [...parents].reverse().find((item) => item.type === 'connection')
            if (connectionNode?.id === connectionId) {
                found = node
                return true
            }
        })
        return found
    }

    async function forceLoadChildren(connectionId: string, node: TreeNode) {
        loadingNodeIds.value.add(node.id)
        try {
            const result = await explorerApi.loadChildren(connectionId, node.id)
            const previousChildren = node.children?.length ? [...node.children] : undefined
            mergeLoadedChildren(node, result.tree)
            rebuildNodeIndex({parent: node, previousChildren})
            return result.tree
        } finally {
            loadingNodeIds.value.delete(node.id)
        }
    }

    async function reloadConnectionCatalog(connectionId: string) {
        const node = findNode(connectionId)
        if (!node || node.type !== 'connection') return
        node.children = []
        node.meta = undefined
        childEtags.delete(`${connectionId}:${connectionId}`)
        if (node.dbType === 'nacos') {
            await ensureFlatConnectionFeatureChildren(node)
        } else {
            await loadNodeChildren(connectionId, connectionId, {refresh: true})
        }
        node.expanded = true
        touchTree()
    }

    async function reloadTablesFolder(
        connectionId: string,
        databaseLabel: string,
        databaseNodeId?: string | null,
    ) {
        let databaseNode = findDatabaseNode(connectionId, databaseLabel, databaseNodeId)
        if (!databaseNode && databaseNodeId) {
            databaseNode = findDatabaseNode(connectionId, databaseLabel)
        }
        if (!databaseNode) return

        await expandPathToNode(databaseNode.id)
        await loadNodeChildren(connectionId, databaseNode.id, {refresh: true})

        databaseNode = findDatabaseNode(connectionId, databaseLabel, databaseNodeId)
            ?? findDatabaseNode(connectionId, databaseLabel)
            ?? databaseNode
        const folder = findExplorerTablesFolder(databaseNode)
        if (!folder) return

        childEtags.delete(`${connectionId}:${folder.id}`)
        const ok = await loadNodeChildren(connectionId, folder.id, {refresh: true})
        if (!ok) {
            throw new Error(i18n.global.t('explorer.refreshFailed'))
        }
        folder.expanded = true
        touchTree()
    }

    async function reloadWorkspacesFolder(
        connectionId: string,
        instanceLabel: string,
        instanceId?: string | null,
    ) {
        const connectionNode = findNode(connectionId)
        if (connectionNode && !connectionNode.children?.length) {
            await forceLoadChildren(connectionId, connectionNode)
            connectionNode.expanded = true
            touchTree()
        }

        let scopeNode = findDatabaseNode(connectionId, instanceLabel, instanceId)
        if (!scopeNode && instanceId) {
            scopeNode = findDatabaseNode(connectionId, instanceLabel)
        }
        if (!scopeNode) return

        await expandPathToNode(scopeNode.id)
        await forceLoadChildren(connectionId, scopeNode)

        const folder = scopeNode.children?.find(
            (child) => child.type === 'folder' && child.label === 'workspaces',
        )
        if (!folder) return

        await forceLoadChildren(connectionId, folder)
        folder.expanded = true
        touchTree()
        await expandPathToNode(folder.id)
    }

    async function reloadModelsFolder(
        connectionId: string,
        instanceLabel: string,
        instanceId?: string | null,
    ) {
        const connectionNode = findNode(connectionId)
        if (connectionNode && !connectionNode.children?.length) {
            await forceLoadChildren(connectionId, connectionNode)
            connectionNode.expanded = true
            touchTree()
        }

        let scopeNode = findDatabaseNode(connectionId, instanceLabel, instanceId)
        if (!scopeNode && instanceId) {
            scopeNode = findDatabaseNode(connectionId, instanceLabel)
        }
        if (!scopeNode) return

        await expandPathToNode(scopeNode.id)
        await forceLoadChildren(connectionId, scopeNode)

        const folder = scopeNode.children?.find(
            (child) => child.type === 'folder' && child.label === 'models',
        )
        if (!folder) return

        folder.children = []
        await forceLoadChildren(connectionId, folder)
        folder.expanded = true
        touchTree()
        await expandPathToNode(folder.id)
    }

    /** @deprecated use reloadModelsFolder */
    async function reloadViewsFolder(
        connectionId: string,
        instanceLabel: string,
        instanceId?: string | null,
    ) {
        return reloadModelsFolder(connectionId, instanceLabel, instanceId)
    }

    async function importConnections(configs: ConnectionConfig[]) {
        const {count} = await afterExplorerMutation(() => explorerApi.importConnections(configs))
        return count
    }

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

    function resetConnectionTreeState(connectionId: string) {
        const node = findNode(connectionId)
        if (!node || node.type !== 'connection') return
        const previousChildren = node.children?.length ? [...node.children] : undefined
        node.children = undefined
        node.expanded = false
        rebuildNodeIndex({parent: node, previousChildren})
        for (const key of [...childEtags.keys()]) {
            if (key.startsWith(`${connectionId}:`)) {
                childEtags.delete(key)
            }
        }
        for (const key of [...loadChildPromises.keys()]) {
            if (key.startsWith(`${connectionId}:`)) {
                loadChildPromises.delete(key)
            }
        }
        clearExplorerFolderLoadedIds((nodeId) => nodeId.includes(connectionId))
        invalidateSemanticMetrics(connectionId)
    }

    function handleServerIdleDisconnect(connectionId: string, options?: {notify?: boolean}) {
        const node = findNode(connectionId)
        if (!node || node.type !== 'connection') return
        if (!usesConnectionReconnectOverlay(node.dbType)) {
            // Stateless: no pool to release; keep green badge while tab is open / in use.
            return
        }
        const hadLoadedTree = Boolean(node.children?.length) || node.expanded
        resetConnectionTreeState(connectionId)
        setConnectionHealth(connectionId, null)
        unmarkConnectionPooled(connectionId)
        markConnectionNeedsReconnect(connectionId)
        if (options?.notify && hadLoadedTree) {
            useLayoutStore().showWarningToast(
                i18n.global.t('explorer.connectionIdleDisconnected', {name: node.label}),
            )
        }
    }

    function clearConnectionLoadedState(connectionId: string) {
        resetConnectionTreeState(connectionId)
        setConnectionHealth(connectionId, null)
        unmarkConnectionPooled(connectionId)
        if (attemptedConnectionIds.value.has(connectionId)) {
            attemptedConnectionIds.value = new Set(
                [...attemptedConnectionIds.value].filter((id) => id !== connectionId),
            )
        }
    }

    async function syncPooledConnectionState(options?: {notifyIdleDisconnect?: boolean}) {
        try {
            const pooled = await explorerApi.listPooledConnections()
            const prevPooled = pooledConnectionIds.value
            let openTabConnectionIds = new Set<string>()
            try {
                const {useWorkspaceStore} = await import('@/features/workspace/stores/workspace')
                for (const tab of useWorkspaceStore().tabs) {
                    if (tab.connectionId) openTabConnectionIds.add(tab.connectionId)
                }
            } catch {
                // workspace may not be mounted yet during startup
            }
            const {nextPooledIds, evictedIds} = mergePooledConnectionSync({
                serverPooledIds: pooled,
                previousPooledIds: prevPooled,
                resolveDbType: (connectionId) => findNode(connectionId)?.dbType,
                isUiConnected: (connectionId) => connectionHealthById.value[connectionId] === 'ok',
                isConnectionInUse: (connectionId) =>
                    attemptedConnectionIds.value.has(connectionId)
                    || openTabConnectionIds.has(connectionId),
            })
            pooledConnectionIds.value = nextPooledIds

            for (const connectionId of evictedIds) {
                handleServerIdleDisconnect(connectionId, {
                    notify: options?.notifyIdleDisconnect,
                })
            }
        } catch {
            // best effort: backend may be offline during startup
        }
    }

    async function disconnectConnection(connectionId: string): Promise<boolean> {
        const node = findNode(connectionId)
        if (!node || node.type !== 'connection') return false
        try {
            if (node.dbType === 'plugin') {
                const config = await explorerApi.fetchConnection(connectionId)
                const {createHttpCommunityPluginsApi} = await import('@/shared/api/http/community-plugins')
                await createHttpCommunityPluginsApi().disconnect(config)
                // Community plugins own their workbench session; no JDBC reconnect overlay.
                clearConnectionLoadedState(connectionId)
                return true
            }
            await explorerApi.disconnectConnection(connectionId)
            // Drop green badge immediately after server confirms disconnect.
            clearConnectionLoadedState(connectionId)
            markConnectionNeedsReconnect(connectionId)
            return true
        } catch {
            return false
        }
    }

    async function connectConnection(
        connectionId: string,
        options?: {notify?: boolean},
    ): Promise<boolean> {
        const node = findNode(connectionId)
        if (!node || node.type !== 'connection') return false

        // Community plugins have no JDBC pool — activate sidecar, connect, open workbench.
        if (node.dbType === 'plugin') {
            loadingNodeIds.value.add(connectionId)
            try {
                const {connectAndOpenCommunityPluginWorkbench} = await import(
                    '@/features/community-plugin/lib/connectCommunityPluginWorkbench'
                )
                const result = await connectAndOpenCommunityPluginWorkbench(connectionId, {
                    title: node.label,
                })
                if (!result.ok) {
                    markConnectionAttempted(connectionId)
                    setConnectionHealth(connectionId, 'error')
                    unmarkConnectionPooled(connectionId)
                    if (options?.notify === true) {
                        useLayoutStore().showErrorToast(result.message || 'Plugin connect failed')
                    }
                    return false
                }
                markConnectionAttempted(connectionId)
                setConnectionHealth(connectionId, 'ok')
                markConnectionPooled(connectionId)
                clearConnectionNeedsReconnect(connectionId)
                markStartupPhase('first-connection')
                void import('@/features/workspace/services/welcome-recent-connections.service')
                    .then(({touchRecentConnection}) => touchRecentConnection(connectionId))
                    .catch(() => undefined)
                return true
            } catch (error) {
                markConnectionAttempted(connectionId)
                setConnectionHealth(connectionId, 'error')
                unmarkConnectionPooled(connectionId)
                void reportConnectionFailure(connectionId, error, {
                    notify: options?.notify,
                    retry: () => connectConnection(connectionId, {notify: options?.notify}),
                })
                return false
            } finally {
                loadingNodeIds.value.delete(connectionId)
            }
        }

        loadingNodeIds.value.add(connectionId)
        const startedAt = perfNow()
        try {
            const result = await explorerApi.connectConnection(connectionId)
            logPerf('connection.api', startedAt, {
                connectionId,
                ok: result.ok,
                serverProbeMs: result.latencyMs,
            })
            if (!result.ok) {
                markConnectionAttempted(connectionId)
                setConnectionHealth(connectionId, 'error')
                unmarkConnectionPooled(connectionId)
                if (options?.notify === true) {
                    useLayoutStore().showErrorToast(resolveConnectionErrorMessage(result))
                }
                return false
            }
            markConnectionAttempted(connectionId)
            // Show green badge as soon as connect succeeds — don't wait for tree expand.
            setConnectionHealth(connectionId, 'ok')
            markConnectionPooled(connectionId)
            clearConnectionNeedsReconnect(connectionId)
            markStartupPhase('first-connection')
            void import('@/features/workspace/services/welcome-recent-connections.service')
                .then(({touchRecentConnection}) => touchRecentConnection(connectionId))
                .catch(() => undefined)
            const expandStartedAt = perfNow()
            try {
                await expandAndLoad(connectionId, {notify: options?.notify})
                logPerf('connection.expand', expandStartedAt, {connectionId})
            } catch (expandError) {
                // Pool is already warm — keep the green badge; tree can be expanded again later.
                void reportConnectionFailure(connectionId, expandError, {
                    notify: options?.notify,
                    retry: () => expandAndLoad(connectionId, {notify: options?.notify}).then(() => true).catch(() => false),
                })
            }
            logPerf('connection.total', startedAt, {connectionId, ok: true})
            void reconnectSshTerminalsForConnection(connectionId)
            return true
        } catch (error) {
            markConnectionAttempted(connectionId)
            setConnectionHealth(connectionId, 'error')
            unmarkConnectionPooled(connectionId)
            void reportConnectionFailure(connectionId, error, {
                notify: options?.notify,
                retry: () => connectConnection(connectionId, {notify: options?.notify}),
            })
            return false
        } finally {
            loadingNodeIds.value.delete(connectionId)
        }
    }

    async function reconnectConnection(
        connectionId: string,
        options?: {notify?: boolean},
    ): Promise<boolean> {
        const node = findNode(connectionId)
        if (!node || node.type !== 'connection') return false

        clearConnectionLoadedState(connectionId)
        loadingNodeIds.value.add(connectionId)
        const startedAt = perfNow()
        try {
            const result = await explorerApi.reconnectConnection(connectionId)
            logPerf('connection.reconnect.api', startedAt, {
                connectionId,
                ok: result.ok,
                serverProbeMs: result.latencyMs,
            })
            if (!result.ok) {
                markConnectionAttempted(connectionId)
                setConnectionHealth(connectionId, 'error')
                unmarkConnectionPooled(connectionId)
                markConnectionNeedsReconnect(connectionId)
                if (options?.notify === true) {
                    useLayoutStore().showErrorToast(resolveConnectionErrorMessage(result))
                }
                return false
            }
            markConnectionAttempted(connectionId)
            setConnectionHealth(connectionId, 'ok')
            markConnectionPooled(connectionId)
            clearConnectionNeedsReconnect(connectionId)
            const expandStartedAt = perfNow()
            try {
                await expandAndLoad(connectionId, {notify: options?.notify})
                logPerf('connection.reconnect.expand', expandStartedAt, {connectionId})
            } catch (expandError) {
                void reportConnectionFailure(connectionId, expandError, {
                    notify: options?.notify,
                    retry: () => expandAndLoad(connectionId, {notify: options?.notify}).then(() => true).catch(() => false),
                })
            }
            logPerf('connection.reconnect.total', startedAt, {connectionId, ok: true})
            void reconnectSshTerminalsForConnection(connectionId)
            return true
        } catch (error) {
            markConnectionAttempted(connectionId)
            setConnectionHealth(connectionId, 'error')
            unmarkConnectionPooled(connectionId)
            markConnectionNeedsReconnect(connectionId)
            void reportConnectionFailure(connectionId, error, {
                notify: options?.notify,
                retry: () => reconnectConnection(connectionId, {notify: options?.notify}),
            })
            return false
        } finally {
            loadingNodeIds.value.delete(connectionId)
        }
    }

    async function reloadRedisKeys(connectionId: string, pattern?: string) {
        const connection = findNode(connectionId)
        if (!connection || connection.dbType !== 'redis') return
        markConnectionAttempted(connectionId)
        loadingNodeIds.value.add(connectionId)
        try {
            const result = await explorerApi.loadChildren(connectionId, connectionId, {pattern, refresh: true})
            const previousChildren = connection.children?.length ? [...connection.children] : undefined
            mergeLoadedChildren(connection, result.tree)
            rebuildNodeIndex({parent: connection, previousChildren})
            connection.expanded = true
            touchTree()
            setConnectionHealth(connectionId, 'ok')
        } finally {
            loadingNodeIds.value.delete(connectionId)
        }
    }

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
