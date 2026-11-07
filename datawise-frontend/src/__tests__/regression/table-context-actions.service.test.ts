import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    buildDropTableSql,
    buildInsertStatementsFromCsv,
    buildQualifiedTableName,
    buildTruncateTableSql,
    parseCsvText,
    resolveOpenTableWorkspaceArgs,
    resolveTableContext,
    resolveTableDataIoMessageKey,
} from '@/features/explorer/services/table-context-actions.service'
import type {TreeNode} from '@/core/types'

const tree: TreeNode[] = [
    {
        id: 'conn-1',
        label: '192.0.2.141',
        type: 'connection',
        children: [
            {
                id: 'db-1',
                label: 'admin_db',
                type: 'database',
                children: [
                    {
                        id: 'folder-tables',
                        label: 'tables',
                        type: 'folder',
                        children: [
                            {
                                id: 'table-1',
                                label: 'cdp_segment',
                                type: 'table',
                            },
                        ],
                    },
                ],
            },
        ],
    },
]

describe('table-context-actions.service', () => {
    it('resolves table context from tree node', () => {
        const table = tree[0]?.children?.[0]?.children?.[0]?.children?.[0]
        assert.ok(table)
        assert.deepEqual(resolveTableContext(tree, table), {
            connectionId: 'conn-1',
            database: 'admin_db',
            tableName: 'cdp_segment',
            nodeId: 'table-1',
            dbType: undefined,
        })
    })

    it('resolves open-table workspace args including view objectType', () => {
        const table = tree[0]?.children?.[0]?.children?.[0]?.children?.[0]
        assert.ok(table)
        assert.deepEqual(resolveOpenTableWorkspaceArgs(tree, table, 'data'), {
            tableName: 'cdp_segment',
            connectionId: 'conn-1',
            catalogNodeId: 'db-1',
            database: 'admin_db',
            nodeId: 'table-1',
            tableView: 'data',
            objectType: 'table',
        })

        const asView: TreeNode = {...table, type: 'view'}
        assert.equal(resolveOpenTableWorkspaceArgs(tree, asView)?.objectType, 'view')
        assert.equal(resolveOpenTableWorkspaceArgs(tree, {id: 'x', label: 'db', type: 'database'}), null)
    })

    it('resolveTableDataIoMessageKey maps export / import toast keys', () => {
        assert.equal(resolveTableDataIoMessageKey('contextMissing'), 'explorer.tableActionContextMissing')
        assert.equal(resolveTableDataIoMessageKey('exportEmpty'), 'explorer.exportDataEmpty')
        assert.equal(resolveTableDataIoMessageKey('exportSuccess'), 'explorer.exportDataSuccess')
        assert.equal(resolveTableDataIoMessageKey('importCancelled'), 'explorer.importDataCancelled')
        assert.equal(resolveTableDataIoMessageKey('importSuccess'), 'explorer.importDataSuccess')
        assert.equal(resolveTableDataIoMessageKey('importFailed'), 'explorer.importDataFailed')
    })

    it('builds qualified DDL statements for mysql', () => {
        const ctx = {database: 'admin_db', tableName: 'cdp_segment', dbType: 'mysql' as const}
        assert.equal(buildQualifiedTableName(ctx), '`admin_db`.`cdp_segment`')
        assert.equal(
            buildTruncateTableSql(ctx),
            'TRUNCATE TABLE `admin_db`.`cdp_segment`',
        )
        assert.equal(
            buildDropTableSql(ctx),
            'DROP TABLE IF EXISTS `admin_db`.`cdp_segment`',
        )
    })

    it('parses csv and builds insert statements', () => {
        const csv = 'id,name\n1,alpha\n2,"beta, inc"'
        const parsed = parseCsvText(csv)
        assert.deepEqual(parsed.headers, ['id', 'name'])
        assert.deepEqual(parsed.rows, [['1', 'alpha'], ['2', 'beta, inc']])

        const statements = buildInsertStatementsFromCsv(
            {database: 'admin_db', tableName: 'cdp_segment', dbType: 'mysql'},
            parsed.headers,
            parsed.rows,
        )
        assert.equal(statements.length, 1)
        assert.match(statements[0] ?? '', /INSERT INTO `admin_db`.`cdp_segment`/)
        assert.match(statements[0] ?? '', /'beta, inc'/)
    })

    it('builds oracle insert statements one row per statement', () => {
        const parsed = parseCsvText('id,name\n1,alpha\n2,beta')
        const statements = buildInsertStatementsFromCsv(
            {database: 'hr', tableName: 'employees', dbType: 'oracle'},
            parsed.headers,
            parsed.rows,
        )
        assert.equal(statements.length, 2)
        assert.match(statements[0] ?? '', /INSERT INTO "HR"\."EMPLOYEES"/)
        assert.doesNotMatch(statements[0] ?? '', /VALUES[\s\S]*\),\s*\(/)
    })

    it('builds sqlserver insert with database..table qualification', () => {
        const parsed = parseCsvText('id,name\n1,alpha')
        const statements = buildInsertStatementsFromCsv(
            {database: 'AdventureWorks', tableName: 'Person', dbType: 'sqlserver'},
            parsed.headers,
            parsed.rows,
        )
        assert.equal(statements.length, 1)
        assert.match(statements[0] ?? '', /INSERT INTO \[AdventureWorks\]\.\[dbo\]\.\[Person\]/)
    })

    it('resolves trino table context with catalog.schema database scope', () => {
        const trinoTree: TreeNode[] = [
            {
                id: 'conn-trino',
                label: 'trino 192.0.2.53',
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
                                        children: [
                                            {
                                                id: 'table-agent',
                                                label: 'agent_test3',
                                                type: 'table',
                                            },
                                        ],
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
        ]
        const table = trinoTree[0]?.children?.[0]?.children?.[0]?.children?.[0]?.children?.[0]
        assert.ok(table)
        assert.deepEqual(resolveTableContext(trinoTree, table), {
            connectionId: 'conn-trino',
            database: 'hive.a003',
            tableName: 'agent_test3',
            nodeId: 'table-agent',
            dbType: 'trino',
        })
    })

    it('resolveTableContext uses catalog.schema for hive', () => {
        const hiveTree: TreeNode[] = [
            {
                id: 'conn-hive',
                label: 'Hive',
                type: 'connection',
                dbType: 'hive',
                children: [
                    {
                        id: 'cat-default',
                        label: 'default',
                        type: 'database',
                        children: [
                            {
                                id: 'schema-main',
                                label: 'main',
                                type: 'schema',
                                children: [
                                    {
                                        id: 'folder-tables',
                                        label: 'tables',
                                        type: 'folder',
                                        children: [
                                            {
                                                id: 'table-users',
                                                label: 'users',
                                                type: 'table',
                                            },
                                        ],
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
        ]
        const table = hiveTree[0]?.children?.[0]?.children?.[0]?.children?.[0]?.children?.[0]
        assert.ok(table)
        assert.deepEqual(resolveTableContext(hiveTree, table), {
            connectionId: 'conn-hive',
            database: 'default.main',
            tableName: 'users',
            nodeId: 'table-users',
            dbType: 'hive',
        })
    })
})
