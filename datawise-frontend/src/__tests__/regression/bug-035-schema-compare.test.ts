import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {diffColumns, diffTableNames} from '@/features/schema-compare/services/schema-compare-diff.service'
import {buildSchemaMigrateDdl} from '@/features/schema-compare/services/schema-compare-ddl.service'
import {scopesEqual, scopeKey} from '@/features/schema-compare/services/schema-scope.service'
import type {ColumnSchemaSnapshot, TableSchemaDiff} from '@/features/schema-compare/types/schema-compare.types'

function column(name: string, dataType: string, overrides: Partial<ColumnSchemaSnapshot> = {}): ColumnSchemaSnapshot {
    return {
        name,
        dataType,
        nullable: true,
        autoIncrement: false,
        ...overrides,
    }
}

describe('schema compare service', () => {
    it('diffTableNames marks tables present only on left as added', () => {
        const diffs = diffTableNames(['users', 'orders'], ['users'])
        const users = diffs.find((item) => item.tableName === 'users')
        const orders = diffs.find((item) => item.tableName === 'orders')
        assert.equal(users?.status, 'unchanged')
        assert.equal(orders?.status, 'added')
    })

    it('diffTableNames marks tables present only on right as removed', () => {
        const diffs = diffTableNames(['users'], ['users', 'archive'])
        const archive = diffs.find((item) => item.tableName === 'archive')
        assert.equal(archive?.status, 'removed')
    })

    it('diffColumns detects added, removed, and modified columns', () => {
        const left = [
            column('id', 'int', {nullable: false, autoIncrement: true}),
            column('name', 'varchar(64)'),
            column('legacy', 'text'),
        ]
        const right = [
            column('id', 'int', {nullable: false, autoIncrement: true}),
            column('name', 'varchar(128)'),
            column('email', 'varchar(128)'),
        ]
        const diffs = diffColumns(left, right)
        assert.deepEqual(
            diffs.map((item) => [item.name, item.status]),
            [
                ['email', 'removed'],
                ['legacy', 'added'],
                ['name', 'modified'],
            ],
        )
        const nameDiff = diffs.find((item) => item.name === 'name')
        assert.ok(nameDiff?.changes.includes('dataType'))
    })

    it('buildSchemaMigrateDdl emits create, drop, and alter statements', () => {
        const tableDiffs: TableSchemaDiff[] = [
            {tableName: 'users', status: 'added', columnDiffs: []},
            {tableName: 'archive', status: 'removed', columnDiffs: []},
            {
                tableName: 'orders',
                status: 'changed',
                columnDiffs: [
                    {
                        name: 'amount',
                        status: 'modified',
                        left: column('amount', 'decimal(10,2)', {nullable: false}),
                        right: column('amount', 'decimal(8,2)', {nullable: false}),
                        changes: ['dataType'],
                    },
                ],
            },
        ]
        const ddl = buildSchemaMigrateDdl(
            tableDiffs,
            'mysql',
            new Map([['users', 'CREATE TABLE `users` (`id` int);']]),
            'shop',
        )
        assert.match(ddl, /CREATE TABLE `users`/)
        assert.match(ddl, /DROP TABLE `shop`\.`archive`/)
        assert.match(ddl, /MODIFY COLUMN `amount` decimal\(10,2\) NOT NULL/)
    })

    it('scope helpers compare connection/database pairs', () => {
        const left = {
            connectionId: 'c1',
            database: 'db_a',
            connectionLabel: 'A',
            dbType: 'mysql' as const,
        }
        const right = {...left, database: 'db_b'}
        assert.equal(scopeKey(left), 'c1:db_a')
        assert.equal(scopesEqual(left, left), true)
        assert.equal(scopesEqual(left, right), false)
    })
})
