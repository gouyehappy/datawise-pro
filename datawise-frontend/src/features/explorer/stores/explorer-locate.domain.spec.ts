import {describe, expect, it, vi} from 'vitest'
import {ref, shallowRef} from 'vue'
import type {TreeNode} from '@/core/types'
import {createExplorerLocateDomain} from '@/features/explorer/stores/explorer-locate.domain'

vi.mock('@/core/shortcuts/action-registry', () => ({
    scrollExplorerNodeIntoView: vi.fn(),
}))

describe('createExplorerLocateDomain', () => {
    function makeNode(id: string, type: TreeNode['type'] = 'table'): TreeNode {
        return {id, label: id, type}
    }

    it('triggerFlash / clearFlash own flashNodeId timer state', async () => {
        vi.useFakeTimers()
        const nodes = new Map<string, TreeNode>([['t1', makeNode('t1')]])
        const domain = createExplorerLocateDomain({
            tree: shallowRef([]),
            searchQuery: ref(''),
            selectedNodeId: ref<string | null>(null),
            findNode: (id) => nodes.get(id) ?? null,
            selectNode: vi.fn(),
            touchTree: vi.fn(),
            findDatabaseNode: () => null,
            ensureChildrenLoaded: vi.fn(),
            expandPathToNode: vi.fn().mockResolvedValue(undefined),
            reloadWorkspacesFolder: vi.fn(),
        })

        domain.triggerFlash('t1')
        expect(domain.flashNodeId.value).toBe('t1')
        vi.advanceTimersByTime(700)
        expect(domain.flashNodeId.value).toBeNull()

        domain.triggerFlash('t1')
        domain.clearFlash()
        expect(domain.flashNodeId.value).toBeNull()
        vi.useRealTimers()
    })

    it('revealNode expands path, selects, and flashes when selection changes', async () => {
        const nodes = new Map<string, TreeNode>([['t1', makeNode('t1')]])
        const selectedNodeId = ref<string | null>(null)
        const selectNode = vi.fn((id: string) => {
            selectedNodeId.value = id
        })
        const expandPathToNode = vi.fn().mockResolvedValue(undefined)
        const searchQuery = ref('filter')

        const domain = createExplorerLocateDomain({
            tree: shallowRef([]),
            searchQuery,
            selectedNodeId,
            findNode: (id) => nodes.get(id) ?? null,
            selectNode,
            touchTree: vi.fn(),
            findDatabaseNode: () => null,
            ensureChildrenLoaded: vi.fn(),
            expandPathToNode,
            reloadWorkspacesFolder: vi.fn(),
        })

        const result = await domain.revealNode('t1', {select: true})
        expect(result?.id).toBe('t1')
        expect(searchQuery.value).toBe('')
        expect(expandPathToNode).toHaveBeenCalledWith('t1')
        expect(selectNode).toHaveBeenCalledWith('t1')
        expect(domain.flashNodeId.value).toBe('t1')
    })

    it('findTableNodeId walks tree by label', () => {
        const tree = shallowRef<TreeNode[]>([
            {
                id: 'c1',
                label: 'c1',
                type: 'connection',
                children: [{id: 'tbl-users', label: 'users', type: 'table'}],
            },
        ])
        const domain = createExplorerLocateDomain({
            tree,
            searchQuery: ref(''),
            selectedNodeId: ref(null),
            findNode: () => null,
            selectNode: vi.fn(),
            touchTree: vi.fn(),
            findDatabaseNode: () => null,
            ensureChildrenLoaded: vi.fn(),
            expandPathToNode: vi.fn(),
            reloadWorkspacesFolder: vi.fn(),
        })
        expect(domain.findTableNodeId('users')).toBe('tbl-users')
        expect(domain.findTableNodeId('missing')).toBeNull()
    })
})
