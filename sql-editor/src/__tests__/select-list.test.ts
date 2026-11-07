/**
 * SELECT 列表解析 — GROUP BY / ORDER BY 语义（功能测试）。
 * 关键 Bug 回归见 regression.test.ts（BUG-009、BUG-010）。
 */
import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    detectSelectAliasDraft,
    extractSelectListText,
    groupBySelectItems,
    orderBySelectItems,
    parseSelectListItems,
    splitSelectListItems,
} from '../completion/select-list.ts'
import {analyzeSqlCompletionContext} from '../completion/context.ts'

describe('select-list parser', () => {
    const segment =
        'SELECT status, COUNT(*) AS cnt, t1.created_at AS created FROM orders t1 WHERE 1=1 GROUP BY '

    it('extracts SELECT list between SELECT and FROM', () => {
        const list = extractSelectListText(segment)
        assert.match(list, /status/)
        assert.match(list, /COUNT\(\*\)/)
        assert.doesNotMatch(list, /FROM/)
    })

    it('splits items respecting parentheses', () => {
        const list = 'status, COUNT(*) AS cnt, COALESCE(a, b) AS x'
        assert.equal(splitSelectListItems(list).length, 3)
    })

    it('detects aggregates and aliases', () => {
        const items = parseSelectListItems(segment)
        assert.equal(items.length, 3)
        assert.equal(items[0].expression, 'status')
        assert.equal(items[0].aggregate, false)
        assert.equal(items[1].alias, 'cnt')
        assert.equal(items[1].aggregate, true)
        assert.equal(items[2].alias, 'created')
        assert.equal(items[2].columnNames[0], 'created_at')
    })

    it('group by excludes aggregates', () => {
        const groupItems = groupBySelectItems(segment)
        assert.equal(groupItems.length, 2)
        assert.equal(groupItems.some((i) => i.aggregate), false)
        assert.equal(groupItems.some((i) => i.alias === 'cnt'), false)
    })

    it('order by includes aggregates and aliases', () => {
        const orderItems = orderBySelectItems(segment)
        assert.equal(orderItems.length, 3)
        assert.equal(orderItems[1].alias, 'cnt')
    })

    it('detects current column name as alias draft after AS', () => {
        const draft = detectSelectAliasDraft('SELECT t1.product_name AS pro')
        assert.deepEqual(draft, {
            expression: 't1.product_name',
            alias: 'product_name',
        })
    })
})

describe('order_by complete column ref', () => {
    it('detects after ORDER BY column for ASC/DESC', () => {
        const sql = 'SELECT status FROM orders GROUP BY status ORDER BY status'
        const offset = sql.length
        const ctx = analyzeSqlCompletionContext(sql, offset, ['orders'], {
            orders: [{name: 'status'}],
        })
        assert.equal(ctx.slot, 'order_by')
        assert.equal(ctx.signals.after_complete_column_ref, true)
    })

    it('partial ORDER BY prefix is not complete (still pick column)', () => {
        const sql = 'SELECT * FROM flink_job ORDER BY c'
        const ctx = analyzeSqlCompletionContext(sql, sql.length, ['flink_job'], {
            flink_job: [{name: 'create_time'}, {name: 'id'}, {name: 'status'}],
        })
        assert.equal(ctx.slot, 'order_by')
        assert.equal(ctx.signals.after_complete_column_ref, false)
        assert.equal(ctx.signals.order_by_after_column, false)
    })

    it('does not trigger after ASC', () => {
        const sql = 'SELECT status FROM orders ORDER BY status ASC'
        const offset = sql.length
        const ctx = analyzeSqlCompletionContext(sql, offset, ['orders'], {
            orders: [{name: 'status'}],
        })
        assert.equal(ctx.signals.after_complete_column_ref, false)
    })
})

describe('group_by slot', () => {
    it('uses group_by slot after GROUP BY marker', () => {
        const sql = 'SELECT status, COUNT(*) cnt FROM orders GROUP BY '
        const offset = sql.length
        const ctx = analyzeSqlCompletionContext(sql, offset, ['orders'], {
            orders: [{name: 'status'}],
        })
        assert.equal(ctx.slot, 'group_by')
    })
})
