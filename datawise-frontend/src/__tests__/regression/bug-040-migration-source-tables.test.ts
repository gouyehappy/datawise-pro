import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import type {TreeNode} from '@/core/types'
import type {SchemaScope} from '@/features/schema-compare/types/schema-compare.types'
import {
    ensureMigrationSourceSchemaLoaded,
    findDatabaseNode,
    listTablesForScope,
} from '@/features/explorer/services/table-migration.service'

describe('bug-040 migration source tables load', () => {
    const source: SchemaScope = {
        connectionId: 'conn-mysql',
        connectionLabel: 'mysql',
        database: 'admin_db',
        dbType: 'mysql',
    }

    const tree: TreeNode[] = [
        {
            id: 'conn-mysql',
            label: 'mysql 192.0.2.141',
            type: 'connection',
            dbType: 'mysql',
            children: [
                {
                    id: 'db-admin',
                    label: 'admin_db',
                    type: 'database',
                    children: [
                        {
                            id: 'tables-folder',
                            label: 'tables',
                            type: 'folder',
                            children: [],
                        },
                    ],
                },
            ],
        },
    ]

    it('matches database node case-insensitively', () => {
        const connectionNode = tree[0]
        assert.equal(findDatabaseNode(connectionNode, 'ADMIN_DB')?.id, 'db-admin')
    })

    it('loads connection, database and tables folder before reading tree', async () => {
        const loaded: string[] = []
        await ensureMigrationSourceSchemaLoaded(tree, source, async (nodeId) => {
            loaded.push(nodeId)
        })
        assert.deepEqual(loaded, ['conn-mysql', 'db-admin', 'tables-folder'])
    })

    it('lists tables after tables folder is populated', () => {
        const tablesFolder = tree[0].children![0].children![0]
        tablesFolder.children = [
            {id: 't1', label: 'cdp_segment', type: 'table'},
            {id: 't2', label: 'cdp_tag', type: 'table'},
        ]
        assert.deepEqual(listTablesForScope(tree, source), ['cdp_segment', 'cdp_tag'])
    })
})
