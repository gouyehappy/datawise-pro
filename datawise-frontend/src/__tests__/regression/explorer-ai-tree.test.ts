import assert from 'node:assert/strict'
import {describe, test} from 'node:test'
import type {TreeNode} from '@/core/types'
import {
    ensureAiFolderInScopeChildren,
    isAiFolder,
    migrateExplorerTreeAiStructure,
} from '@/features/explorer/services/explorer-ai-tree.service'

describe('explorer-ai-tree', () => {
    test('SQL Server: AI under schema with models/workspaces, not under database', () => {
        const schema: TreeNode = {
            id: 'schema-dbo',
            label: 'dbo',
            type: 'schema',
            children: [
                {id: 'folder-tables', label: 'tables', type: 'folder', children: []},
                {id: 'folder-models', label: 'models', type: 'folder', children: []},
                {id: 'folder-ws', label: 'workspaces', type: 'folder', children: []},
            ],
        }
        const database: TreeNode = {
            id: 'db-env',
            label: 'env_db',
            type: 'database',
            children: [
                {id: 'folder-ai-db', label: 'ai', type: 'folder', children: []},
                schema,
            ],
        }
        const roots: TreeNode[] = [
            {
                id: 'conn-1',
                label: 'SqlServer',
                type: 'connection',
                children: [database],
            },
        ]

        migrateExplorerTreeAiStructure(roots)

        assert.equal(database.children?.some((child) => isAiFolder(child)), false)
        assert.equal(schema.children?.some((child) => isAiFolder(child)), true)
        assert.deepEqual(
            schema.children?.map((child) => child.label),
            ['tables', 'models', 'workspaces', 'ai'],
        )
    })

    test('MySQL flat database keeps AI with models/workspaces', () => {
        const database: TreeNode = {
            id: 'db-app',
            label: 'app',
            type: 'database',
            children: [
                {id: 'folder-tables', label: 'tables', type: 'folder', children: []},
                {id: 'folder-models', label: 'models', type: 'folder', children: []},
                {id: 'folder-ws', label: 'workspaces', type: 'folder', children: []},
            ],
        }
        const roots: TreeNode[] = [
            {
                id: 'conn-1',
                label: 'MySQL',
                type: 'connection',
                children: [database],
            },
        ]

        migrateExplorerTreeAiStructure(roots)

        assert.equal(database.children?.some((child) => isAiFolder(child)), true)
        assert.deepEqual(
            database.children?.map((child) => child.label),
            ['tables', 'models', 'workspaces', 'ai'],
        )
    })

    test('ensureAiFolderInScopeChildren strips AI from schema-container databases', () => {
        const database: TreeNode = {
            id: 'db-env',
            label: 'env_db',
            type: 'database',
            children: [
                {id: 'folder-ai-db', label: 'ai', type: 'folder', children: []},
                {id: 'schema-dbo', label: 'dbo', type: 'schema', children: []},
            ],
        }
        ensureAiFolderInScopeChildren(database, 'conn-1')
        assert.equal(database.children?.some((child) => isAiFolder(child)), false)
        assert.deepEqual(database.children?.map((child) => child.label), ['dbo'])
    })
})
