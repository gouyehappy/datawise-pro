/**
 * P0：Signature 解析、函数类型提权、同名 JOIN、限定符只出本表列
 */
import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    findActiveFunctionCall,
    parseSignatureParams,
} from '../completion/function-presentation.ts'
import {
    classifyFunctionReturnKind,
    functionAffinityBoost,
    resolveFunctionContextHint,
} from '../completion/function-affinity.ts'
import {sameNameJoinConditions} from '../utils/schema-columns.ts'
import {createSqlEditorRuntime} from '../runtime/create-runtime.ts'
import {setActiveSqlEditorRuntime} from '../runtime/sql-editor-runtime.ts'
import {setSqlCompletionDialect} from '../completion/keyword-config.ts'
import {analyzeSqlCompletionContext} from '../completion/context.ts'
import {resolveCompletionPlan} from '../completion/grammar/index.ts'
import {runCollectors} from '../completion/builders/collectors.ts'
import {setActiveCompletionPlan} from '../completion/builders/sort-state.ts'
import type {SuggestItem} from '../completion/suggest-types.ts'

function labelsOf(items: SuggestItem[]): string[] {
    return items.map((i) =>
        typeof i.label === 'object' && i.label && 'label' in i.label
            ? String(i.label.label)
            : String(i.label),
    )
}

describe('P0 signature help parsing', () => {
    it('parses params and active call index', () => {
        assert.deepEqual(parseSignatureParams('(date: datetime, INTERVAL expr unit)'), [
            'date: datetime',
            'INTERVAL expr unit',
        ])
        assert.deepEqual(findActiveFunctionCall('SELECT DATE_ADD('), {
            name: 'DATE_ADD',
            activeParameter: 0,
        })
        assert.deepEqual(findActiveFunctionCall('SELECT DATE_ADD(now(), '), {
            name: 'DATE_ADD',
            activeParameter: 1,
        })
    })
})

describe('P0 function type affinity', () => {
    it('classifies returns and boosts aggregates in SELECT', () => {
        assert.equal(classifyFunctionReturnKind({name: 'COUNT', returns: 'number'}), 'numeric')
        assert.equal(classifyFunctionReturnKind({name: 'CONCAT', returns: 'string'}), 'string')
        const selectBoost = functionAffinityBoost(
            {name: 'COUNT', returns: 'number'},
            {preferAggregate: true},
        )
        const otherBoost = functionAffinityBoost(
            {name: 'CONCAT', returns: 'string'},
            {preferAggregate: true},
        )
        assert.ok(selectBoost < otherBoost)
    })

    it('WHERE amount > 语境期望 numeric', () => {
        const schema = {
            tables: ['orders'],
            columns: {orders: [{name: 'amount', type: 'decimal'}]},
        }
        const sql = 'SELECT * FROM orders WHERE amount > '
        const ctx = analyzeSqlCompletionContext(sql, sql.length, schema.tables, schema.columns)
        const hint = resolveFunctionContextHint(ctx, schema)
        assert.equal(hint.expectKind, 'numeric')
    })
})

describe('P0 same-name JOIN ON', () => {
    it('emits same-name conditions when no FK', () => {
        const schema = {
            tables: ['a', 'b'],
            columns: {
                a: [{name: 'tenant_id'}, {name: 'id'}],
                b: [{name: 'tenant_id'}, {name: 'name'}],
            },
        }
        const conds = sameNameJoinConditions(schema, 'a', 'a', 'b', 'b')
        assert.deepEqual(conds, ['a.tenant_id = b.tenant_id'])
    })
})

describe('P0 qualifier locks to one table', () => {
    it('orders. 只出 orders 列，不含 users 列', () => {
        const tables = ['orders', 'users']
        const columns = {
            orders: [{name: 'order_id'}, {name: 'amount'}],
            users: [{name: 'user_id'}, {name: 'name'}],
        }
        const runtime = createSqlEditorRuntime({sync: false, schema: {tables, columns}})
        setActiveSqlEditorRuntime(runtime)
        setSqlCompletionDialect('mysql')

        const sql = 'SELECT orders.| FROM orders, users'
        const offset = sql.indexOf('|')
        const clean = sql.replace('|', '')
        const ctx = analyzeSqlCompletionContext(clean, offset, tables, columns)
        const plan = resolveCompletionPlan(ctx)
        const items: SuggestItem[] = []
        setActiveCompletionPlan(plan)
        try {
            runCollectors({
                ctx,
                plan,
                push: (item) => items.push(item),
                editor: {
                    lineAtRange: clean,
                    fullSql: clean,
                    cursorOffset: offset,
                    lineBeforeCursor: clean.slice(0, offset),
                },
                range: {
                    startLineNumber: 1,
                    endLineNumber: 1,
                    startColumn: offset,
                    endColumn: offset + 1,
                },
                prefix: '',
                hasTables: true,
                schema: {tables, columns},
            })
        } finally {
            setActiveCompletionPlan(null)
        }

        const labels = labelsOf(items)
        assert.ok(labels.some((l) => l.includes('order_id')), labels.join(','))
        assert.equal(labels.some((l) => l.includes('user_id') || l === 'name'), false, labels.join(','))
    })
})
