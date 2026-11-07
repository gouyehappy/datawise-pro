import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import type {TreeNode} from '@/core/types'
import {resolveExplorerSchemaErContext} from '@/features/explorer/services/schema-er-context.service'

describe('schema-er-context.service', () => {
    it('resolves schema er context from tables folder under database', () => {
        const tree: TreeNode[] = [
            {
                id: 'conn-1',
                label: 'local mysql',
                type: 'connection',
                dbType: 'mysql',
                children: [
                    {
                        id: 'db-shop',
                        label: 'shop',
                        type: 'database',
                        children: [
                            {
                                id: 'folder-tables',
                                label: 'tables',
                                type: 'folder',
                            },
                        ],
                    },
                ],
            },
        ]
        const folder = tree[0]?.children?.[0]?.children?.[0]
        assert.ok(folder)
        assert.deepEqual(resolveExplorerSchemaErContext(tree, folder), {
            connectionId: 'conn-1',
            database: 'shop',
            instanceId: 'db-shop',
            explorerNodeId: 'folder-tables',
        })
    })

    it('resolves trino catalog.schema from tables folder under schema node', () => {
        const tree: TreeNode[] = [
            {
                id: 'conn-trino',
                label: 'trino',
                type: 'connection',
                dbType: 'trino',
                children: [
                    {
                        id: 'cat-hive',
                        label: 'hive',
                        type: 'database',
                        children: [
                            {
                                id: 'schema-a003',
                                label: 'a003',
                                type: 'schema',
                                children: [
                                    {
                                        id: 'folder-tables',
                                        label: 'tables',
                                        type: 'folder',
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
        ]
        const folder = tree[0]?.children?.[0]?.children?.[0]?.children?.[0]
        assert.ok(folder)
        assert.deepEqual(resolveExplorerSchemaErContext(tree, folder), {
            connectionId: 'conn-trino',
            database: 'hive.a003',
            instanceId: 'cat-hive',
            explorerNodeId: 'folder-tables',
        })
    })
})
