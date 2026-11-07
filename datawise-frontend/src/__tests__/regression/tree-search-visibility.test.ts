import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import type {TreeNode} from '@/core/types'
import {collectSearchTreeVisibility, flattenVisibleTree} from '@/core/utils/tree'

function node(
    id: string,
    label: string,
    children?: TreeNode[],
    expanded = false,
): TreeNode {
    return {id, label, type: 'database', children, expanded}
}

describe('tree-search-visibility', () => {
    it('collectSearchTreeVisibility keeps ancestor paths without cloning nodes', () => {
        const leaf = node('tbl', 'orders')
        const folder = node('tables', 'tables', [leaf])
        const schema = node('schema', 'public', [folder])
        const tree = [node('conn', 'local', [schema])]

        const visibility = collectSearchTreeVisibility(tree, 'orders')
        assert.ok(visibility)
        assert.equal(visibility.visibleIds.has('tbl'), true)
        assert.equal(visibility.visibleIds.has('tables'), true)
        assert.equal(visibility.visibleIds.has('schema'), true)
        assert.equal(visibility.visibleIds.has('conn'), true)
        assert.equal(visibility.forceExpandIds.has('conn'), true)
    })

    it('flattenVisibleTree honors search visibility overlay', () => {
        const leaf = node('tbl', 'orders')
        const folder = node('tables', 'tables', [leaf])
        const other = node('other', 'misc', [node('x', 'hidden')])
        const tree = [node('conn', 'local', [folder, other])]
        const visibility = collectSearchTreeVisibility(tree, 'orders')
        assert.ok(visibility)

        const flat = flattenVisibleTree(tree, 0, visibility)
        const labels = flat.map((entry) => entry.node.label)
        assert.deepEqual(labels, ['local', 'tables', 'orders'])
    })

    it('collectSearchTreeVisibility excludes non-matching siblings', () => {
        const match = node('db-a', 'orders_db', [node('tbl', 'orders')])
        const other = node('db-b', 'inventory', [node('tbl2', 'stock')])
        const tree = [node('conn', 'local', [match, other])]

        const visibility = collectSearchTreeVisibility(tree, 'orders')
        assert.ok(visibility)
        assert.equal(visibility.visibleIds.has('db-a'), true)
        assert.equal(visibility.visibleIds.has('db-b'), false)
        assert.equal(visibility.visibleIds.has('tbl2'), false)
    })
})
