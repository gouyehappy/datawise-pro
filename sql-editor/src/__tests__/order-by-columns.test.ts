/**
 * ORDER BY 列补全 — SELECT * 时应提示表字段，而非函数。
 */
import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {createSqlEditorRuntime} from '../runtime/create-runtime.ts'
import {setActiveSqlEditorRuntime} from '../runtime/sql-editor-runtime.ts'
import {analyzeSqlCompletionContext} from '../completion/context.ts'
import {resolveCompletionPlan} from '../completion/grammar/index.ts'
import {runCollectors} from '../completion/builders/collectors.ts'
import {setActiveCompletionPlan} from '../completion/builders/sort-state.ts'
import type {SuggestItem} from '../completion/suggest-types.ts'

describe('ORDER BY column completion', () => {
    it('SELECT * ORDER BY c → create_time，不提示 COUNT', () => {
        const tables = ['flink_job']
        const columns = {
            flink_job: [
                {name: 'create_time'},
                {name: 'id'},
                {name: 'status'},
                {name: 'name'},
            ],
        }
        const runtime = createSqlEditorRuntime({sync: false, schema: {tables, columns}})
        setActiveSqlEditorRuntime(runtime)

        const sql = 'SELECT * FROM flink_job ORDER BY c'
        const ctx = analyzeSqlCompletionContext(sql, sql.length, tables, columns)
        const plan = resolveCompletionPlan(ctx)
        assert.equal(plan.stage, 'order_by.pick_column')

        const items: SuggestItem[] = []
        setActiveCompletionPlan(plan)
        try {
            runCollectors({
                ctx,
                plan,
                push: (item) => items.push(item),
                editor: {
                    lineAtRange: sql,
                    fullSql: sql,
                    cursorOffset: sql.length,
                    lineBeforeCursor: sql,
                },
                range: {
                    startLineNumber: 1,
                    endLineNumber: 1,
                    startColumn: sql.length,
                    endColumn: sql.length + 1,
                },
                prefix: 'c',
                hasTables: true,
                schema: {tables, columns},
            })
        } finally {
            setActiveCompletionPlan(null)
        }

        const labels = items.map((i) =>
            typeof i.label === 'object' && i.label && 'label' in i.label
                ? String(i.label.label)
                : String(i.label),
        )
        assert.ok(
            labels.some((l) => l.includes('create_time')),
            `expected create_time in ${labels.join(', ')}`,
        )
        assert.equal(
            labels.some((l) => /COUNT/i.test(l)),
            false,
            `COUNT should not appear: ${labels.join(', ')}`,
        )
    })
})
