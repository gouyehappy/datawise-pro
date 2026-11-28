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

    test('AI folder fallback id slugs catalog label (Default → default)', () => {
        const database: TreeNode = {
            id: 'db-conn-1-default',
            label: 'Default',
            type: 'database',
            children: [],
        }
        ensureAiFolderInScopeChildren(database, 'conn-1')
        const ai = database.children?.find((child) => isAiFolder(child))
        assert.ok(ai)
        assert.equal(ai?.id, 'folder-ai-conn-1-default')
    })

    test('Trino: AI + scripts at connection root; schema drops workspaces/ai', () => {
        const schema: TreeNode = {
            id: 'schema-a003',
            label: 'a003',
            type: 'schema',
            children: [
                {id: 'folder-tables', label: 'tables', type: 'folder', children: []},
                {id: 'folder-models', label: 'models', type: 'folder', children: []},
                {id: 'folder-ws', label: 'workspaces', type: 'folder', children: []},
                {id: 'folder-ai-schema', label: 'ai', type: 'folder', children: []},
            ],
        }
        const catalog: TreeNode = {
            id: 'db-kudu',
            label: 'kudu',
            type: 'database',
            children: [schema],
        }
        const connection: TreeNode = {
            id: 'conn-trino',
            label: 'Trino',
            type: 'connection',
            dbType: 'trino',
            children: [
                {id: 'folder-scripts', label: 'scripts', type: 'folder', children: []},
                catalog,
            ],
        }

        migrateExplorerTreeAiStructure([connection])

        assert.equal(
            connection.children?.some((child) => isAiFolder(child)),
            true,
        )
        assert.equal(
            connection.children?.map((child) => child.label).includes('scripts'),
            true,
        )
        assert.equal(schema.children?.some((child) => isAiFolder(child)), false)
        assert.equal(
            schema.children?.some(
                (child) => child.label.localeCompare('workspaces', undefined, {sensitivity: 'accent'}) === 0,
            ),
            false,
        )
        assert.deepEqual(
            schema.children?.map((child) => child.label),
            ['tables', 'models'],
        )
    })

    test('Trino: empty connection stays empty so catalogs can lazy-load', () => {
        const connection: TreeNode = {
            id: 'conn-empty',
            label: 'Trino',
            type: 'connection',
            dbType: 'trino',
            children: [],
        }
        migrateExplorerTreeAiStructure([connection])
        assert.deepEqual(connection.children, [])
    })
})
