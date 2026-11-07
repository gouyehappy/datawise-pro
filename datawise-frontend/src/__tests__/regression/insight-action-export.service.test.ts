import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    buildInsightActionBody,
    buildInsightActionFromAiMessage,
} from '@/features/ai/analysis/services/insight-action-export.service'

describe('insight action export service', () => {
    it('builds title from first reply line and appends fenced sql', () => {
        const request = buildInsightActionFromAiMessage({
            reply: 'Negative order amounts need review.\n\nSee query below.',
            sql: 'SELECT * FROM orders WHERE amount < 0',
            sessionId: 'sess-1',
        })

        assert.equal(request.title, 'Negative order amounts need review.')
        assert.match(request.body, /Negative order amounts need review\./)
        assert.match(request.body, /```sql\nSELECT \* FROM orders WHERE amount < 0\n```/)
        assert.deepEqual(request.data, {
            source: 'ai-workbench',
            mode: 'analysis',
            sessionId: 'sess-1',
        })
    })

    it('uses default title when reply is empty', () => {
        const request = buildInsightActionFromAiMessage({
            reply: '   \n  ',
            sql: 'SELECT 1',
            defaultTitle: 'Custom default',
        })

        assert.equal(request.title, 'Custom default')
        assert.equal(request.body, '```sql\nSELECT 1\n```')
    })

    it('does not duplicate sql already present in reply', () => {
        const reply = 'Summary\n\n```sql\nSELECT 1\n```'
        assert.equal(
            buildInsightActionBody(reply, 'SELECT 1'),
            reply,
        )
    })

    it('truncates long first lines for title', () => {
        const longLine = 'x'.repeat(150)
        const request = buildInsightActionFromAiMessage({
            reply: `${longLine}\nsecond line`,
        })

        assert.equal(request.title.length, 120)
        assert.match(request.title, /…$/)
    })

    it('omits sessionId from data when absent', () => {
        const request = buildInsightActionFromAiMessage({
            reply: 'Insight summary',
        })

        assert.deepEqual(request.data, {
            source: 'ai-workbench',
            mode: 'analysis',
        })
    })
})
