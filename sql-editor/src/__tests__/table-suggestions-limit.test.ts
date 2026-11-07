import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {createSqlEditorRuntime} from '../runtime/create-runtime.ts'
import {setActiveSqlEditorRuntime} from '../runtime/sql-editor-runtime.ts'
import {analyzeSqlCompletionContext} from '../completion/context.ts'
import {analyzeCompletion} from '../completion/core/snapshot.ts'
import {collectTableSuggestions} from '../completion/builders/table-collectors.ts'
import {resolveCompletionPlan} from '../completion/grammar/index.ts'
import {MAX_TABLE_SUGGESTIONS} from '../completion/limits.ts'
import type {SuggestItem} from '../completion/suggest-types.ts'

function makeLargeSchema(size: number) {
    const tables = Array.from({length: size}, (_, i) => `tbl_${String(i).padStart(4, '0')}`)
    const columns = Object.fromEntries(tables.map((t) => [t, [{name: 'id'}]]))
    return {tables, columns}
}

describe('completion/builders/table-collectors', () => {
    it('超大 schema 表补全不超过 MAX_TABLE_SUGGESTIONS', () => {
        const {tables, columns} = makeLargeSchema(600)
        const runtime = createSqlEditorRuntime({sync: false, schema: {tables, columns}})
        setActiveSqlEditorRuntime(runtime)

        const prefix = 'tbl_'
        const sql = `SELECT * FROM ${prefix}`
        const offset = sql.length
        const ctx = analyzeSqlCompletionContext(sql, offset, tables, columns)
        const plan = resolveCompletionPlan(ctx)
        const items: SuggestItem[] = []
        collectTableSuggestions(
            ctx,
            (item) => items.push(item),
            {
                lineAtRange: sql,
                fullSql: sql,
                cursorOffset: offset,
                lineBeforeCursor: sql,
            },
            {startLineNumber: 1, startColumn: 15, endLineNumber: 1, endColumn: 15 + prefix.length},
            prefix,
            plan,
        )

        assert.ok(items.length > 0)
        assert.ok(items.length <= MAX_TABLE_SUGGESTIONS)
    })

    it('超大 schema 有前缀时仍受上限约束', () => {
        const {tables, columns} = makeLargeSchema(600)
        const runtime = createSqlEditorRuntime({sync: false, schema: {tables, columns}})
        setActiveSqlEditorRuntime(runtime)

        const prefix = 'tbl_05'
        const sql = `SELECT * FROM ${prefix}`
        const offset = sql.length
        const ctx = analyzeSqlCompletionContext(sql, offset, tables, columns)
        const plan = resolveCompletionPlan(ctx)
        const items: SuggestItem[] = []
        collectTableSuggestions(
            ctx,
            (item) => items.push(item),
            {
                lineAtRange: sql,
                fullSql: sql,
                cursorOffset: offset,
                lineBeforeCursor: sql,
            },
            {startLineNumber: 1, startColumn: 15, endLineNumber: 1, endColumn: 15 + prefix.length},
            prefix,
            plan,
        )

        assert.ok(items.length > 0)
        assert.ok(items.length <= MAX_TABLE_SUGGESTIONS)
        assert.ok(
            items.every((item) => (item.filterText ?? String(item.label)).toLowerCase().includes(prefix)),
        )
    })

    it('analyzeCompletion 在超大 schema 下可完成', () => {
        const {tables, columns} = makeLargeSchema(600)
        const snapshot = analyzeCompletion(
            'SELECT * FROM ',
            'SELECT * FROM '.length,
            tables,
            columns,
            analyzeSqlCompletionContext,
        )
        assert.equal(snapshot.context.slot, 'from')
    })
})
