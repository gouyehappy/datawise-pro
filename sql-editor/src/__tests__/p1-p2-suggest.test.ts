/**
 * P1/P2：列文档、缩写模糊、常用函数、值模板、空前缀常用项、分组标题
 */
import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {columnNameInitials, matchesColumnInitials} from '../completion/column-fuzzy.ts'
import {filterColumnsForCompletion} from '../completion/schema-column-index.ts'
import {columnDetail, columnDocumentation} from '../utils/schema-columns.ts'
import {commonFunctionPinBoost, functionAffinityBoost} from '../completion/function-affinity.ts'
import {buildPredicateValueItems} from '../completion/predicate-value-templates.ts'
import {injectSuggestGroupHeaders} from '../completion/suggest-groups.ts'
import {createSqlEditorRuntime} from '../runtime/create-runtime.ts'
import {setActiveSqlEditorRuntime} from '../runtime/sql-editor-runtime.ts'
import {setSqlCompletionDialect} from '../completion/keyword-config.ts'
import {analyzeSqlCompletionContext} from '../completion/context.ts'
import {resolveCompletionPlan} from '../completion/grammar/index.ts'
import {runCollectors} from '../completion/builders/collectors.ts'
import {setActiveCompletionPlan} from '../completion/builders/sort-state.ts'
import type {SuggestItem} from '../completion/suggest-types.ts'

describe('P1 column fuzzy initials', () => {
    it('ct → create_time；COUNT 仍不命中 user_count', () => {
        assert.equal(columnNameInitials('create_time'), 'ct')
        assert.equal(matchesColumnInitials('create_time', 'ct'), true)
        assert.equal(matchesColumnInitials('user_count', 'count'), false)

        const cols = [
            {name: 'tag_name'},
            {name: 'user_count'},
            {name: 'count_id'},
            {name: 'create_time'},
        ]
        assert.deepEqual(
            filterColumnsForCompletion(cols, 'COUNT').map((c) => c.name),
            ['count_id'],
        )
        assert.deepEqual(
            filterColumnsForCompletion(cols, 'ct').map((c) => c.name),
            ['create_time'],
        )
    })
})

describe('P1 column documentation', () => {
    it('leads with comment, then qualified name and labeled facts', () => {
        const meta = {
            name: 'status',
            type: 'varchar(32)',
            nullable: false,
            defaultValue: "'active'",
            comment: 'Order status',
            enumValues: ['active', 'closed'],
        }
        const doc = columnDocumentation(meta, 'orders')
        // 注释打头（一眼便知），再限定名，再分行标注
        assert.ok(doc.startsWith('**Order status**'))
        assert.ok(doc.includes('`orders.status`'))
        assert.ok(doc.includes('varchar(32)'))
        assert.ok(doc.includes('NOT NULL'))
        assert.ok(doc.includes("'active'"))
        assert.ok(doc.includes('active'))
        // 不再把 type·PK 糊成一行重复刷
        assert.equal(doc.includes('`varchar(32)` · PK'), false)
        assert.equal(columnDetail(meta).includes('Order status'), false)
        assert.ok(columnDetail(meta).includes('varchar(32)'))
    })
})

describe('P1 common function pin', () => {
    it('COUNT pins above obscure names', () => {
        const count = commonFunctionPinBoost({name: 'COUNT', returns: 'number'})
        const obscure = commonFunctionPinBoost({name: 'JSON_EXTRACT', returns: 'json'})
        assert.ok(count < obscure)
        assert.ok(
            functionAffinityBoost({name: 'COUNT', returns: 'number'}, {preferAggregate: true}) <
                functionAffinityBoost({name: 'JSON_EXTRACT', returns: 'json'}, {preferAggregate: true}),
        )
    })
})

describe('P1 richer predicate values', () => {
    it('nullable column gets NULL；temporal gets NOW()', () => {
        const items = buildPredicateValueItems('equals', 'temporal', [], {
            type: 'datetime',
            nullable: true,
        })
        const labels = items.map((i) => i.label)
        assert.ok(labels.includes('NULL'))
        assert.ok(labels.includes('NOW()'))
        assert.equal(items.find((i) => i.label === 'NOW()')?.kind, 'value')
        assert.equal(items.find((i) => i.label === 'YYYY-MM-DD HH:MM:SS')?.kind, 'value_string')
    })
})

describe('P2 GROUP BY select-list labels', () => {
    it('GROUP BY plan uses columns collector (FROM fallback when SELECT empty)', () => {
        const {plan} = (() => {
            const sql = 'SELECT COUNT(*) FROM orders GROUP BY |'
            const clean = sql.replace('|', '')
            const offset = sql.indexOf('|')
            const ctx = analyzeSqlCompletionContext(clean, offset, ['orders'], {
                orders: [{name: 'status'}, {name: 'user_id'}],
            })
            return {plan: resolveCompletionPlan(ctx)}
        })()
        assert.equal(plan.stage, 'group_by.pick_column')
        assert.ok(plan.collectors.includes('columns'))
    })
})

describe('P2 empty-prefix SELECT commons + group headers', () => {
    it('SELECT 空前缀含 COUNT(*)', () => {
        const tables = ['orders']
        const columns = {orders: [{name: 'id'}, {name: 'amount'}]}
        const runtime = createSqlEditorRuntime({sync: false, schema: {tables, columns}})
        setActiveSqlEditorRuntime(runtime)
        setSqlCompletionDialect('mysql')

        const sql = 'SELECT '
        const ctx = analyzeSqlCompletionContext(sql, sql.length, tables, columns)
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
                    cursorOffset: sql.length,
                    lineBeforeCursor: sql,
                },
                range: {
                    startLineNumber: 1,
                    endLineNumber: 1,
                    startColumn: sql.length,
                    endColumn: sql.length + 1,
                },
                prefix: '',
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
            labels.some((l) => /COUNT/i.test(l)),
            `expected COUNT in ${labels.join(', ')}`,
        )
    })

    it('injects group headers when multiple kinds present', () => {
        const range = {
            startLineNumber: 1,
            endLineNumber: 1,
            startColumn: 3,
            endColumn: 8,
        }
        const items: SuggestItem[] = [
            {label: 'id', kind: 3, insertText: 'id', range, sortText: '0100', preselect: true},
            {label: 'amount', kind: 3, insertText: 'amount', range, sortText: '0101', preselect: true},
            {label: 'COUNT', kind: 1, insertText: 'COUNT()', range, sortText: '0220'},
            {label: 'SUM', kind: 1, insertText: 'SUM()', range, sortText: '0221'},
            {label: 'FROM', kind: 17, insertText: 'FROM ', range, sortText: '2000'},
            {label: 'WHERE', kind: 17, insertText: 'WHERE ', range, sortText: '2001'},
        ]
        const withHdr = injectSuggestGroupHeaders(items, '')
        const headers = withHdr.filter((i) => i.suggestHeader)
        assert.ok(headers.length >= 2, `headers=${headers.map((h) => h.label).join(',')}`)
        for (const h of headers) {
            assert.equal(h.insertText, '')
            assert.equal(h.range.startColumn, h.range.endColumn)
            assert.equal(h.range.endColumn, 8)
            assert.equal(h.preselect, false)
        }
        const preselected = withHdr.filter((i) => i.preselect && !i.suggestHeader)
        assert.equal(preselected.length, 1, 'at most one non-header preselect')

        const withPrefix = injectSuggestGroupHeaders(items, 'c')
        assert.equal(withPrefix.filter((i) => i.suggestHeader).length, 0)
        assert.equal(withPrefix.filter((i) => i.preselect).length, 1)
    })
})
