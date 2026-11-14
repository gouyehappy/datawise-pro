import {describe, expect, it, vi} from 'vitest'
import {shallowRef} from 'vue'
import type {TreeNode} from '@/core/types'
import {createExplorerLazyLoadDomain} from '@/features/explorer/stores/explorer-lazy-load.domain'

vi.mock('@/api', () => ({
    explorerApi: {
        loadChildren: vi.fn(),
    },
}))

vi.mock('@/features/explorer/services/flat-connection-feature-tree.service', () => ({
    ensureFlatConnectionFeatureChildren: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/features/explorer/services/ssh-feature-tree.service', () => ({
    refreshSshScriptRecordChildren: vi.fn(),
}))

vi.mock('@/features/project/services/project-explorer-files', () => ({
    loadProjectFilesChildren: vi.fn(),
}))

describe('createExplorerLazyLoadDomain', () => {
    function makeConn(id: string, children?: TreeNode[]): TreeNode {
        return {id, label: id, type: 'connection', dbType: 'mysql', children, expanded: true}
    }

    function makeDeps(overrides: Partial<Parameters<typeof createExplorerLazyLoadDomain>[0]> = {}) {
        const tree = shallowRef<TreeNode[]>([makeConn('c1', [{id: 'db1', label: 'db1', type: 'database'}])])
        const nodes = new Map<string, TreeNode>()
        const index = (list: TreeNode[]) => {
            for (const n of list) {
                nodes.set(n.id, n)
                if (n.children) index(n.children)
            }
        }
        index(tree.value)

        return {
            tree,
            findNode: (id: string) => nodes.get(id) ?? null,
            touchTree: vi.fn(),
            rebuildNodeIndex: vi.fn(),
            markConnectionPooled: vi.fn(),
            markConnectionAttempted: vi.fn(),
            setConnectionHealth: vi.fn(),
            reportConnectionFailure: vi.fn(),
            isConnectionPooled: vi.fn().mockReturnValue(false),
            connectConnection: vi.fn().mockResolvedValue(true),
            toggleFavoritesGroupExpanded: vi.fn(),
            invalidateSemanticMetrics: vi.fn(),
            ...overrides,
        }
    }

    it('expandAndLoad marks node expanded and touches tree', async () => {
        const deps = makeDeps()
        const domain = createExplorerLazyLoadDomain(deps)
        // Skip lazy load path: children already present / not needing load
        const node = deps.findNode('c1')!
        node.children = [{id: 'db1', label: 'db1', type: 'database'}]
        node.meta = 'loaded'

        await domain.expandAndLoad('c1', {load: false})
        expect(node.expanded).toBe(true)
        expect(deps.touchTree).toHaveBeenCalled()
    })

    it('resetConnectionTreeState clears children, etags, and semantic metrics', () => {
        const deps = makeDeps()
        const domain = createExplorerLazyLoadDomain(deps)
        const node = deps.findNode('c1')!
        node.children = [{id: 'db1', label: 'db1', type: 'database'}]
        node.expanded = true

        // Seed etag/promise maps via private Maps on domain return
        domain.childEtags.set('c1:c1', 'etag-1')
        domain.childEtags.set('other:x', 'keep')

        domain.resetConnectionTreeState('c1')

        expect(node.children).toBeUndefined()
        expect(node.expanded).toBe(false)
        expect(domain.childEtags.has('c1:c1')).toBe(false)
        expect(domain.childEtags.has('other:x')).toBe(true)
        expect(deps.rebuildNodeIndex).toHaveBeenCalled()
        expect(deps.invalidateSemanticMetrics).toHaveBeenCalledWith('c1')
    })

    it('findDatabaseNode matches by connection + label', () => {
        const deps = makeDeps()
        const domain = createExplorerLazyLoadDomain(deps)
        expect(domain.findDatabaseNode('c1', 'db1')?.id).toBe('db1')
        expect(domain.findDatabaseNode('c1', 'missing')).toBeNull()
    })

    it('collapseNode sets expanded false', () => {
        const deps = makeDeps()
        const domain = createExplorerLazyLoadDomain(deps)
        const node = deps.findNode('c1')!
        node.expanded = true
        domain.collapseNode('c1')
        expect(node.expanded).toBe(false)
        expect(deps.touchTree).toHaveBeenCalled()
    })
})
