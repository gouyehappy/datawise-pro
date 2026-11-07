import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import type {TreeNode} from '@/core/types'
import {
    buildMoveTargetMenuChildren,
    canMoveConnectionToGroup,
    findConnectionParentGroupId,
    injectConnectionMoveSubmenu,
    listConnectionMoveTargets,
    parseMoveTargetMenuId,
    toMoveTargetMenuId,
} from '@/features/explorer/services/explorer-move-connection.service'

const tree: TreeNode[] = [
    {
        id: 'group-a',
        label: 'A',
        type: 'group',
        children: [
            {id: 'conn-1', label: 'MySQL', type: 'connection', dbType: 'mysql'},
            {
                id: 'group-a1',
                label: 'A1',
                type: 'group',
                children: [
                    {id: 'conn-2', label: 'PG', type: 'connection', dbType: 'postgresql'},
                ],
            },
        ],
    },
    {
        id: 'group-b',
        label: 'B',
        type: 'group',
        children: [
            {id: 'conn-3', label: 'Redis', type: 'connection', dbType: 'redis'},
        ],
    },
]

describe('explorer-move-connection.service', () => {
    it('finds parent group of a connection', () => {
        assert.equal(findConnectionParentGroupId(tree, 'conn-1'), 'group-a')
        assert.equal(findConnectionParentGroupId(tree, 'conn-2'), 'group-a1')
    })

    it('lists move targets excluding current group', () => {
        const targets = listConnectionMoveTargets(tree, 'conn-1')
        assert.deepEqual(
            targets.map((item) => item.id).sort(),
            ['group-a1', 'group-b'],
        )
        const byId = Object.fromEntries(targets.map((item) => [item.id, item.depth]))
        assert.equal(byId['group-a1'], 1)
        assert.equal(byId['group-b'], 0)
    })

    it('returns empty targets when only one group exists', () => {
        const singleGroupTree: TreeNode[] = [
            {
                id: 'group-only',
                label: 'Only',
                type: 'group',
                children: [
                    {id: 'conn-x', label: 'X', type: 'connection', dbType: 'mysql'},
                ],
            },
        ]
        assert.deepEqual(listConnectionMoveTargets(singleGroupTree, 'conn-x'), [])
    })

    it('validates move target groups', () => {
        assert.equal(canMoveConnectionToGroup(tree, 'conn-1', 'group-b'), true)
        assert.equal(canMoveConnectionToGroup(tree, 'conn-1', 'group-a'), false)
        assert.equal(canMoveConnectionToGroup(tree, 'conn-1', 'missing'), false)
    })

    it('encodes submenu ids for move targets', () => {
        assert.equal(toMoveTargetMenuId('group-b'), 'move-to:group-b')
        assert.equal(parseMoveTargetMenuId('move-to:group-b'), 'group-b')
        assert.equal(parseMoveTargetMenuId('move'), null)
    })

    it('builds submenu children and injects into menu items', () => {
        const targets = listConnectionMoveTargets(tree, 'conn-1')
        const children = buildMoveTargetMenuChildren(targets)
        assert.equal(children.length, 2)
        assert.equal(children[0]?.id, 'move-to:group-b')

        const injected = injectConnectionMoveSubmenu(
            [{id: 'move', label: 'Move to', icon: 'file'}],
            targets,
            'Move to',
        )
        assert.equal(injected[0]?.children?.length, 2)
    })
})
