import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import type {QueryResultItem} from '@/features/workspace/types'
import {
    buildQueryResultSummaryPayload,
    computeQueryResultColumnStats,
    formatQueryResultSummaryPrompt,
    QUERY_RESULT_AI_SCHEMA_ONLY_THRESHOLD,
    QUERY_RESULT_AI_SAMPLE_ROWS,
} from '@/features/workspace/services/query-result-ai-summary.service'

function baseResult(overrides: Partial<QueryResultItem> = {}): QueryResultItem {
    return {
        id: 'r1',
        label: 'Result 1',
        sql: 'SELECT id, name FROM users',
        columns: [
            {name: 'id', key: 'id', type: 'INT'},
            {name: 'name', key: 'name', type: 'VARCHAR'},
        ],
        rows: [
            {id: 1, name: 'Alice'},
            {id: 2, name: 'Bob'},
        ],
        total: 2,
        durationMs: 12,
        status: 'success',
        ...overrides,
    }
}

describe('query-result-ai-summary.service', () => {
    it('builds sample payload with row stats', () => {
        const payload = buildQueryResultSummaryPayload(baseResult())
        assert.equal(payload?.mode, 'sample')
        assert.equal(payload?.sampleRows?.length, 2)
        assert.equal(payload?.columns[0]?.nonNullCount, 2)
    })

    it('uses schema_only mode for large result sets', () => {
        const payload = buildQueryResultSummaryPayload(
            baseResult({total: QUERY_RESULT_AI_SCHEMA_ONLY_THRESHOLD + 1}),
        )
        assert.equal(payload?.mode, 'schema_only')
        assert.equal(payload?.sampleRows, undefined)
    })

    it('limits sample rows', () => {
        const rows = Array.from({length: QUERY_RESULT_AI_SAMPLE_ROWS + 5}, (_, index) => ({
            id: index,
            name: `user-${index}`,
        }))
        const payload = buildQueryResultSummaryPayload(baseResult({rows, total: rows.length}))
        assert.equal(payload?.sampleRows?.length, QUERY_RESULT_AI_SAMPLE_ROWS)
    })

    it('computes numeric ranges from sample rows', () => {
        const stats = computeQueryResultColumnStats(
            [{name: 'amount', key: 'amount'}],
            [{amount: 10}, {amount: 25}, {amount: null}],
        )
        assert.equal(stats[0]?.nullCount, 1)
        assert.equal(stats[0]?.numericMin, 10)
        assert.equal(stats[0]?.numericMax, 25)
    })

    it('formats prompt with locale hint', () => {
        const payload = buildQueryResultSummaryPayload(baseResult())
        assert.ok(payload)
        const prompt = formatQueryResultSummaryPrompt(payload, 'zh-CN')
        assert.match(prompt, /Chinese/)
        assert.match(prompt, /SELECT id, name FROM users/)
    })
})
