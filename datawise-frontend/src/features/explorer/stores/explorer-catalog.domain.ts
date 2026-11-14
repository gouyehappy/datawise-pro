/**
 * Explorer catalog CRUD / tree commit domain (FE-P0-3 store).
 * Factory over shared store refs — `useExplorerStore` remains the public facade.
 */
import type {Ref, ShallowRef} from 'vue'
import type {ConnectionConfig, TreeNode} from '@/core/types'
import {explorerApi} from '@/api'
import {injectProjectFileRoots} from '@/features/project/services/project-explorer-files'
import {ensureExplorerUiCatalogLoaded} from '@/features/explorer/services/explorer-ui-catalog.service'
import {applyExplorerTreeStructure} from '@/shared/config/connections-explorer-tree'
import {
    applyExpandedNodeIds,
    collectExpandedNodeIds,
    collectFirstLevelExpandedNodeIds,
} from '@/features/explorer/utils/tree-session'
import {pruneConnectionHealthByIds} from '@/features/explorer/services/explorer-lazy-load'
import {backfillPinnedTableMetadata} from '@/features/explorer/services/pinned-table-favorites.service'
import {applyPinnedSortInTree} from '@/features/explorer/services/explorer-pinned-sort.service'
import {migrateExplorerTreeAiStructure} from '@/features/explorer/services/explorer-ai-tree.service'
import {notifyAiTableTagsChanged} from '@/features/ai/tag/services/ai-table-tag.events'
import {walkTree} from '@/core/utils/tree'

export type ExplorerCatalogDomainDeps = {
    tree: ShallowRef<TreeNode[]>
    treeReady: Ref<boolean>
    isRefreshing: Ref<boolean>
    selectedNodeId: Ref<string | null>
    connectionHealthById: Ref<Record<string, 'ok' | 'error'>>
    pruneAttemptedConnections: (validIds: readonly string[]) => void
    rebuildNodeIndex: (options?: {mode?: 'full'}) => void
    findNode: (nodeId: string) => TreeNode | null
    selectNode: (nodeId: string) => void
    expandToNode: (nodeId: string) => void
    /** Late-bound: restore lives in lazy-load domain. */
    restoreExpandedNodes: (ids: string[]) => void
    /** Late-bound: reveal/flash lives in locate domain. */
    clearFlash: () => void
    revealNode: (nodeId: string, options?: {select?: boolean}) => Promise<TreeNode | null>
    /** Late-bound: expand path / toggle live in lazy-load domain. */
    expandPathToNode: (nodeId: string, options?: {notify?: boolean}) => Promise<void>
    toggleExpand: (nodeId: string, options?: {notify?: boolean}) => Promise<void>
}

