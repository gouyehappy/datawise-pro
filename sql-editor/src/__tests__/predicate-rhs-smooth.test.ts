/**
 * = 右侧写得更顺：ON/WHERE pick_value 出列、不完整右值、运算符链式再弹
 */
import {describe, it, before} from 'node:test'
import assert from 'node:assert/strict'
import {analyzeSqlCompletionContext} from '../completion/context.ts'
import {resolveCompletionPlan} from '../completion/grammar/index.ts'
import {runCollectors} from '../completion/builders/collectors.ts'
import {
    detectAfterCompleteOnPredicate,
    segmentHasIncompletePredicateRhs,
} from '../completion/grammar/transitions/predicate.ts'
import {detectValueTail} from '../completion/predicate-value-templates.ts'
import {createSqlEditorRuntime, setActiveSqlEditorRuntime} from '../runtime/sql-editor-runtime.ts'
import type {SuggestItem} from '../completion/suggest-types.ts'

const TABLES = ['order_detail', 'product', 'users']
const COLUMNS = {
    order_detail: [{name: 'product_id'}, {name: 'user_id'}, {name: 'status'}],
    product: [{name: 'product_id'}, {name: 'name'}, {name: 'status'}],
    users: [
        {name: 'id', pk: true},
        {name: 'status', type: 'varchar', enumValues: ['paid', 'pending', 'cancelled']},
        {name: 'name'},
    ],
}
const FKS = [
    {
        fromTable: 'order_detail',
        fromColumn: 'product_id',
        toTable: 'product',
        toColumn: 'product_id',
    },
]

function labelOf(item: SuggestItem): string {
    return typeof item.label === 'string' ? item.label : item.label.label
}

function at(sqlWithCursor: string) {
    const offset = sqlWithCursor.indexOf('|')
    assert.ok(offset >= 0)
    const sql = sqlWithCursor.replace('|', '')
    const ctx = analyzeSqlCompletionContext(sql, offset, TABLES, COLUMNS)
    const plan = resolveCompletionPlan(ctx)
    return {ctx, plan, sql, offset}
}

function collect(sqlWithCursor: string) {
    const {ctx, plan, sql, offset} = at(sqlWithCursor)
    const before = sql.slice(0, offset)
    const word = /([\w$]*)$/.exec(before)?.[1] ?? ''
    const prefix =
        ctx.slot === 'column_ref' ? (ctx.columnPrefix ?? '') : word
    const items: SuggestItem[] = []
    runCollectors({
        ctx,
        plan,
        push: (item) => items.push(item),
        editor: {
            lineAtRange: sql,
            fullSql: sql,
            cursorOffset: offset,
            lineBeforeCursor: before,
        },
        range: {
            startLineNumber: 1,
            endLineNumber: 1,
            startColumn: offset - prefix.length + 1,
            endColumn: offset + 1,
        },
        prefix,
        hasTables: true,
        schema: {tables: TABLES, columns: COLUMNS, foreignKeys: FKS},
    })
    return {ctx, plan, items, labels: items.map(labelOf), prefix}
}

describe('incomplete predicate RHS signals', () => {
    it('segmentHasIncompletePredicateRhs detects = pr', () => {
        assert.equal(
            segmentHasIncompletePredicateRhs(
                'SELECT * FROM order_detail od JOIN product pr ON od.product_id = pr',
            ),
            true,
        )
        assert.equal(
            segmentHasIncompletePredicateRhs(
                'SELECT * FROM order_detail od JOIN product pr ON od.product_id = ',
            ),
            false,
        )
        assert.equal(
            segmentHasIncompletePredicateRhs(
                'SELECT * FROM order_detail od JOIN product pr ON od.product_id = pr.product_id',
            ),
            false,
        )
    })

    it('ON = bare alias is not complete', () => {
        assert.equal(
            detectAfterCompleteOnPredicate(
                'SELECT * FROM order_detail od JOIN product pr ON od.product_id = pr',
                'on',
            ),
            false,
        )
        assert.equal(
            detectAfterCompleteOnPredicate(
                'SELECT * FROM order_detail od JOIN product pr ON od.product_id = pr.product_id',
                'on',
            ),
            true,
        )
    })

    it('detectValueTail covers = with partial ident', () => {
        assert.equal(detectValueTail('WHERE status = '), 'equals')
        assert.equal(detectValueTail('WHERE status = pai'), 'equals')
        assert.equal(detectValueTail('ON od.product_id = pr'), 'equals')
    })
})

