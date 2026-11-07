import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {toPlainSqlEditorSchema, workerSchemaPayload} from '../utils/schema-plain.ts'

describe('schema-plain', () => {
    it('workerSchemaPayload is structuredClone-safe', () => {
        const payload = workerSchemaPayload(
            ['users', 'orders'],
            {users: [{name: 'id'}], orders: [{name: 'user_id'}]},
        )
        assert.doesNotThrow(() => structuredClone(payload))
        assert.equal(payload.tables.length, 2)
        assert.equal(payload.columns.users[0]?.name, 'id')
    })

    it('toPlainSqlEditorSchema strips nested reactive-like shapes', () => {
        const reactiveLike = {
            tables: ['users'],
            columns: {
                users: [{name: 'id', type: 'bigint', pk: true}],
            },
            foreignKeys: [{fromTable: 'orders', fromColumn: 'user_id', toTable: 'users', toColumn: 'id'}],
            tableCatalogs: {users: 'app'},
            tableComments: {users: '用户表'},
            columnCount: 1,
        }
        const plain = toPlainSqlEditorSchema(reactiveLike)
        assert.doesNotThrow(() => structuredClone(plain))
        assert.equal(plain.columns.users[0]?.type, 'bigint')
        assert.equal(plain.foreignKeys?.[0]?.fromTable, 'orders')
        assert.equal(plain.tableComments?.users, '用户表')
    })

    it('toPlainSqlEditorSchema omits empty tableComments', () => {
        const plain = toPlainSqlEditorSchema({
            tables: ['t'],
            columns: {t: [{name: 'id'}]},
            tableComments: {},
        })
        assert.equal(plain.tableComments, undefined)
    })

    it('toPlainSqlEditorSchema preserves Trino catalog hierarchy fields', () => {
        const plain = toPlainSqlEditorSchema({
            tables: ['t1'],
            columns: {t1: [{name: 'id'}]},
            catalogs: ['hive', 'kudu'],
            schemasByCatalog: {hive: ['a003'], kudu: ['a003']},
            tablesByDatabase: {
                'hive.a003': {tables: ['agent_test_copy'], tableIds: {agent_test_copy: 'h1'}},
                'kudu.a003': {tables: ['alog_logs'], tableIds: {alog_logs: 'k1'}},
            },
        })
        assert.doesNotThrow(() => structuredClone(plain))
        assert.deepEqual(plain.catalogs, ['hive', 'kudu'])
        assert.deepEqual(plain.schemasByCatalog?.kudu, ['a003'])
        assert.deepEqual(plain.tablesByDatabase?.['kudu.a003']?.tables, ['alog_logs'])
    })
})
