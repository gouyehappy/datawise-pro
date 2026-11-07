import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    analyzeSqlCompletionContextUncached,
    isFromJoinQualifiedTablePartial,
} from '../completion/context.ts'
import {collectCatalogSchemaSuggestions} from '../completion/builders/catalog-schema-collectors.ts'
import {collectTableSuggestions} from '../completion/builders/table-collectors.ts'
import {resolveCompletionPlan} from '../completion/grammar/index.ts'
import {setActiveSqlEditorRuntime, createSqlEditorRuntime} from '../runtime/sql-editor-runtime.ts'
import {toPlainSqlEditorSchema} from '../utils/schema-plain.ts'
import type {SqlEditorSchema} from '../types.ts'

describe('trino FROM qualified table completion context', () => {
    it('detects FROM catalog. as table qualifier, not column_ref', () => {
        const sql = 'SELECT * FROM hive.'
        assert.equal(isFromJoinQualifiedTablePartial(sql), true)
        const ctx = analyzeSqlCompletionContextUncached(sql, sql.length, [], {})
        assert.equal(ctx.slot, 'from')
        assert.equal(ctx.qualifier, null)
        assert.equal(ctx.fromJoin?.tablePrefix, 'hive.')
    })

    it('still treats WHERE alias. as column_ref', () => {
        const sql = 'SELECT * FROM users WHERE hive.'
        const ctx = analyzeSqlCompletionContextUncached(sql, sql.length, ['users'], {})
        assert.equal(ctx.slot, 'column_ref')
        assert.equal(ctx.qualifier, 'hive')
    })

    it('suggests schemas after FROM catalog.', () => {
        const schema: SqlEditorSchema = {
            tables: [],
            columns: {},
            catalogs: ['hive'],
            schemasByCatalog: {hive: ['a003_a']},
        }
        const sql = 'SELECT * FROM hive.'
        const ctx = analyzeSqlCompletionContextUncached(sql, sql.length, [], {})
        const items: Array<{ insertText: string }> = []
        collectCatalogSchemaSuggestions(
            ctx,
            (item) => items.push(item),
            {startLineNumber: 1, endLineNumber: 1, startColumn: 1, endColumn: 1},
            '',
            schema,
        )
        assert.deepEqual(items.map((item) => item.insertText), ['a003_a'])
    })

    it('suggests tables after FROM catalog.schema.', () => {
        const schema: SqlEditorSchema = {
            tables: [],
            columns: {},
            catalogs: ['hive'],
            schemasByCatalog: {hive: ['a003_a']},
            tablesByDatabase: {
                'hive.a003_a': {
                    tables: ['ds_data_receive_stat'],
                    tableIds: {ds_data_receive_stat: 'table-1'},
                },
            },
        }
        const sql = 'SELECT * FROM hive.a003_a.'
        const ctx = analyzeSqlCompletionContextUncached(sql, sql.length, [], {})
        const items: Array<{ insertText: string }> = []
        collectCatalogSchemaSuggestions(
            ctx,
            (item) => items.push(item),
            {startLineNumber: 1, endLineNumber: 1, startColumn: 1, endColumn: 1},
            '',
            schema,
        )
        assert.deepEqual(items.map((item) => item.insertText), ['ds_data_receive_stat'])
    })

    it('kudu.a003. suggests only tables in that scope after runtime plain schema', () => {
        const rawSchema: SqlEditorSchema = {
            tables: ['agent_test_copy', 'alog_logs'],
            columns: {},
            catalogs: ['hive', 'kudu'],
            schemasByCatalog: {hive: ['a003'], kudu: ['a003']},
            tableCatalogs: {
                agent_test_copy: 'hive.a003',
                alog_logs: 'kudu.a003',
            },
            tablesByDatabase: {
                'hive.a003': {
                    tables: ['agent_test_copy'],
                    tableIds: {agent_test_copy: 'h1'},
                },
                'kudu.a003': {
                    tables: ['alog_logs'],
                    tableIds: {alog_logs: 'k1'},
                },
            },
        }
        const runtime = createSqlEditorRuntime({sync: false})
        runtime.setSchema(toPlainSqlEditorSchema(rawSchema))
        setActiveSqlEditorRuntime(runtime, {sync: false})

        const sql = 'SELECT * FROM kudu.a003.'
        const ctx = analyzeSqlCompletionContextUncached(sql, sql.length, [], {})
        const range = {startLineNumber: 1, endLineNumber: 1, startColumn: 20, endColumn: 20}
        const catalogItems: Array<{ insertText: string; detail?: string }> = []
        collectCatalogSchemaSuggestions(
            ctx,
            (item) => catalogItems.push(item),
            range,
            '',
            runtime.getSchema(),
        )
        assert.deepEqual(catalogItems.map((item) => item.insertText), ['alog_logs'])

        const allItems: Array<{ insertText: string; detail?: string }> = []
        const plan = resolveCompletionPlan(ctx)
        collectTableSuggestions(
            ctx,
            (item) => allItems.push(item),
            {fullSql: sql, lineAtRange: sql, cursorOffset: sql.length, lineBeforeCursor: sql},
            range,
            '',
            plan,
        )
        assert.equal(allItems.length, 1)
        assert.match(allItems[0]!.insertText, /^alog_logs\s+\w+\s$/)
        assert.ok(allItems.every((item) => !String(item.detail ?? '').includes('hive')))
    })
})
