import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    identifierSpanAtOffset,
    resolveSqlTablePeekAtOffset,
    splitQualifiedIdent,
} from '../utils/sql-table-peek.ts'
import type {SqlEditorSchema} from '../types.ts'

describe('sql-table-peek', () => {
    const schema: Pick<SqlEditorSchema, 'tables' | 'tableCatalogs' | 'tablesByDatabase'> = {
        tables: ['orders', 'users', 'test'],
        tableCatalogs: {test: 'hive.a003', orders: 'shop', users: 'shop'},
        tablesByDatabase: {
            shop: {tables: ['orders', 'users'], tableIds: {orders: 'n-orders', users: 'n-users'}},
            'hive.a003': {tables: ['test'], tableIds: {test: 'n-test'}},
        },
    }

    it('splits quoted and dotted identifiers', () => {
        assert.deepEqual(splitQualifiedIdent('hive.a003.test'), ['hive', 'a003', 'test'])
        assert.deepEqual(splitQualifiedIdent('`hive`.`a003`.`test`'), ['hive', 'a003', 'test'])
        assert.deepEqual(splitQualifiedIdent('[orders]'), ['orders'])
    })

    it('peeks a FROM table', () => {
        const sql = 'SELECT * FROM orders WHERE id = 1'
        const offset = sql.indexOf('orders') + 2
        const hit = resolveSqlTablePeekAtOffset(sql, offset, schema)
        assert.equal(hit?.tableName, 'orders')
        assert.equal(hit?.tableId, 'n-orders')
        assert.equal(hit?.catalog, 'shop')
    })

    it('peeks a table alias', () => {
        const sql = 'SELECT o.id FROM orders o JOIN users u ON o.uid = u.id'
        const hit = resolveSqlTablePeekAtOffset(sql, sql.indexOf(' o ') + 1, schema)
        assert.equal(hit?.tableName, 'orders')
    })

    it('peeks alias.column as the table', () => {
        const sql = 'SELECT o.id FROM orders o'
        const hit = resolveSqlTablePeekAtOffset(sql, sql.indexOf('id'), schema)
        assert.equal(hit?.tableName, 'orders')
    })

    it('peeks catalog.schema.table', () => {
        const sql = 'SELECT * FROM hive.a003.test'
        const hit = resolveSqlTablePeekAtOffset(sql, sql.indexOf('test'), schema)
        assert.equal(hit?.tableName, 'test')
        assert.equal(hit?.tableId, 'n-test')
    })

    it('does not peek CTE names', () => {
        const sql = 'WITH orders AS (SELECT 1 AS id) SELECT * FROM orders'
        const cteNameOffset = sql.indexOf('orders')
        const hit = resolveSqlTablePeekAtOffset(sql, cteNameOffset, schema)
        assert.equal(hit, null)
    })

    it('does not peek comments or strings', () => {
        const sql = "SELECT * FROM orders -- users\nWHERE name = 'users'"
        assert.equal(resolveSqlTablePeekAtOffset(sql, sql.indexOf('users'), schema), null)
        assert.equal(resolveSqlTablePeekAtOffset(sql, sql.lastIndexOf('users'), schema), null)
    })

    it('does not peek unknown identifiers', () => {
        const sql = 'SELECT amount FROM orders'
        assert.equal(resolveSqlTablePeekAtOffset(sql, sql.indexOf('amount'), schema), null)
    })

    it('identifierSpanAtOffset covers dotted names', () => {
        const sql = 'FROM hive.a003.test'
        const span = identifierSpanAtOffset(sql, sql.indexOf('a003'))
        assert.equal(span?.text, 'hive.a003.test')
    })
})
