import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import type {TreeNode} from '@/core/types'
import {
    collectSelectedConnectionIds,
    listExportConnectionGroups,
} from '@/features/explorer/services/export-connection-groups.service'

describe('export-connection-groups.service', () => {
    const tree: TreeNode[] = [
        {
            id: 'g-prod',
            label: '生产',
            type: 'group',
            children: [
                {id: 'c1', label: 'mysql-a', type: 'connection', dbType: 'mysql'},
                {
                    id: 'g-nested',
                    label: '子组',
                    type: 'group',
                    children: [
                        {id: 'c2', label: 'pg-b', type: 'connection', dbType: 'postgresql'},
                    ],
                },
            ],
        },
        {
            id: 'g-empty',
            label: '空组',
            type: 'group',
            children: [],
        },
        {
            id: 'g-dev',
            label: '开发',
            type: 'group',
            children: [
                {id: 'c3', label: 'redis', type: 'connection', dbType: 'redis'},
            ],
        },
    ]

    it('lists top-level groups with nested connection ids', () => {
        const groups = listExportConnectionGroups(tree)
        assert.deepEqual(
            groups.map((g) => ({id: g.id, count: g.connectionIds.length})),
            [
                {id: 'g-prod', count: 2},
                {id: 'g-dev', count: 1},
            ],
        )
        assert.deepEqual(groups[0].connectionIds, ['c1', 'c2'])
    })

    it('collects selected connection ids without duplicates', () => {
        const groups = listExportConnectionGroups(tree)
        const ids = collectSelectedConnectionIds(groups, new Set(['g-prod', 'g-dev']))
        assert.deepEqual(ids.sort(), ['c1', 'c2', 'c3'])
        assert.deepEqual(collectSelectedConnectionIds(groups, new Set()), [])
    })
})
