import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import type {TreeNode} from '@/core/types'
import {
    findExplorerScopeNode,
    findExplorerTablesFolder,
    formatExplorerDatabaseScope,
    listExplorerDatabaseInstances,
    parseExplorerDatabaseScope,
    readExplorerCatalogSchemaIndex,
    resolveExplorerInstanceLabel,
    resolveExplorerSqlFileScope,
} from '@/features/explorer/services/explorer-database-scope'

const trinoConnection: TreeNode = {
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
                    label: 'a003_a',
                    type: 'schema',
                    children: [
                        {
                            id: 'folder-tables',
                            label: 'tables',
                            type: 'folder',
                            children: [
                                {id: 'table-stat', label: 'ds_data_receive_stat', type: 'table'},
                            ],
                        },
                    ],
                },
            ],
        },
    ],
}

const sqlServerConnection: TreeNode = {
    id: 'conn-sqlserver',
    label: 'sqlserver',
    type: 'connection',
    dbType: 'sqlserver',
    children: [
        {
            id: 'cat-mydb',
            label: 'mydb',
            type: 'database',
            children: [
                {
                    id: 'schema-dbo',
                    label: 'dbo',
                    type: 'schema',
                    children: [
                        {
                            id: 'folder-tables',
                            label: 'tables',
                            type: 'folder',
                            children: [
                                {id: 'table-orders', label: 'orders', type: 'table'},
                            ],
                        },
                    ],
                },
            ],
        },
    ],
}

describe('explorer-database-scope', () => {
    it('parses catalog.schema database scope for sqlserver', () => {
        assert.deepEqual(parseExplorerDatabaseScope('sqlserver', 'mydb.dbo'), {
            catalog: 'mydb',
            schema: 'dbo',
            label: 'mydb.dbo',
        })
    })

    it('lists sqlserver instances as catalog.schema pairs', () => {
        assert.deepEqual(listExplorerDatabaseInstances(sqlServerConnection, 'sqlserver'), [
            {id: 'schema-dbo', label: 'mydb.dbo'},
        ])
    })

    it('parses catalog.schema database scope for trino', () => {
        assert.deepEqual(parseExplorerDatabaseScope('trino', 'hive.a003_a'), {
            catalog: 'hive',
            schema: 'a003_a',
            label: 'hive.a003_a',
        })
    })

    it('lists trino instances as catalog.schema pairs', () => {
        assert.deepEqual(listExplorerDatabaseInstances(trinoConnection, 'trino'), [
            {id: 'schema-a003', label: 'hive.a003_a'},
        ])
    })

    it('finds schema node and tables folder for catalog.schema scope', () => {
        const scopeNode = findExplorerScopeNode(trinoConnection, 'trino', 'hive.a003_a')
        assert.equal(scopeNode?.id, 'schema-a003')
        assert.equal(findExplorerTablesFolder(scopeNode)?.label, 'tables')
    })

    it('resolves schema node id to catalog.schema label', () => {
        assert.equal(
            resolveExplorerInstanceLabel([trinoConnection], 'schema-a003', 'trino'),
            'hive.a003_a',
        )
    })

    it('reads catalog schema index from explorer tree', () => {
        assert.deepEqual(readExplorerCatalogSchemaIndex(trinoConnection, 'trino'), {
            catalogs: ['hive'],
            schemasByCatalog: {hive: ['a003_a']},
        })
    })

    it('formats catalog.schema label', () => {
        assert.equal(formatExplorerDatabaseScope('trino', 'hive', 'a003_a'), 'hive.a003_a')
    })

    it('resolves sql_file scope under trino schema', () => {
        const scope = resolveExplorerSqlFileScope([trinoConnection], 'table-stat')
        assert.equal(scope?.instanceLabel, 'hive.a003_a')
        assert.equal(scope?.scopeNode.id, 'schema-a003')
    })
})
