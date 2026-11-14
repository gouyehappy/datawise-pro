import {describe, expect, it, vi} from 'vitest'
import {ref, shallowRef} from 'vue'
import type {TreeNode} from '@/core/types'
import {createExplorerCatalogDomain} from '@/features/explorer/stores/explorer-catalog.domain'

vi.mock('@/api', () => ({
    explorerApi: {
        fetchTree: vi.fn(),
        createGroup: vi.fn(),
        updateGroup: vi.fn(),
        createConnection: vi.fn(),
        updateConnection: vi.fn(),
        moveConnection: vi.fn(),
        reorderCatalogNode: vi.fn(),
        deleteNode: vi.fn(),
        importConnections: vi.fn(),
    },
}))

vi.mock('@/features/project/services/project-explorer-files', () => ({
    injectProjectFileRoots: (roots: TreeNode[]) => roots,
}))

vi.mock('@/features/explorer/services/explorer-ui-catalog.service', () => ({
    ensureExplorerUiCatalogLoaded: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/shared/config/connections-explorer-tree', () => ({
    applyExplorerTreeStructure: (roots: TreeNode[]) => roots,
}))

vi.mock('@/features/explorer/utils/tree-session', () => ({
    applyExpandedNodeIds: vi.fn(),
    collectExpandedNodeIds: () => [],
    collectFirstLevelExpandedNodeIds: () => [],
}))

vi.mock('@/features/explorer/services/explorer-lazy-load', () => ({
    pruneConnectionHealthByIds: (
        health: Record<string, 'ok' | 'error'>,
        validIds: readonly string[],
    ) => {
        const valid = new Set(validIds)
        return Object.fromEntries(Object.entries(health).filter(([id]) => valid.has(id)))
    },
}))

vi.mock('@/features/explorer/services/pinned-table-favorites.service', () => ({
    backfillPinnedTableMetadata: vi.fn(),
}))

vi.mock('@/features/explorer/services/explorer-pinned-sort.service', () => ({
    applyPinnedSortInTree: vi.fn(),
}))

vi.mock('@/features/explorer/services/explorer-ai-tree.service', () => ({
    migrateExplorerTreeAiStructure: vi.fn(),
}))

vi.mock('@/features/ai/tag/services/ai-table-tag.events', () => ({
    notifyAiTableTagsChanged: vi.fn(),
}))

describe('createExplorerCatalogDomain', () => {
    function makeRoot(id: string, children: TreeNode[] = []): TreeNode {
        return {id, label: id, type: 'group', children}
    }

    function makeConn(id: string): TreeNode {
        return {id, label: id, type: 'connection', dbType: 'mysql'}
    }

    it('commitExplorerTree prunes health and attempted connections', () => {
        const tree = shallowRef<TreeNode[]>([makeRoot('g1', [makeConn('c1'), makeConn('c2')])])
        const connectionHealthById = ref<Record<string, 'ok' | 'error'>>({
            c1: 'ok',
            c2: 'error',
            gone: 'ok',
        })
        const pruneAttemptedConnections = vi.fn()
        const rebuildNodeIndex = vi.fn()

        const domain = createExplorerCatalogDomain({
            tree,
            treeReady: ref(false),
            isRefreshing: ref(false),
            selectedNodeId: ref<string | null>(null),
            connectionHealthById,
            pruneAttemptedConnections,
            rebuildNodeIndex,
            findNode: () => null,
            selectNode: vi.fn(),
            expandToNode: vi.fn(),
            restoreExpandedNodes: vi.fn(),
            clearFlash: vi.fn(),
            revealNode: vi.fn(),
            expandPathToNode: vi.fn(),
            toggleExpand: vi.fn(),
        })

        domain.commitExplorerTree([makeRoot('g1', [makeConn('c1')])])

        expect(connectionHealthById.value).toEqual({c1: 'ok'})
        expect(pruneAttemptedConnections).toHaveBeenCalledWith(['c1'])
        expect(rebuildNodeIndex).toHaveBeenCalledWith({mode: 'full'})
    })

    it('deleteNode clears selection when deleted node was selected', async () => {
        const {explorerApi} = await import('@/api')
        const tree = shallowRef<TreeNode[]>([makeRoot('g1', [makeConn('c1')])])
        vi.mocked(explorerApi.deleteNode).mockResolvedValue([makeRoot('g1')] as never)

        const selectedNodeId = ref<string | null>('c1')
        const domain = createExplorerCatalogDomain({
            tree,
            treeReady: ref(true),
            isRefreshing: ref(false),
            selectedNodeId,
            connectionHealthById: ref({}),
            pruneAttemptedConnections: vi.fn(),
            rebuildNodeIndex: vi.fn(),
            findNode: () => null,
            selectNode: vi.fn(),
            expandToNode: vi.fn(),
            restoreExpandedNodes: vi.fn(),
            clearFlash: vi.fn(),
            revealNode: vi.fn(),
            expandPathToNode: vi.fn(),
            toggleExpand: vi.fn(),
        })

        await domain.deleteNode('c1')
        expect(selectedNodeId.value).toBe('g1')
    })
})
