import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import type {QueryResultItem} from '@/features/workspace/types'
import {
    appendStreamingBatchSummary,
    buildCollapsedBatchSummary,
    createStreamingBatchSummary,
    finishStreamingBatchSummary,
    isNonGridResult,
    shouldCollapseBatchResults,
} from '@/features/workspace/services/query-result-batch.utils'

function ddlItem(index: number, sql: string): QueryResultItem {
    return {
        id: `result-${index}`,
        label: `Result ${index + 1}`,
        sql,
        columns: [],
        rows: [],
        total: 0,
        durationMs: 10,
        status: 'success',
    }
}

function selectItem(index: number): QueryResultItem {
    return {
        id: `result-${index}`,
        label: `Result ${index + 1}`,
        sql: 'SELECT 1',
        columns: [{name: '1', type: 'INT'}],
        rows: [[1]],
        total: 1,
        durationMs: 5,
        status: 'success',
    }
}

describe('query-result-batch.service', () => {
    it('treats DDL success and errors as non-grid', () => {
        assert.equal(isNonGridResult(ddlItem(0, 'DROP TABLE t')), true)
        assert.equal(
            isNonGridResult({
                ...ddlItem(0, 'BAD'),
                status: 'error',
                errorMessage: 'fail',
            }),
            true,
        )
        assert.equal(isNonGridResult(selectItem(0)), false)
    })

    it('collapses multiple non-grid results into one summary tab', () => {
        const items = [ddlItem(0, 'DROP TABLE a'), ddlItem(1, 'CREATE TABLE a')]
        assert.equal(shouldCollapseBatchResults(items), true)

        const collapsed = buildCollapsedBatchSummary(items, {
            summaryLabel: 'Overview',
            resultTabLabel: (_index, item) => item.label,
        })
        assert.equal(collapsed.length, 1)
        assert.equal(collapsed[0]?.batchEntries?.length, 2)
        assert.equal(collapsed[0]?.durationMs, 20)
        assert.equal(collapsed[0]?.status, 'success')
    })

    it('does not collapse when any statement returns a grid', () => {
        const items = [ddlItem(0, 'DROP TABLE a'), selectItem(1)]
        assert.equal(shouldCollapseBatchResults(items), false)
        assert.equal(items.length, 2)
    })

    it('marks summary as error when a statement failed', () => {
        const items = [
            ddlItem(0, 'DROP TABLE a'),
            {
                ...ddlItem(1, 'CREATE TABLE a'),
                status: 'error' as const,
                errorMessage: 'already exists',
                errorLine: 12,
            },
        ]
        const collapsed = buildCollapsedBatchSummary(items, {
            summaryLabel: 'Overview',
            resultTabLabel: (_index, item) => item.label,
        })
        assert.equal(collapsed[0]?.status, 'error')
        assert.equal(collapsed[0]?.errorMessage, 'already exists')
        assert.equal(collapsed[0]?.errorLine, 12)
        assert.equal(collapsed[0]?.batchEntries?.[1]?.status, 'error')
    })

    it('appends streaming batch entries incrementally', () => {
        const batchId = 'batch-test'
        let summary = createStreamingBatchSummary(3, batchId, {
            summaryLabel: 'Overview',
            resultTabLabel: (_index, item) => item.label,
        })
        assert.equal(summary.batchRunning, true)
        assert.equal(summary.label, 'Overview')
        assert.equal(summary.batchEntries?.length, 0)

        summary = appendStreamingBatchSummary(summary, ddlItem(0, 'DROP TABLE a'), 0, {
            summaryLabel: 'Overview',
            resultTabLabel: (_index, item) => item.label,
        })
        assert.equal(summary.batchEntries?.length, 1)
        assert.equal(summary.label, 'Overview')

        summary = finishStreamingBatchSummary(summary, 'Overview')
        assert.equal(summary.batchRunning, false)
        assert.equal(summary.label, 'Overview')
    })
})
