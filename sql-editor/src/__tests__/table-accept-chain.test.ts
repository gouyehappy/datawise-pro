import {describe, it, before} from 'node:test'
import assert from 'node:assert/strict'
import {analyzeSqlCompletionContext} from '../completion/context.ts'
import {resolveCompletionPlan} from '../completion/grammar/index.ts'
import {runCollectors} from '../completion/builders/collectors.ts'
import {createSqlEditorRuntime, setActiveSqlEditorRuntime} from '../runtime/sql-editor-runtime.ts'
import type {SuggestItem} from '../completion/suggest-types.ts'

const TABLES = ['orders', 'users']
const COLUMNS = {
    orders: [{name: 'id'}, {name: 'user_id'}],
    users: [{name: 'id'}],
}

describe('table accept chain', () => {
    before(() => {
        setActiveSqlEditorRuntime(
            createSqlEditorRuntime({
                schema: {
                    tables: TABLES,
                    columns: COLUMNS,
                    foreignKeys: [
                        {fromTable: 'orders', fromColumn: 'user_id', toTable: 'users', toColumn: 'id'},
                    ],
                },
            }),
        )
    })

    it('FROM table insert includes alias trailing space and triggerSuggest', () => {
        const sql = 'SELECT * FROM '
        const offset = sql.length
        const ctx = analyzeSqlCompletionContext(sql, offset, TABLES, COLUMNS)
        const plan = resolveCompletionPlan(ctx)
        const items: SuggestItem[] = []
        runCollectors({
            ctx,
            plan,
            push: (item) => items.push(item),
            editor: {
                lineAtRange: sql,
                fullSql: sql,
                cursorOffset: offset,
                lineBeforeCursor: sql,
            },
            range: {startLineNumber: 1, startColumn: offset + 1, endLineNumber: 1, endColumn: offset + 1},
            prefix: '',
            hasTables: false,
            schema: {tables: TABLES, columns: COLUMNS},
        })
        const orders = items.find((item) => {
            const label = typeof item.label === 'string' ? item.label : item.label.label
            return /orders/i.test(label)
        })
        assert.ok(orders, 'orders suggestion')
        assert.notEqual(plan.tableInsertMode, 'name-only')
        assert.match(orders!.insertText, /^orders\s+\w+\s$/)
        assert.equal(orders!.command?.id, 'editor.action.triggerSuggest')
    })
})
