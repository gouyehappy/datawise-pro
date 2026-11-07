import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import type {TreeNode} from '@/core/types'
import {
    collectPathNodeIds,
    isTreeTwistVisuallyExpanded,
    markExpandedPath,
    shouldCollapseOnToggle,
    shouldLoadOnNodeSelect,
} from '@/features/explorer/services/explorer-tree-expansion'
import {needsLazyLoad} from '@/features/explorer/services/explorer-lazy-load'
import {
    applyFirstLevelExpandedNodeIds,
    collectFirstLevelExpandedNodeIds,
} from '@/features/explorer/utils/tree-session'

function node(partial: Partial<TreeNode> & Pick<TreeNode, 'id' | 'label' | 'type'>): TreeNode {
    return {...partial}
}

const tree: TreeNode[] = [
    {
        id: 'conn-trino',
        label: 'trino',
        type: 'connection',
        dbType: 'trino',
        children: [
            {
                id: 'cat-kudu',
                label: 'kudu',
                type: 'database',
                children: [
                    {
                        id: 'schema-a003',
                        label: 'a003',
                        type: 'schema',
                        expanded: true,
                        children: [],
                    },
                ],
            },
            {
                id: 'cat-hive',
                label: 'hive',
                type: 'database',
                children: [
                    node({
                        id: 'schema-hive-a003',
                        label: 'a003',
                        type: 'schema',
                        children: [
                            node({id: 'folder-tables', label: 'tables', type: 'folder', children: []}),
                        ],
                    }),
                ],
            },
        ],
    },
    {
        id: 'conn-mongo',
        label: 'mongo',
        type: 'connection',
        dbType: 'mongodb',
        children: [
            {
                id: 'db-admin',
                label: 'admin',
                type: 'database',
                children: [
                    node({id: 'folder-tables-mongo', label: 'tables', type: 'folder', children: []}),
                ],
            },
        ],
    },
]

describe('explorer-tree-expansion', () => {
    it('collects path from root to target', () => {
        assert.deepEqual(collectPathNodeIds(tree, 'schema-a003'), [
            'conn-trino',
            'cat-kudu',
            'schema-a003',
        ])
    })

    it('collapses expanded node with no children so twistie cannot stick open', () => {
        const schema = tree[0].children![0].children![0]
        assert.equal(schema.children?.length ?? 0, 0)
        assert.equal(shouldCollapseOnToggle(schema, 'trino'), true)
    })

    it('collapses expanded empty lazy folder even when needsLazyLoad stays true (BUG-004)', () => {
        const tables = node({
            id: 'folder-tables-empty',
            label: 'tables',
            type: 'folder',
            expanded: true,
            children: [],
        })
        assert.equal(needsLazyLoad(tables, 'mysql'), true)
        assert.equal(shouldCollapseOnToggle(tables, 'mysql'), true)
    })

    it('twistie looks collapsed when expanded flag is set but children are missing', () => {
        const empty = node({id: 's1', label: 's', type: 'schema', expanded: true, children: []})
        assert.equal(isTreeTwistVisuallyExpanded(empty), false)
        assert.equal(isTreeTwistVisuallyExpanded(empty, {loading: true}), true)
        const open = node({
            id: 's2',
            label: 's',
            type: 'schema',
            expanded: true,
            children: [node({id: 't', label: 't', type: 'table'})],
        })
        assert.equal(isTreeTwistVisuallyExpanded(open), true)
    })

    it('collapses expanded hive flat database when folder children are loaded', () => {
        const hiveDb = node({
            id: 'db-a003',
            label: 'a003',
            type: 'database',
            expanded: true,
            children: [
                node({id: 'folder-tables', label: 'tables', type: 'folder', children: []}),
                node({id: 'folder-models', label: 'models', type: 'folder', children: []}),
            ],
        })
        assert.equal(needsLazyLoad(hiveDb, 'hive'), false)
        assert.equal(shouldCollapseOnToggle(hiveDb, 'hive'), true)
    })

    it('collapses expanded node when children are loaded', () => {
        const mongoDb = tree[1].children![0]
        mongoDb.expanded = true
        const tablesFolder = mongoDb.children![0]
        tablesFolder.children = [
            node({id: 'tbl-events', label: 'events', type: 'table'}),
        ]
        assert.equal(shouldCollapseOnToggle(mongoDb, 'mongodb'), true)
    })

    it('reloads mongo/kudu database while tables folder is still empty', () => {
        const mongoDb = node({
            id: 'db-admin-fresh',
            label: 'admin',
            type: 'database',
            children: [
                node({id: 'folder-tables-mongo-fresh', label: 'tables', type: 'folder', children: []}),
            ],
        })
        assert.equal(needsLazyLoad(mongoDb, 'mongodb'), true)
        const kuduDb = node({
            id: 'db-default',
            label: 'default',
            type: 'database',
            children: [
                node({id: 'folder-tables-kudu', label: 'tables', type: 'folder', children: []}),
            ],
        })
        assert.equal(needsLazyLoad(kuduDb, 'kudu'), true)
    })

    it('does not load connection on single select', () => {
        const connection = tree[0]
        connection.expanded = false
        assert.equal(shouldLoadOnNodeSelect(connection, 'trino'), false)
    })

    it('does not load non-connection nodes on single select', () => {
        const catalog = tree[0].children![1]
        catalog.expanded = false
        assert.equal(shouldLoadOnNodeSelect(catalog, 'trino'), false)
    })

    it('markExpandedPath only toggles UI flags', () => {
        const catalog = tree[0].children![1]
        catalog.expanded = false
        markExpandedPath(tree, 'schema-hive-a003')
        assert.equal(catalog.expanded, true)
    })

    it('persists and restores only first-level directory expand state', () => {
        const sample: TreeNode[] = [
            node({
                id: 'g1',
                label: '默认组',
                type: 'group',
                expanded: true,
                children: [
                    node({id: 'c1', label: 'c1', type: 'connection', expanded: true, children: []}),
                ],
            }),
            node({
                id: 'g2',
                label: '其它',
                type: 'group',
                expanded: false,
                children: [],
            }),
        ]
        assert.deepEqual(collectFirstLevelExpandedNodeIds(sample), ['g1'])

        applyFirstLevelExpandedNodeIds(sample, ['g2'])
        assert.equal(sample[0].expanded, false)
        assert.equal(sample[1].expanded, true)
        // Deeper nodes are not touched by first-level restore.
        assert.equal(sample[0].children![0].expanded, true)

        // Empty preference must not collapse server/tree expand flags (e2e + first boot).
        sample[0].expanded = true
        sample[1].expanded = false
        applyFirstLevelExpandedNodeIds(sample, [])
        assert.equal(sample[0].expanded, true)
        assert.equal(sample[1].expanded, false)
    })
})
