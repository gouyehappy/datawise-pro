import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {collectSqlColumnDiagnostics} from '../utils/sql-column-diagnostics.ts'
import type {SqlEditorSchema} from '../types.ts'

const schema: SqlEditorSchema = {
    tables: ['orders', 'users'],
    columns: {
        orders: [
            {name: 'id'},
            {name: 'amount'},
        ],
        users: [
            {name: 'id'},
            {name: 'name'},
        ],
    },
}

describe('sql-column-diagnostics', () => {
    it('flags unknown qualified columns', () => {
        const diagnostics = collectSqlColumnDiagnostics(
            'SELECT o.amount, o.missing FROM orders o',
            schema,
        )
        assert.equal(diagnostics.length, 1)
        assert.equal(diagnostics[0]?.code, 'unknown_column')
        assert.match(diagnostics[0]?.message ?? '', /missing/i)
    })

    it('flags unknown table aliases', () => {
        const diagnostics = collectSqlColumnDiagnostics(
            'SELECT x.id FROM orders o',
            schema,
        )
        assert.equal(diagnostics.length, 1)
        assert.equal(diagnostics[0]?.code, 'unknown_table')
    })

    it('accepts valid alias references', () => {
        const diagnostics = collectSqlColumnDiagnostics(
            'SELECT o.amount FROM orders o JOIN users u ON u.id = o.id',
            schema,
        )
        assert.deepEqual(diagnostics, [])
    })

    it('ignores qualified table names in FROM clause', () => {
        const menuSchema: SqlEditorSchema = {
            tables: ['menus', 'datacap.menus'],
            columns: {
                menus: [{name: 'name'}, {name: 'age'}],
            },
            tablesByDatabase: {
                datacap: {tables: ['menus']},
            },
        }
        const diagnostics = collectSqlColumnDiagnostics(
            'SELECT t1.name, t1.age FROM datacap.menus t1',
            menuSchema,
        )
        assert.deepEqual(diagnostics, [])
    })
})
