import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    applyAiSqlInsertPlan,
    buildAiSqlBlock,
    planAiSqlInsert,
} from '../ai/format-ai-insert.ts'

describe('format-ai-insert', () => {
    it('buildAiSqlBlock adds comment header', () => {
        const block = buildAiSqlBlock('top users', 'SELECT 1')
        assert.match(block, /^-- AI: top users\nSELECT 1$/)
    })

    it('inserts on empty line at cursor', () => {
        const sql = 'SELECT 1;\n\nSELECT 2;'
        const plan = planAiSqlInsert(sql, 2, 'count users', 'SELECT COUNT(*) FROM users')
        const next = applyAiSqlInsertPlan(sql, plan)
        assert.match(next, /-- AI: count users\nSELECT COUNT\(\*\) FROM users/)
        assert.match(next, /SELECT 1;\n-- AI/)
        assert.match(next, /SELECT 2;/)
    })

    it('appends when no empty line below cursor', () => {
        const sql = 'SELECT 1;'
        const plan = planAiSqlInsert(sql, 1, 'orders', 'SELECT * FROM orders')
        assert.equal(plan.append, true)
        const next = applyAiSqlInsertPlan(sql, plan)
        assert.match(next, /SELECT 1;\n\n-- AI: orders\nSELECT \* FROM orders/)
    })

    it('uses first line when editor is empty', () => {
        const plan = planAiSqlInsert('', 1, 'hello', 'SELECT 1')
        const next = applyAiSqlInsertPlan('', plan)
        assert.equal(next, '-- AI: hello\nSELECT 1')
    })
})
