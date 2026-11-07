import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {analyzeSqlCompletionContext} from '../completion/context.ts'
import {resolveCompletionPlan} from '../completion/grammar/index.ts'

describe('completion/plan', () => {
    it('resolveCompletionPlan 产出 stage 与 collectors', () => {
        const sql = 'SELECT * FROM '
        const ctx = analyzeSqlCompletionContext(sql, sql.length, ['t1'], {t1: [{name: 'id'}]})
        const plan = resolveCompletionPlan(ctx)
        assert.equal(plan.stage, 'table.pick')
        assert.ok(plan.collectors.includes('tables'))
    })
})
