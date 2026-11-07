import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import type {TreeNode} from '@/core/types'
import {buildTreeNodeIndex, flattenVisibleTree, mergeTreeNodeIndex, pruneTreeNodeIndexSubtree} from '@/core/utils/tree'
import {
    EXPLORER_TREE_VIRTUAL_THRESHOLD,
    resolveLastFlatNodeIndex,
} from '@/features/explorer/composables/useTreeVirtualWindow'

function node(id: string, children?: TreeNode[]): TreeNode {
    return {id, label: id, type: 'database', children, expanded: true}
}

describe('explorer-tree-perf', () => {
    it('buildTreeNodeIndex maps every node id', () => {
        const tree = [
            node('conn', [
                node('db', [node('tbl')]),
            ]),
        ]
        const index = buildTreeNodeIndex(tree)
        assert.equal(index.get('conn')?.label, 'conn')
        assert.equal(index.get('db')?.label, 'db')
        assert.equal(index.get('tbl')?.label, 'tbl')
        assert.equal(index.size, 3)
    })

    it('resolveLastFlatNodeIndex highlights the last duplicate id', () => {
        const flat = flattenVisibleTree([
            node('dup'),
            node('other', [node('dup')]),
        ])
        assert.equal(resolveLastFlatNodeIndex(flat, 'dup'), flat.length - 1)
        assert.equal(resolveLastFlatNodeIndex(flat, 'missing'), -1)
    })

    it('incremental node index replaces subtree without full walk', () => {
        const parent = node('parent', [node('old-child')])
        const tree = [parent]
        const index = buildTreeNodeIndex(tree)
        assert.equal(index.size, 2)

        const previousChildren = parent.children ? [...parent.children] : []
        parent.children = [node('new-child', [node('grand')])]
        const next = new Map(index)
        next.set(parent.id, parent)
        pruneTreeNodeIndexSubtree(next, previousChildren)
        mergeTreeNodeIndex(next, parent.children ?? [])

        assert.equal(next.has('old-child'), false)
        assert.equal(next.get('new-child')?.label, 'new-child')
        assert.equal(next.get('grand')?.label, 'grand')
        assert.equal(next.size, 3)
    })

    it('virtual threshold keeps medium trees on virtual scroll', () => {
        assert.ok(EXPLORER_TREE_VIRTUAL_THRESHOLD >= 50)
        assert.ok(EXPLORER_TREE_VIRTUAL_THRESHOLD <= 120)
    })
})