export function createExplorerCatalogDomain(deps: ExplorerCatalogDomainDeps) {
    function collectConnectionIdsFromTree(): string[] {
        const ids: string[] = []
        walkTree(deps.tree.value, (node) => {
            if (node.type === 'connection') ids.push(node.id)
        })
        return ids
    }

    function commitExplorerTree(
        nextRoots: TreeNode[],
        options?: {preserveSessionState?: boolean},
    ) {
        const preserve = options?.preserveSessionState !== false
        const expandedIds = preserve ? collectExpandedNodeIds(deps.tree.value) : []
        const previousTree = preserve ? deps.tree.value : []
        const roots = injectProjectFileRoots(nextRoots)
        deps.tree.value = applyExplorerTreeStructure(roots, previousTree)
        // 会话内展开态以本地为准；服务端 group.expanded 不参与 UI。
        // 切项目时不保留旧树展开 / 已加载 schema，避免「换了项目看起来还是原样」。
        if (preserve && expandedIds.length) {
            applyExpandedNodeIds(deps.tree.value, expandedIds)
        }
        migrateExplorerTreeAiStructure(deps.tree.value)
        deps.rebuildNodeIndex({mode: 'full'})
        backfillPinnedTableMetadata(deps.tree.value)
        applyPinnedSortInTree(deps.tree.value)
        const validConnectionIds = collectConnectionIdsFromTree()
        deps.connectionHealthById.value = pruneConnectionHealthByIds(
            deps.connectionHealthById.value,
            validConnectionIds,
        )
        deps.pruneAttemptedConnections(validConnectionIds)
    }

    async function reloadExplorerTree(
        refresh = false,
        options?: {preserveSessionState?: boolean},
    ) {
        const nextRoots = await explorerApi.fetchTree(refresh ? {refresh: true} : undefined)
        commitExplorerTree(nextRoots, options)
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
            const nodes = deps.tree.value
            if (!deps.selectedNodeId.value) {
                deps.selectedNodeId.value = nodes[0]?.children?.[0]?.id ?? nodes[0]?.id ?? null
            }
            deps.restoreExpandedNodes(options?.restoreExpandedIds ?? [])
        } finally {
            deps.treeReady.value = true
        }
    }

    async function refreshTree(options?: {mode?: 'soft' | 'project-switch'}) {
        const mode = options?.mode ?? 'soft'
        if (deps.isRefreshing.value) {
            // 普通刷新可跳过；切项目必须等到当前刷新结束再强制重载，否则会 silently no-op。
            if (mode === 'soft') return
            const started = Date.now()
            while (deps.isRefreshing.value && Date.now() - started < 8000) {
                await new Promise<void>((resolve) => setTimeout(resolve, 16))
            }
            if (deps.isRefreshing.value) return
        }
        deps.isRefreshing.value = true
        try {
            await ensureExplorerUiCatalogLoaded({force: true})
            if (mode === 'project-switch') {
                deps.selectedNodeId.value = null
                await reloadExplorerTree(true, {preserveSessionState: false})
                return
            }
            const expandedIds = collectFirstLevelExpandedNodeIds(deps.tree.value)
            await reloadExplorerTree(true)
            deps.restoreExpandedNodes(expandedIds)
        } finally {
            deps.isRefreshing.value = false
        }
    }

    async function addRootFolder(label: string) {
        const {groupId} = await afterExplorerMutation(() => explorerApi.createGroup(label))
        deps.clearFlash()
        await deps.revealNode(groupId, {select: true})
        return groupId
    }

    async function addGroup(label: string, parentId: string) {
        const {groupId} = await afterExplorerMutation(() => explorerApi.createGroup(label, parentId))
        deps.clearFlash()
        await deps.expandPathToNode(parentId)
        await deps.revealNode(groupId, {select: true})
        return groupId
    }

    async function renameGroup(groupId: string, label: string) {
        await afterExplorerTreeUpdate(() => explorerApi.updateGroup(groupId, label))
        deps.selectNode(groupId)
        deps.expandToNode(groupId)
    }

    async function addConnection(config: ConnectionConfig, groupId?: string) {
        const {connectionId} = await afterExplorerMutation(() =>
            explorerApi.createConnection(config, groupId),
        )
        void import('@/features/workspace/services/welcome-recent-connections.service')
            .then(({touchAddedConnection}) => touchAddedConnection(connectionId))
            .catch(() => undefined)
        deps.selectNode(connectionId)
        deps.expandToNode(connectionId)
        const connection = deps.findNode(connectionId)
        if (connection && !connection.expanded) {
            await deps.toggleExpand(connectionId)
        }
        return connectionId
    }

    async function updateConnection(connectionId: string, config: ConnectionConfig) {
        await afterExplorerTreeUpdate(() => explorerApi.updateConnection(connectionId, config))
    }

    async function moveConnection(connectionId: string, targetGroupId: string) {
        await afterExplorerTreeUpdate(() => explorerApi.moveConnection(connectionId, targetGroupId))
        deps.selectNode(connectionId)
        deps.expandToNode(targetGroupId)
        deps.expandToNode(connectionId)
    }

    async function reorderCatalogNode(
        nodeId: string,
        targetId: string,
        position: 'before' | 'after' | 'inside',
    ) {
        await afterExplorerTreeUpdate(() =>
            explorerApi.reorderCatalogNode(nodeId, targetId, position),
        )
        deps.selectNode(nodeId)
        deps.expandToNode(nodeId)
        if (position === 'inside') {
            deps.expandToNode(targetId)
        }
    }

    async function deleteNode(nodeId: string) {
        await afterExplorerTreeUpdate(() => explorerApi.deleteNode(nodeId))
        if (deps.selectedNodeId.value === nodeId) {
            deps.selectedNodeId.value = deps.tree.value[0]?.id ?? null
        }
        // AI table tags are cascaded server-side; refresh any open Agent scope panels.
        notifyAiTableTagsChanged()
    }

    async function importConnections(configs: ConnectionConfig[]) {
        const {count} = await afterExplorerMutation(() => explorerApi.importConnections(configs))
        return count
    }

    return {
        collectConnectionIdsFromTree,
        commitExplorerTree,
        reloadExplorerTree,
        afterExplorerMutation,
        afterExplorerTreeUpdate,
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
    }
}

export type ExplorerCatalogDomain = ReturnType<typeof createExplorerCatalogDomain>