describe('ON / WHERE = RHS suggestions', () => {
    before(() => {
        setActiveSqlEditorRuntime(
            createSqlEditorRuntime({
                schema: {tables: TABLES, columns: COLUMNS, foreignKeys: FKS},
            }),
        )
    })

    it('ON od.x = | → pick_value with partner columns + aliases, no full FK', () => {
        const {ctx, plan, labels} = collect(
            'SELECT * FROM order_detail od LEFT JOIN product pr ON od.product_id = |',
        )
        assert.equal(ctx.signals.after_predicate_operator, true)
        assert.equal(plan.stage, 'predicate.pick_value')
        assert.ok(plan.collectors.includes('columns'))
        assert.ok(plan.collectors.includes('aliasComplete'))
        assert.ok(
            labels.some((l) => /product_id/i.test(l)),
            `expected column, got: ${labels.join(' | ')}`,
        )
        assert.ok(
            labels.some((l) => /^pr$/i.test(l) || l === 'pr'),
            `expected alias pr, got: ${labels.join(' | ')}`,
        )
        assert.equal(
            labels.some((l) => /\w+\.\w+\s*=\s*\w+\.\w+/.test(l)),
            false,
            'must not offer full FK condition',
        )
    })

    it('ON od.x = pr| stays pick_value (not clause-next)', () => {
        const {ctx, plan, labels} = collect(
            'SELECT * FROM order_detail od LEFT JOIN product pr ON od.product_id = pr|',
        )
        assert.equal(ctx.signals.after_predicate_operator, true)
        assert.equal(ctx.signals.after_complete_on_predicate, false)
        assert.equal(plan.stage, 'predicate.pick_value')
        assert.ok(
            labels.some((l) => /^pr$/i.test(l) || /product_id/i.test(l)),
            `expected alias/column, got: ${labels.join(' | ')}`,
        )
        assert.equal(
            labels.some((l) => /\w+\.\w+\s*=\s*\w+\.\w+/.test(l)),
            false,
        )
    })

    it('WHERE status = | offers values (never empty)', () => {
        const {plan, labels, ctx} = collect('SELECT * FROM users WHERE status = |')
        assert.equal(ctx.signals.after_predicate_operator, true)
        assert.equal(plan.stage, 'predicate.pick_value')
        assert.ok(labels.length > 0, 'value stage must not be empty')
        assert.ok(
            labels.some((l) => /paid|pending|NULL|abc|123/i.test(l)),
            `expected enum/literal, got: ${labels.join(' | ')}`,
        )
    })

    it('WHERE status = pai| stays in value stage with enum filter', () => {
        const {ctx, plan, labels} = collect('SELECT * FROM users WHERE status = pai|')
        assert.equal(ctx.signals.after_predicate_operator, true)
        assert.equal(plan.stage, 'predicate.pick_value')
        assert.equal(ctx.signals.after_complete_where_predicate, false)
        assert.ok(
            labels.some((l) => /paid/i.test(l)),
            `expected paid enum, got: ${labels.join(' | ')}`,
        )
    })
})

describe('operator accept chains suggest', () => {
    before(() => {
        setActiveSqlEditorRuntime(
            createSqlEditorRuntime({
                schema: {tables: TABLES, columns: COLUMNS, foreignKeys: FKS},
            }),
        )
    })

    it('comparison operators after column include triggerSuggest', () => {
        const sql = 'SELECT * FROM users WHERE status '
        const offset = sql.length
        const ctx = analyzeSqlCompletionContext(sql, offset, TABLES, COLUMNS)
        const plan = resolveCompletionPlan(ctx, {
            parserKeywords: ['=', '<>', 'LIKE', 'IN', 'IS', 'BETWEEN', 'IS NOT NULL'],
        })
        assert.equal(plan.stage, 'predicate.after_column')
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
            range: {
                startLineNumber: 1,
                endLineNumber: 1,
                startColumn: offset + 1,
                endColumn: offset + 1,
            },
            prefix: '',
            hasTables: true,
            schema: {tables: TABLES, columns: COLUMNS, foreignKeys: FKS},
        })
        const eq = items.find((i) => labelOf(i) === '=')
        const like = items.find((i) => labelOf(i) === 'LIKE')
        assert.ok(eq, `expected =, got: ${items.map(labelOf).join(', ')}`)
        assert.ok(like, `expected LIKE, got: ${items.map(labelOf).join(', ')}`)
        assert.equal(eq!.command?.id, 'editor.action.triggerSuggest')
        assert.equal(like!.command?.id, 'editor.action.triggerSuggest')
        assert.match(eq!.insertText, /=\s*$/)
    })
})
