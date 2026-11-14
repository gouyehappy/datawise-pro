/**
 * Explorer lazy-load / expand / reload domain (FE-P0-3 store).
 * Factory over shared store refs — `useExplorerStore` remains the public facade.
 */
import {ref, type ShallowRef} from 'vue'
import type {TreeNode} from '@/core/types'
import {
    findParentNode,
    resolveConnectionId,
    walkTree,
} from '@/core/utils/tree'
import {logPerf, perfNow} from '@/core/utils/perf-log'
import {
    findExplorerScopeNode,
    findExplorerTablesFolder,
} from '@/features/explorer/services/explorer-database-scope'
import {
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
    shouldAffirmConnectionHealthForCachedChildren,
} from '@/features/explorer/services/explorer-lazy-load'
import {
    loadProjectFilesChildren,
} from '@/features/project/services/project-explorer-files'
import {ensureFlatConnectionFeatureChildren} from '@/features/explorer/services/flat-connection-feature-tree.service'
import {refreshSshScriptRecordChildren} from '@/features/explorer/services/ssh-feature-tree.service'
import {explorerApi} from '@/api'
import {applyFirstLevelExpandedNodeIds} from '@/features/explorer/utils/tree-session'
import {i18n} from '@/i18n'
import {
    EXPLORER_EXPAND_PATH_CONCURRENCY,
    runWithConcurrencyLimit,
} from '@/core/utils/concurrency-limit'
import {
    ensureAiFolderInScopeChildren,
    migrateExplorerTreeAiStructure,
} from '@/features/explorer/services/explorer-ai-tree.service'
import {isExplorerFavoritesGroupId} from '@/features/explorer/services/explorer-favorites.constants'

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

export type RebuildNodeIndexOptions = {
    mode?: 'full'
    parent?: TreeNode
    previousChildren?: TreeNode[]
    loadedNodes?: TreeNode[]
}

export type ExplorerLazyLoadDomainDeps = {
    tree: ShallowRef<TreeNode[]>
    findNode: (nodeId: string) => TreeNode | null
    touchTree: () => void
    rebuildNodeIndex: (options?: RebuildNodeIndexOptions) => void
    /** Late-bound connection-domain helpers. */
    markConnectionPooled: (connectionId: string) => void
    markConnectionAttempted: (connectionId: string) => void
    setConnectionHealth: (connectionId: string, health: 'ok' | 'error' | null) => void
    reportConnectionFailure: (
        connectionId: string,
        error: unknown,
        options?: {notify?: boolean; retry?: () => Promise<boolean>},
    ) => Promise<void>
    isConnectionPooled: (connectionId: string) => boolean
    connectConnection: (
        connectionId: string,
        options?: {notify?: boolean},
    ) => Promise<boolean>
    /** Late-bound: favorites UI lives in store facade. */
    toggleFavoritesGroupExpanded: () => void
    /** Late-bound: semantic index lives in store facade. */
    invalidateSemanticMetrics: (connectionId?: string) => void
}

