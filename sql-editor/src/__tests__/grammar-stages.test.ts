import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {analyzeSqlCompletionContext} from '../completion/context.ts'
import {resolveCompletionStageFromGrammar} from '../completion/grammar/engine/index.ts'
import {resolveCompletionPlan} from '../completion/grammar/index.ts'

const TABLES = ['cdp_tag', 'cdp_segment', 'users']
const COLUMNS = {
    cdp_tag: [{name: 'id'}, {name: 'tag_name'}],
    cdp_segment: [{name: 'tag_ids'}],
    users: [{name: 'status'}],
}

function at(sql: string, marker = '|') {
    const offset = sql.indexOf(marker)
    const clean = sql.replace(marker, '')
    const ctx = analyzeSqlCompletionContext(clean, offset, TABLES, COLUMNS)
    const plan = resolveCompletionPlan(ctx)
    const stage = resolveCompletionStageFromGrammar(ctx)
    return {ctx, plan, stage, clean}
}

describe('grammar stages', () => {
    it('FROM 空 → table.pick', () => {
        const {stage, plan} = at('SELECT * FROM |')
        assert.equal(stage, 'table.pick')
        assert.equal(plan.collectors.includes('tables'), true)
    })

    it('ON 后 → predicate.pick_fk_on_column', () => {
        const {stage} = at('SELECT * FROM t1 JOIN t2 ON |')
        assert.equal(stage, 'predicate.pick_fk_on_column')
    })

    it('WHERE 字符串条件 + grou → predicate.after_where_complete', () => {
        const {stage, plan} = at(
            "SELECT * FROM cdp_tag t1 WHERE 1=1 AND t1.tag_name = 'test' grou|",
        )
        assert.equal(stage, 'predicate.after_where_complete')
        assert.equal(plan.keywordSlot, 'after_where')
    })

    it('WHERE 复合 AND 后 → predicate.after_where_complete', () => {
        const {stage} = at(
            'SELECT * FROM cdp_tag t1 WHERE 1=1 AND t1.id = 123 |',
        )
        assert.equal(stage, 'predicate.after_where_complete')
    })

    it('GROUP BY 后 → group_by.pick_column，仅列', () => {
        const {stage, plan} = at('SELECT status FROM orders GROUP BY |')
        assert.equal(stage, 'group_by.pick_column')
        assert.equal(plan.collectors.includes('keywords'), false)
        assert.equal(plan.keywordPhase, 'none')
    })

    it('GROUP BY 列写完后 → group_by.clause_next', () => {
        const {stage, plan} = at('SELECT status FROM orders GROUP BY status |')
        assert.equal(stage, 'group_by.clause_next')
        assert.equal(plan.keywordSlot, 'after_group_by')
        assert.equal(plan.collectors.includes('keywords'), true)
    })

    it('GROUP BY 逗号后 → group_by.after_comma', () => {
        const {stage, plan} = at('SELECT status, cnt FROM orders GROUP BY status, |')
        assert.equal(stage, 'group_by.after_comma')
        assert.equal(plan.collectors.includes('keywords'), false)
    })

    it('ORDER BY 后 → order_by.pick_column，仅列', () => {
        const {stage, plan} = at('SELECT status FROM orders ORDER BY |')
        assert.equal(stage, 'order_by.pick_column')
        assert.equal(plan.collectors.includes('keywords'), false)
    })

    it('ORDER BY 部分前缀 → 仍 pick_column，不进 ASC/DESC', () => {
        const {stage, plan, ctx} = at('SELECT * FROM cdp_tag ORDER BY c|')
        assert.equal(ctx.slot, 'order_by')
        assert.equal(stage, 'order_by.pick_column')
        assert.equal(plan.collectors.includes('columns'), true)
        assert.equal(plan.collectors.includes('keywords'), false)
        assert.equal(ctx.signals.order_by_after_column, false)
    })

    it('SELECT COUNT 后 → select_list.after_aggregate', () => {
        const {stage, plan} = at('SELECT status, COUNT|')
        assert.equal(stage, 'select_list.after_aggregate')
        assert.equal(plan.collectors.includes('columns'), false)
        assert.equal(plan.keywordSlot, 'select_aggregate')
    })
})
