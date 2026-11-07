import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {analyzeSqlCompletionContext} from '../completion/context.ts'
import {resolveCompletionPlan} from '../completion/grammar/index.ts'
import {resolveAiAssistScenarios, matchesAiAssistPrefix} from '../ai/completion-scenarios.ts'
import {shouldRunCollector} from '../completion/policy/collector-gate.ts'
import {buildSnapshot} from '../completion/core/snapshot.ts'

const TABLES = ['orders', 'users']
const COLUMNS = {
    orders: [{name: 'id'}, {name: 'status'}],
    users: [{name: 'id'}],
}

describe('ai/completion-scenarios', () => {
    it('matchesAiAssistPrefix accepts empty and ai prefix', () => {
        assert.equal(matchesAiAssistPrefix(''), true)
        assert.equal(matchesAiAssistPrefix('ai'), true)
        assert.equal(matchesAiAssistPrefix('a'), true)
        assert.equal(matchesAiAssistPrefix('where'), false)
    })

    it('after FROM table+alias suggests clause-next AI', () => {
        const sql = 'SELECT * FROM orders t1 '
        const ctx = analyzeSqlCompletionContext(sql, sql.length, TABLES, COLUMNS)
        const plan = resolveCompletionPlan(ctx)
        const scenarios = resolveAiAssistScenarios(ctx, plan, {
            hasSelection: false,
            locale: 'zh-CN',
        })
        assert.ok(scenarios.some((item) => item.id === 'ai-clause-next'))
    })

    it('selection adds explain and optimize scenarios', () => {
        const sql = 'SELECT * FROM orders'
        const ctx = analyzeSqlCompletionContext(sql, sql.length, TABLES, COLUMNS)
        const plan = resolveCompletionPlan(ctx)
        const scenarios = resolveAiAssistScenarios(ctx, plan, {
            hasSelection: true,
            locale: 'en',
        })
        assert.ok(scenarios.some((item) => item.action === 'explain'))
        assert.ok(scenarios.some((item) => item.action === 'optimize'))
    })

    it('aiAssist collector stays off when AI is not configured', () => {
        const sql = 'SELECT * FROM orders t1 '
        const ctx = analyzeSqlCompletionContext(sql, sql.length, TABLES, COLUMNS)
        const snapshot = buildSnapshot(sql, sql.length, ctx, {
            parserKeywords: ['WHERE', 'LEFT JOIN'],
        })
        assert.equal(shouldRunCollector('aiAssist', snapshot.plan, ctx, ''), false)
    })
})
