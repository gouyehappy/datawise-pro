import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {detectAfterSelectAggregateKeyword} from '../completion/grammar/transitions/select-list.ts'
import {filterColumnsForCompletion} from '../completion/schema-column-index.ts'
import {analyzeSqlCompletionContext} from '../completion/context.ts'
import {resolveCompletionPlan} from '../completion/grammar/index.ts'
import {resolveCompletionStageFromGrammar} from '../completion/grammar/engine/index.ts'

describe('select-list-tail', () => {
    it('detects COUNT after comma', () => {
        assert.equal(
            detectAfterSelectAggregateKeyword('SELECT tag_name, COUNT', 'select_list'),
            true,
        )
    })

    it('does not trigger after COUNT(', () => {
        assert.equal(
            detectAfterSelectAggregateKeyword('SELECT COUNT(', 'select_list'),
            false,
        )
    })
})

describe('column prefix — no substring bleed', () => {
    it('COUNT prefix does not match user_count', () => {
        const cols = [{name: 'tag_name'}, {name: 'user_count'}, {name: 'count_id'}]
        const filtered = filterColumnsForCompletion(cols, 'COUNT')
        assert.deepEqual(filtered.map((c) => c.name), ['count_id'])
    })
})

describe('COUNT keyword stage', () => {
    it('after COUNT → select_list.after_aggregate with ( only', () => {
        const sql = 'SELECT ct.tag_name, COUNT'
        const ctx = analyzeSqlCompletionContext(sql, sql.length, ['cdp_tag'], {
            cdp_tag: [{name: 'tag_name'}, {name: 'user_count'}],
        })
        assert.equal(ctx.signals.after_select_aggregate, true)
        assert.equal(resolveCompletionStageFromGrammar(ctx), 'select_list.after_aggregate')
        const plan = resolveCompletionPlan(ctx)
        assert.equal(plan.collectors.includes('columns'), false)
        assert.equal(plan.keywordSlot, 'select_aggregate')
    })
})

describe('ON complete + WH', () => {
    it('keywords only, no columns', () => {
        const sql =
            'SELECT ct.tag_name, COUNT FROM cdp_tag ct LEFT JOIN cdp_segment cs ON ct.id = cs.tag_ids WH'
        const ctx = analyzeSqlCompletionContext(sql, sql.length, ['cdp_tag', 'cdp_segment'], {
            cdp_tag: [{name: 'tag_name'}],
            cdp_segment: [{name: 'tag_ids'}, {name: 'user_count'}],
        })
        const plan = resolveCompletionPlan(ctx)
        assert.equal(plan.collectors.includes('columns'), false)
        assert.equal(resolveCompletionStageFromGrammar(ctx), 'predicate.after_on_complete')
    })
})
