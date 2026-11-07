/**
 * 函数补全：须与 keywords 解耦，在 SELECT / WHERE 表达式位可用。
 */
import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {createSqlEditorRuntime} from '../runtime/create-runtime.ts'
import {setActiveSqlEditorRuntime} from '../runtime/sql-editor-runtime.ts'
import {setSqlCompletionDialect} from '../completion/keyword-config.ts'
import {analyzeSqlCompletionContext} from '../completion/context.ts'
import {resolveCompletionPlan} from '../completion/grammar/index.ts'
import {runCollectors} from '../completion/builders/collectors.ts'
import {setActiveCompletionPlan} from '../completion/builders/sort-state.ts'
import type {SuggestItem} from '../completion/suggest-types.ts'

const TABLES = ['orders']
const COLUMNS = {
    orders: [
        {name: 'id', type: 'int'},
        {name: 'amount', type: 'decimal'},
        {name: 'status', type: 'varchar'},
    ],
}

function labelsOf(items: SuggestItem[]): string[] {
    return items.map((i) =>
        typeof i.label === 'object' && i.label && 'label' in i.label
            ? String(i.label.label)
            : String(i.label),
    )
}

function suggestAt(sqlWithCursor: string, prefix: string): {labels: string[]; planStage?: string} {
    const offset = sqlWithCursor.indexOf('|')
    assert.ok(offset >= 0)
    const sql = sqlWithCursor.replace('|', '')
    const runtime = createSqlEditorRuntime({sync: false, schema: {tables: TABLES, columns: COLUMNS}})
    setActiveSqlEditorRuntime(runtime)
    setSqlCompletionDialect('mysql')

    const ctx = analyzeSqlCompletionContext(sql, offset, TABLES, COLUMNS)
    const plan = resolveCompletionPlan(ctx)
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
                cursorOffset: offset,
                lineBeforeCursor: sql.slice(0, offset),
            },
            range: {
                startLineNumber: 1,
                endLineNumber: 1,
                startColumn: Math.max(1, offset),
                endColumn: offset + 1,
            },
            prefix,
            hasTables: true,
            schema: {tables: TABLES, columns: COLUMNS},
        })
    } finally {
        setActiveCompletionPlan(null)
    }
    return {labels: labelsOf(items), planStage: plan.stage}
}

describe('function suggestions — independent of keywords', () => {
    it('SELECT 列表前缀 cou → COUNT', () => {
        const {labels} = suggestAt('SELECT cou| FROM orders', 'cou')
        assert.ok(
            labels.some((l) => /COUNT/i.test(l)),
            `expected COUNT in ${labels.join(', ')}`,
        )
    })

    it('WHERE 选列阶段前缀 cou → COUNT（不再因 keywordPhase=none 消失）', () => {
        const {labels, planStage} = suggestAt('SELECT * FROM orders WHERE cou|', 'cou')
        assert.equal(planStage, 'predicate.pick_column')
        assert.ok(
            labels.some((l) => /COUNT/i.test(l)),
            `expected COUNT in ${labels.join(', ')}`,
        )
    })

    it('ORDER BY 仍不提示 COUNT（列优先）', () => {
        const {labels, planStage} = suggestAt('SELECT * FROM orders ORDER BY cou|', 'cou')
        assert.equal(planStage, 'order_by.pick_column')
        assert.equal(
            labels.some((l) => /COUNT/i.test(l)),
            false,
            `unexpected COUNT in ${labels.join(', ')}`,
        )
    })
})
