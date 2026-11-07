/**
 * 回归：ON 子句 FK 整句提示 / JOIN 表别名后多余空格
 */
import {describe, it, before} from 'node:test'
import assert from 'node:assert/strict'
import {analyzeSqlCompletionContext} from '../completion/context.ts'
import {resolveCompletionPlan} from '../completion/grammar/index.ts'
import {runCollectors} from '../completion/builders/collectors.ts'
import {onClauseHasComparisonOperator} from '../completion/grammar/transitions/predicate.ts'
import {hasClauseKeywordAfterReplace} from '../utils/alias-line.ts'
import {createSqlEditorRuntime, setActiveSqlEditorRuntime} from '../runtime/sql-editor-runtime.ts'
import type {SuggestItem} from '../completion/suggest-types.ts'

const TABLES = ['order_detail', 'product']
const COLUMNS = {
    order_detail: [
        {name: 'product_id'},
        {name: 'create_time'},
        {name: 'update_time'},
    ],
    product: [
        {name: 'product_id'},
        {name: 'create_time'},
        {name: 'update_time'},
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

function collect(sqlWithCursor: string) {
    const offset = sqlWithCursor.indexOf('|')
    assert.ok(offset >= 0)
    const sql = sqlWithCursor.replace('|', '')
    const ctx = analyzeSqlCompletionContext(sql, offset, TABLES, COLUMNS)
    const plan = resolveCompletionPlan(ctx)
    const before = sql.slice(0, offset)
    const word = /([\w$]*)$/.exec(before)?.[1] ?? ''
    const prefix =
        ctx.slot === 'column_ref'
            ? (ctx.columnPrefix ?? '')
            : word
    const range = {
        startLineNumber: 1,
        endLineNumber: 1,
        startColumn: offset - prefix.length + 1,
        endColumn: offset + 1,
    }
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
        range,
        prefix,
        hasTables: true,
        schema: {tables: TABLES, columns: COLUMNS, foreignKeys: FKS},
    })
    return {ctx, plan, items, labels: items.map(labelOf)}
}

describe('onClauseHasComparisonOperator', () => {
    it('bare ON → false', () => {
        assert.equal(
            onClauseHasComparisonOperator('SELECT * FROM a JOIN b ON '),
            false,
        )
    })

    it('ON after equals → true', () => {
        assert.equal(
            onClauseHasComparisonOperator(
                'SELECT * FROM order_detail od LEFT JOIN product pr ON od.product_id = pr',
            ),
            true,
        )
    })
})

describe('hasClauseKeywordAfterReplace', () => {
    it('detects ON after JOIN table placeholder', () => {
        const line = 'SELECT * FROM od LEFT JOIN table ON '
        // "table" ends at exclusive column: 1-based index after 'e'
        const tableStart = line.indexOf('table')
        const endColumn = tableStart + 'table'.length // slice(endColumn) → " ON "
        assert.equal(hasClauseKeywordAfterReplace(line, endColumn), true)
    })

    it('no clause when line ends at table', () => {
        const line = 'SELECT * FROM od LEFT JOIN product'
        assert.equal(hasClauseKeywordAfterReplace(line, line.length), false)
    })
})

describe('ON FK suggestions after operator', () => {
    before(() => {
        setActiveSqlEditorRuntime(
            createSqlEditorRuntime({
                schema: {tables: TABLES, columns: COLUMNS, foreignKeys: FKS},
            }),
        )
    })

    it('bare ON still offers full FK conditions', () => {
        const {labels} = collect(
            'SELECT * FROM order_detail od LEFT JOIN product pr ON |',
        )
        assert.ok(
            labels.some((l) => /od\.product_id\s*=\s*pr\.product_id/i.test(l)),
            `expected FK condition, got ${labels.join(', ')}`,
        )
    })

    it('after LHS = alias prefix: no full FK (avoid a = a = b)', () => {
        const {labels, ctx} = collect(
            'SELECT * FROM order_detail od LEFT JOIN product pr ON od.product_id = pr|',
        )
        assert.equal(ctx.slot, 'on')
        const fullFk = labels.filter((l) => /\w+\.\w+\s*=\s*\w+\.\w+/.test(l))
        assert.deepEqual(fullFk, [], `must not offer full FK conditions, got: ${labels.join(' | ')}`)
    })

    it('after pr. offers columns only', () => {
        const {labels, ctx, plan} = collect(
            'SELECT * FROM order_detail od LEFT JOIN product pr ON od.product_id = pr.|',
        )
        assert.equal(ctx.slot, 'column_ref')
        assert.equal(plan.stage, 'column_ref.default')
        assert.ok(labels.includes('product_id'))
        assert.equal(
            labels.some((l) => l.includes('=')),
            false,
            `must not offer FK equality, got: ${labels.join(' | ')}`,
        )
    })
})

describe('table insert before existing ON', () => {
    before(() => {
        setActiveSqlEditorRuntime(
            createSqlEditorRuntime({
                schema: {tables: TABLES, columns: COLUMNS, foreignKeys: FKS},
            }),
        )
    })

    it('does not append trailing space when ON already follows', () => {
        // 模拟 JOIN 片段：`LEFT JOIN ${1:table} ON $0`，占位选中 `pr` 后接受 product
        const line = 'SELECT * FROM order_detail od LEFT JOIN pr ON '
        const tokenStart = line.lastIndexOf('pr')
        const offset = tokenStart + 'pr'.length
        const ctx = analyzeSqlCompletionContext(line, offset, TABLES, COLUMNS)
        const plan = resolveCompletionPlan(ctx)
        assert.ok(plan.collectors.includes('tables'), `expected tables collector, stage=${plan.stage}`)
        const range = {
            startLineNumber: 1,
            endLineNumber: 1,
            startColumn: tokenStart + 1,
            endColumn: offset + 1,
        }
        assert.equal(hasClauseKeywordAfterReplace(line, range.endColumn), true)
        const items: SuggestItem[] = []
        runCollectors({
            ctx,
            plan,
            push: (item) => items.push(item),
            editor: {
                lineAtRange: line,
                fullSql: line,
                cursorOffset: offset,
                lineBeforeCursor: line.slice(0, offset),
            },
            range,
            prefix: 'pr',
            hasTables: false,
            schema: {tables: TABLES, columns: COLUMNS, foreignKeys: FKS},
        })
        const product = items.find(
            (i) => /^product\b/i.test(labelOf(i)) && !/\bJOIN\b/i.test(i.insertText),
        )
        assert.ok(
            product,
            `product table suggestion, got: ${items.map((i) => `${labelOf(i)}=>${JSON.stringify(i.insertText)}`).join(' | ')}`,
        )
        assert.match(product!.insertText, /^product\s+\w+$/)
        assert.equal(product!.insertText.endsWith(' '), false)
        assert.equal(product!.command, undefined)
    })
})
