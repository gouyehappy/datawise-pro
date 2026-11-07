import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    aiActionAllowsEmptyPrompt,
    resolveAiDefaultPrompt,
} from '../ai/actions.ts'
import {
    buildAiExplanationBlock,
    planAiBlockInsert,
} from '../ai/format-ai-insert.ts'
import {buildSqlAiMessages} from '../ai/build-sql-prompt.ts'

const SCHEMA = {
    tables: ['users'],
    columns: {users: [{name: 'id', type: 'int', pk: true}, {name: 'name', type: 'varchar'}]},
}

describe('ai/actions', () => {
    it('explain and optimize allow empty user prompt', () => {
        assert.equal(aiActionAllowsEmptyPrompt('explain'), true)
        assert.equal(aiActionAllowsEmptyPrompt('optimize'), true)
        assert.equal(aiActionAllowsEmptyPrompt('generate'), false)
        assert.equal(aiActionAllowsEmptyPrompt('fix'), false)
    })

    it('resolveAiDefaultPrompt returns locale-specific defaults', () => {
        assert.match(resolveAiDefaultPrompt('explain', 'zh-CN'), /解释/)
        assert.match(resolveAiDefaultPrompt('explain', 'en'), /Explain/i)
    })
})

describe('ai/build-sql-prompt actions', () => {
    it('fix mode puts error in user message', () => {
        const messages = buildSqlAiMessages({
            action: 'fix',
            prompt: 'Unknown column foo',
            schema: SCHEMA,
            selection: 'SELECT foo FROM users',
            dialect: 'mysql',
        })
        assert.match(messages[1]!.content, /Unknown column foo/)
        assert.match(messages[1]!.content, /SELECT foo FROM users/)
    })

    it('explain mode asks for prose in Chinese', () => {
        const messages = buildSqlAiMessages({
            action: 'explain',
            prompt: 'focus on join',
            schema: SCHEMA,
            selection: 'SELECT * FROM users',
            locale: 'zh-CN',
        })
        assert.match(messages[0]!.content, /Simplified Chinese/)
    })

    it('mock mode requests INSERT statements', () => {
        const messages = buildSqlAiMessages({
            action: 'mock',
            prompt: '3 rows for users',
            schema: SCHEMA,
        })
        assert.match(messages[0]!.content, /INSERT statements/)
    })
})

describe('format-ai-insert explanation', () => {
    it('buildAiExplanationBlock wraps lines as SQL comments', () => {
        const block = buildAiExplanationBlock('explain joins', 'Line one\nLine two')
        assert.match(block, /^-- AI: explain joins/)
        assert.match(block, /-- Line one/)
        assert.match(block, /-- Line two/)
    })

    it('planAiBlockInsert reuses empty-line placement', () => {
        const sql = 'SELECT 1;\n\nSELECT 2;'
        const plan = planAiBlockInsert(sql, 2, '-- AI: x\n-- note')
        const line = plan.insertLines.join('\n')
        assert.match(line, /^-- AI: x/)
    })
})
