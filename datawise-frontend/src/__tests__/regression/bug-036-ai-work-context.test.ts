import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    buildAiWorkContext,
    formatAiFixPrompt,
} from '@/features/ai/work-context/ai-work-context.service'
import {replaceConsoleSqlStatement} from '@/features/workspace/services/console-sql-replace.service'

describe('ai-work-context.service', () => {
    it('builds fix prompt with sql and database error', () => {
        const context = buildAiWorkContext({
            connectionId: 'c1',
            database: 'app',
            sql: 'SELECT * FORM users',
            lastError: 'syntax error at FORM',
        })
        const prompt = formatAiFixPrompt(context)
        assert.match(prompt, /Fix the following SQL/)
        assert.match(prompt, /SELECT \* FORM users/)
        assert.match(prompt, /syntax error at FORM/)
    })

    it('prefers selection over full sql in prompt', () => {
        const context = buildAiWorkContext({
            sql: 'SELECT 1',
            selection: 'SELECT bad',
            lastError: 'column missing',
        })
        const prompt = formatAiFixPrompt(context)
        assert.match(prompt, /SELECT bad/)
        assert.doesNotMatch(prompt, /SELECT 1/)
    })
})

describe('console-sql-replace.service', () => {
    it('replaces failed statement in document', () => {
        const doc = 'SELECT 1;\nSELECT bad;\nSELECT 3;'
        const {text, focusLine} = replaceConsoleSqlStatement(doc, 'SELECT bad;', 'SELECT fixed;')
        assert.equal(text, 'SELECT 1;\nSELECT fixed;\nSELECT 3;')
        assert.equal(focusLine, 2)
    })
})