export function createExplorerLazyLoadDomain(deps: ExplorerLazyLoadDomainDeps) {
    const loadingNodeIds = ref<Set<string>>(new Set())
    const loadChildPromises = new Map<string, Promise<boolean>>()
    const childEtags = new Map<string, string>()

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
        const node = deps.findNode(nodeId)
        const startedAt = perfNow()
        const etagKey = `${connectionId}:${nodeId}`
        const connectionDbType = resolveConnectionDbType(deps.tree.value, nodeId)
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
            const latest = deps.findNode(nodeId)
            if (result.unchanged) {
                if (result.etag) {
                    childEtags.set(etagKey, result.etag)
                }
                if (latest) markExplorerFolderLoadedIfNeeded(latest)
                deps.markConnectionPooled(connectionId)
                return true
            }
            if (latest) {
                if (options?.append) {
                    appendTablePageChildren(latest, result.tree)
                    deps.rebuildNodeIndex({parent: latest, loadedNodes: result.tree})
                } else {
                    const previousChildren = latest.children?.length ? [...latest.children] : undefined
                    mergeLoadedChildren(latest, result.tree)
                    if (latest.type === 'connection') {
                        migrateExplorerTreeAiStructure(deps.tree.value)
                        deps.rebuildNodeIndex({mode: 'full'})
                    } else {
                        if (latest.type === 'database' || latest.type === 'schema') {
                            ensureAiFolderInScopeChildren(latest, connectionId)
                        }
                        deps.rebuildNodeIndex({parent: latest, previousChildren})
                    }
                }
                markExplorerFolderLoadedIfNeeded(latest)
            }
            logPerf(resolveExplorerLoadPerfOperation(connectionId, nodeId, latest), startedAt, {
                connectionId,
                nodeId,
                childCount: result.tree.length,
            })
            deps.markConnectionPooled(connectionId)
            return true
        } catch (error) {
            if (nodeId === connectionId) {
                void deps.reportConnectionFailure(connectionId, error, {notify})
                return false
            }
            if (!isExplorerNodeNotFoundError(error)) {
                return false
            }
            // 后端 schema 缓存与前端节点 id 不同步：先重载连接层再重试一次
            try {
                const failedNode = deps.findNode(nodeId)
                const failedLabel = failedNode?.label
                const failedType = failedNode?.type
                const parentBefore = failedNode ? findParentNode(deps.tree.value, nodeId) : null
                const parentLabel = parentBefore?.label
                const parentType = parentBefore?.type

                childEtags.delete(etagKey)
                const databases = await explorerApi.loadChildren(connectionId, connectionId, {
                    ...silent,
                    refresh: true,
                })
                const connection = deps.findNode(connectionId)
                if (connection) {
                    const previousChildren = connection.children?.length ? [...connection.children] : undefined
                    mergeLoadedChildren(connection, databases.tree)
                    deps.rebuildNodeIndex({parent: connection, previousChildren})
                }

                let retryNodeId = nodeId
                if (!deps.findNode(nodeId) && parentLabel && parentType && failedLabel && failedType) {
                    let refreshedParentId: string | null = null
                    walkTree(deps.tree.value, (n) => {
                        if (
                            n.type === parentType
                            && n.label === parentLabel
                            && resolveConnectionId(deps.tree.value, n.id) === connectionId
                        ) {
                            refreshedParentId = n.id
                            return true
                        }
                    })
                    if (refreshedParentId) {
                        await loadNodeChildren(connectionId, refreshedParentId, {notify: false})
                        const refreshedParent = deps.findNode(refreshedParentId)
                        const refreshedTarget = refreshedParent?.children?.find(
                            (child) => child.type === failedType && child.label === failedLabel,
                        )
                        if (refreshedTarget) {
                            retryNodeId = refreshedTarget.id
                        }
                    }
                }

                const children = await explorerApi.loadChildren(connectionId, retryNodeId, silent)
                const latest = deps.findNode(retryNodeId)
                if (latest) {
                    const previousChildren = latest.children?.length ? [...latest.children] : undefined
                    mergeLoadedChildren(latest, children.tree)
                    markExplorerFolderLoadedIfNeeded(latest)
                    deps.rebuildNodeIndex({parent: latest, previousChildren})
                }
                if (children.etag) {
                    childEtags.set(`${connectionId}:${retryNodeId}`, children.etag)
                }
                deps.markConnectionPooled(connectionId)
                return Boolean(latest)
            } catch (retryError) {
                void deps.reportConnectionFailure(connectionId, retryError, {notify})
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
        const connectionId = resolveConnectionId(deps.tree.value, folderId)
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
        const node = deps.findNode(nodeId)
        if (!node) return

        if (node.type === 'project-docs' || node.type === 'project-scripts') {
            if (node.meta === 'loaded') return
            loadingNodeIds.value.add(nodeId)
            try {
                const children = await loadProjectFilesChildren(node)
                const previousChildren = node.children?.length ? [...node.children] : undefined
                node.children = children
                node.meta = 'loaded'
                deps.rebuildNodeIndex({parent: node, previousChildren, loadedNodes: children})
            } catch {
                node.children = []
                node.meta = 'loaded'
                deps.touchTree()
            } finally {
                loadingNodeIds.value.delete(nodeId)
            }
            return
        }

        const connectionId = resolveConnectionId(deps.tree.value, nodeId)
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
                deps.touchTree()
            } catch {
                node.children = []
                node.meta = 'loaded'
                deps.touchTree()
            } finally {
                loadingNodeIds.value.delete(nodeId)
            }
            return
        }

        if (!needsLazyLoad(node, resolveConnectionDbType(deps.tree.value, nodeId))) {
            if (shouldAffirmConnectionHealthForCachedChildren(node, connectionId, nodeId, notify)) {
                deps.markConnectionAttempted(connectionId)
                deps.setConnectionHealth(connectionId, 'ok')
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
                deps.markConnectionAttempted(connectionId)
            }
            const ok = await loadNodeChildren(connectionId, nodeId, {notify})
            if (isConnectionProbe && notify) {
                deps.setConnectionHealth(connectionId, ok ? 'ok' : 'error')
                if (ok) deps.markConnectionPooled(connectionId)
            }
        } finally {
            loadingNodeIds.value.delete(nodeId)
        }
    }

    /** 加载子级并展开（expanded 仅表示 UI 状态，不表示已加载） */
    async function expandAndLoad(nodeId: string, options?: {load?: boolean; notify?: boolean}) {
        const node = deps.findNode(nodeId)
        if (!node) return
        await ensureFlatConnectionFeatureChildren(node)
        if (options?.load !== false) {
            await ensureChildrenLoaded(nodeId, {notify: options?.notify})
        }
        node.expanded = true
        deps.touchTree()
    }

    function isRootTreeNode(nodeId: string) {
        return deps.tree.value.some((root) => root.id === nodeId)
    }

    /** 按 app-config 恢复根分组展开；不写回配置（仅手动展开/收起才落盘）。 */
    function restoreExpandedNodes(ids: string[]) {
        applyFirstLevelExpandedNodeIds(deps.tree.value, ids ?? [])
        deps.touchTree()
    }

    /** 从根到目标：逐层 load + expand，避免 expandToNode 只改 UI 标志导致空节点 */
    async function expandPathToNode(nodeId: string, options?: {notify?: boolean}) {
        const chain: TreeNode[] = []
        walkTree(deps.tree.value, (node, parents) => {
            if (node.id === nodeId) {
                chain.push(...parents, node)
                return true
            }
        })
        const segments: TreeNode[][] = []
        let currentSegment: TreeNode[] = []
        let currentConnectionId: string | null = null
        for (const item of chain) {
            const connectionId = resolveConnectionId(deps.tree.value, item.id) ?? ''
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
                const node = deps.findNode(item.id)
                if (!node) continue
                await ensureFlatConnectionFeatureChildren(node)
                const connectionId = resolveConnectionId(deps.tree.value, item.id) ?? ''
                const notify = options?.notify === true && item.type === 'connection'
                const dbType = resolveConnectionDbType(deps.tree.value, item.id)
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
                    deps.markConnectionAttempted(connectionId)
                    deps.setConnectionHealth(connectionId, 'ok')
                }
                node.expanded = true
            }
            for (const load of pendingLoads) {
                await ensureChildrenLoaded(load.nodeId, {notify: load.notify})
                const loaded = deps.findNode(load.nodeId)
                if (loaded) loaded.expanded = true
            }
        })
        deps.touchTree()
    }

    function collapseNode(nodeId: string) {
        const node = deps.findNode(nodeId)
        if (node) {
            node.expanded = false
            deps.touchTree()
            if (isRootTreeNode(nodeId)) {
                persistFirstLevelExpandedSoon()
            }
        }
    }

    /** 根分组手动展开/收起后写入 app-config。 */
    function persistFirstLevelExpandedSoon() {
        void import('@/features/layout/stores/app-config-store').then(({useAppConfigStore}) => {
            useAppConfigStore().persistExplorerExpandedSoon()
        })
    }

    async function toggleExpand(nodeId: string, options?: {notify?: boolean}) {
        if (isExplorerFavoritesGroupId(nodeId)) {
            deps.toggleFavoritesGroupExpanded()
            return
        }
        const node = deps.findNode(nodeId)
        if (!node) return

        if (node.type === 'load_more') {
            await loadMoreTables(node)
            return
        }

        const dbType = resolveConnectionDbType(deps.tree.value, nodeId)
        if (shouldCollapseOnToggle(node, dbType)) {
            collapseNode(nodeId)
            return
        }
        const notify = options?.notify ?? node.type === 'connection'
        if (node.type === 'connection' && notify && !deps.isConnectionPooled(nodeId)) {
            await deps.connectConnection(nodeId, {notify})
            return
        }
        await expandAndLoad(nodeId, {notify})
        if (isRootTreeNode(nodeId)) {
            persistFirstLevelExpandedSoon()
        }
    }

    function findDatabaseNode(connectionId: string, instanceLabel: string, instanceId?: string | null): TreeNode | null {
        const connection = deps.findNode(connectionId)
        const dbType = resolveConnectionDbType(deps.tree.value, connectionId) ?? connection?.dbType

        if (instanceId) {
            const byId = deps.findNode(instanceId)
            if (byId && (byId.type === 'database' || byId.type === 'schema')) {
                const parentConnectionId = resolveConnectionId(deps.tree.value, byId.id)
                if (parentConnectionId === connectionId) {
                    return byId
                }
            }
        }

        if (connection && isCatalogSchemaDbType(dbType) && instanceLabel.includes('.')) {
            return findExplorerScopeNode(connection, dbType, instanceLabel)
        }

        let found: TreeNode | null = null
        walkTree(deps.tree.value, (node, parents) => {
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
            deps.rebuildNodeIndex({parent: node, previousChildren})
            return result.tree
        } finally {
            loadingNodeIds.value.delete(node.id)
        }
    }

    async function reloadConnectionCatalog(connectionId: string) {
        const node = deps.findNode(connectionId)
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
        deps.touchTree()
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
        deps.touchTree()
    }

    async function reloadWorkspacesFolder(
        connectionId: string,
        instanceLabel: string,
        instanceId?: string | null,
    ) {
        const connectionNode = deps.findNode(connectionId)
        if (connectionNode && !connectionNode.children?.length) {
            await forceLoadChildren(connectionId, connectionNode)
            connectionNode.expanded = true
            deps.touchTree()
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
        deps.touchTree()
        await expandPathToNode(folder.id)
    }

    async function reloadModelsFolder(
        connectionId: string,
        instanceLabel: string,
        instanceId?: string | null,
    ) {
        const connectionNode = deps.findNode(connectionId)
        if (connectionNode && !connectionNode.children?.length) {
            await forceLoadChildren(connectionId, connectionNode)
            connectionNode.expanded = true
            deps.touchTree()
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
        deps.touchTree()
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

    function resetConnectionTreeState(connectionId: string) {
        const node = deps.findNode(connectionId)
        if (!node || node.type !== 'connection') return
        const previousChildren = node.children?.length ? [...node.children] : undefined
        node.children = undefined
        node.expanded = false
        deps.rebuildNodeIndex({parent: node, previousChildren})
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
        deps.invalidateSemanticMetrics(connectionId)
    }

    async function reloadRedisKeys(connectionId: string, pattern?: string) {
        const connection = deps.findNode(connectionId)
        if (!connection || connection.dbType !== 'redis') return
        deps.markConnectionAttempted(connectionId)
        loadingNodeIds.value.add(connectionId)
        try {
            const result = await explorerApi.loadChildren(connectionId, connectionId, {pattern, refresh: true})
            const previousChildren = connection.children?.length ? [...connection.children] : undefined
            mergeLoadedChildren(connection, result.tree)
            deps.rebuildNodeIndex({parent: connection, previousChildren})
            connection.expanded = true
            deps.touchTree()
            deps.setConnectionHealth(connectionId, 'ok')
        } finally {
            loadingNodeIds.value.delete(connectionId)
        }
    }

    return {
        loadingNodeIds,
        loadChildPromises,
        childEtags,
        loadNodeChildren,
        loadMoreTables,
        ensureChildrenLoaded,
        expandAndLoad,
        restoreExpandedNodes,
        expandPathToNode,
        collapseNode,
        toggleExpand,
        findDatabaseNode,
        forceLoadChildren,
        reloadConnectionCatalog,
        reloadTablesFolder,
        reloadWorkspacesFolder,
        reloadModelsFolder,
        reloadViewsFolder,
        resetConnectionTreeState,
        reloadRedisKeys,
    }
}

export type ExplorerLazyLoadDomain = ReturnType<typeof createExplorerLazyLoadDomain>
