import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    buildAiWorkContext,
    formatAiFixPrompt,
} from '@/features/ai/work-context/ai-work-context.service'
import {appendConsoleSqlFixAfterStatement} from '@/features/workspace/services/console-sql-replace.service'

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

describe('console-sql-replace.service (append fix)', () => {
    it('appends fix after the failed statement without overwriting other statements', () => {
        const doc = 'SELECT 1;\nSELECT bad;\nSELECT 3;'
        const {text, focusLine} = appendConsoleSqlFixAfterStatement(
            doc,
            'SELECT bad;',
            'SELECT fixed;',
            {commentLabel: 'AI fix'},
        )
        assert.equal(text, 'SELECT 1;\nSELECT bad;\n\n-- AI fix\nSELECT fixed;\nSELECT 3;')
        // 修复 SQL 位于第 5 行：SELECT 1 / SELECT bad / 空行 / 注释 / SELECT fixed
        assert.equal(focusLine, 5)
    })

    it('never overwrites document when failed statement is not found', () => {
        const doc = 'SELECT 1;\nSELECT 2;'
        const {text} = appendConsoleSqlFixAfterStatement(doc, 'NOT IN DOC', 'SELECT fixed;')
        assert.ok(text.startsWith(doc), 'original document must be preserved')
        assert.match(text, /SELECT fixed;$/)
    })

    it('locates statement despite whitespace differences', () => {
        const doc = 'SELECT bad\nFROM t;'
        const {text} = appendConsoleSqlFixAfterStatement(
            doc,
            'SELECT  bad   FROM   t ;',
            'SELECT fixed;',
            {commentLabel: 'AI fix'},
        )
        assert.equal(text, 'SELECT bad\nFROM t;\n\n-- AI fix\nSELECT fixed;')
    })

    it('returns document unchanged for an empty fix', () => {
        const doc = 'SELECT 1;'
        const {text} = appendConsoleSqlFixAfterStatement(doc, 'SELECT 1;', '   ')
        assert.equal(text, doc)
    })
})
