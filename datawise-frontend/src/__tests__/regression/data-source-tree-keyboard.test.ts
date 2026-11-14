import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import type {TreeNode} from '@/core/types'
import {
    dataSourceTreeItemDomId,
    resolveDataSourceTreeKeyAction,
} from '@/features/explorer/services/data-source-tree-keyboard'

function node(
    id: string,
    type: TreeNode['type'],
    opts?: Partial<TreeNode>,
): TreeNode {
    return {
        id,
        label: id,
        type,
        expanded: false,
        children: [],
        ...opts,
    }
}

describe('data-source-tree-keyboard', () => {
    const flat = [
        {node: node('g1', 'group', {expanded: true, children: [node('c1', 'connection')]}), depth: 0},
        {node: node('c1', 'connection', {expanded: false}), depth: 1},
        {node: node('c2', 'connection', {expanded: true, children: [node('db', 'database')]}), depth: 1},
        {node: node('db', 'database', {expanded: false}), depth: 2},
    ]

    it('builds stable treeitem dom ids', () => {
        assert.equal(dataSourceTreeItemDomId('conn-1'), 'dw-tree-item-conn-1')
    })

    it('moves with ArrowUp Down Home End', () => {
        assert.deepEqual(
            resolveDataSourceTreeKeyAction('ArrowDown', flat, 'g1', {
                selectable: false,
                isExpanded: (n) => Boolean(n.expanded),
            }),
            {type: 'activate', index: 1, node: flat[1]!.node},
        )
        assert.deepEqual(
            resolveDataSourceTreeKeyAction('ArrowUp', flat, 'c1', {
                selectable: false,
                isExpanded: (n) => Boolean(n.expanded),
            }),
            {type: 'activate', index: 0, node: flat[0]!.node},
        )
        assert.deepEqual(
            resolveDataSourceTreeKeyAction('Home', flat, 'db', {
                selectable: false,
                isExpanded: (n) => Boolean(n.expanded),
            }),
            {type: 'activate', index: 0, node: flat[0]!.node},
        )
        assert.deepEqual(
            resolveDataSourceTreeKeyAction('End', flat, 'g1', {
                selectable: false,
                isExpanded: (n) => Boolean(n.expanded),
            }),
            {type: 'activate', index: 3, node: flat[3]!.node},
        )
    })

    it('expands collapses and jumps to parent with ArrowRight Left', () => {
        assert.deepEqual(
            resolveDataSourceTreeKeyAction('ArrowRight', flat, 'c1', {
                selectable: false,
                isExpanded: (n) => Boolean(n.expanded),
            }),
            {type: 'toggleExpand', nodeId: 'c1'},
        )
        assert.deepEqual(
            resolveDataSourceTreeKeyAction('ArrowLeft', flat, 'c2', {
                selectable: false,
                isExpanded: (n) => Boolean(n.expanded),
            }),
            {type: 'toggleExpand', nodeId: 'c2'},
        )
        assert.deepEqual(
            resolveDataSourceTreeKeyAction('ArrowLeft', flat, 'db', {
                selectable: false,
                isExpanded: () => false,
            }),
            {type: 'activate', index: 2, node: flat[2]!.node},
        )
    })

    it('opens with Enter and toggles expand with Space', () => {
        assert.deepEqual(
            resolveDataSourceTreeKeyAction('Enter', flat, 'c1', {
                selectable: false,
                isExpanded: () => false,
            }),
            {type: 'open', node: flat[1]!.node},
        )
        assert.deepEqual(
            resolveDataSourceTreeKeyAction(' ', flat, 'c1', {
                selectable: false,
                isExpanded: () => false,
            }),
            {type: 'toggleExpand', nodeId: 'c1'},
        )
    })

    it('toggles check in selectable mode', () => {
        assert.deepEqual(
            resolveDataSourceTreeKeyAction(' ', flat, 'c1', {
                selectable: true,
                isExpanded: () => false,
                isCheckable: (n) => n.type === 'connection',
            }),
            {type: 'toggleCheck', node: flat[1]!.node},
        )
        assert.equal(
            resolveDataSourceTreeKeyAction('Enter', flat, 'g1', {
                selectable: true,
                isExpanded: () => true,
                isCheckable: (n) => n.type === 'connection',
            }),
            null,
        )
    })
})
