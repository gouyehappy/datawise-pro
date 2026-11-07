import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {analyzeSqlCompletionContext} from '../completion/context.ts'
import {resolveCompletionPlan} from '../completion/grammar/index.ts'
import {setSqlCompletionDialect} from '../completion/keyword-config.ts'

describe('completion keyword fallback', () => {
    it('uses format keywords when parser keywords are missing', () => {
        setSqlCompletionDialect('postgresql')
        const ctx = analyzeSqlCompletionContext('SELECT |'.replace('|', ''), 6, ['orders'], {
            orders: [{name: 'id'}],
        })
        const plan = resolveCompletionPlan(ctx, {parserKeywords: undefined})
        assert.ok(plan.parserKeywords?.includes('SELECT'))
        assert.ok(plan.parserKeywords?.includes('FROM'))
    })

    it('starrocks dialect resolves to mysql keyword file', () => {
        setSqlCompletionDialect('starrocks')
        const ctx = analyzeSqlCompletionContext('', 0, [], {})
        const plan = resolveCompletionPlan(ctx, {parserKeywords: []})
        assert.ok((plan.parserKeywords?.length ?? 0) > 0)
    })
})
