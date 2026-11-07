import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    appendAiTableMention,
    buildAiPromptWithTableContext,
    extractAiTableMentions,
} from '@/features/workspace/services/ai-table-mention.service'

describe('ai-table-mention.service', () => {
    it('extracts unique @table mentions', () => {
        assert.deepEqual(
            extractAiTableMentions('join @orders with @users and @orders again'),
            ['orders', 'users'],
        )
    })

    it('appends mention without duplicating', () => {
        assert.equal(appendAiTableMention('', 'orders'), '@orders ')
        assert.equal(appendAiTableMention('@orders last week', 'orders'), '@orders last week')
        assert.equal(appendAiTableMention('count rows', 'users'), 'count rows @users ')
    })

    it('prefixes prompt with table context', () => {
        assert.equal(
            buildAiPromptWithTableContext('last 7 days', ['orders', 'users']),
            'Tables in context: orders, users.\nlast 7 days',
        )
        assert.equal(buildAiPromptWithTableContext('hello', []), 'hello')
    })
})
