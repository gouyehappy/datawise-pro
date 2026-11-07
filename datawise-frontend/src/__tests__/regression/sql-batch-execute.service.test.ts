import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import type {QueryResultItem} from '@/features/workspace/types'
import {
    appendStreamingBatchSummary,
    buildStreamingProgressSnapshot,
    createStreamingBatchSummary,
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

const labels = {
    summaryLabel: 'Overview',
    resultTabLabel: (_index: number, item: QueryResultItem) => item.label,
}

describe('buildStreamingProgressSnapshot', () => {
    it('keeps summary-only progress while all statements are non-grid', () => {
        let summary = createStreamingBatchSummary(2, 'batch-1', labels)
        const items = [ddlItem(0, 'DROP TABLE a')]
        summary = appendStreamingBatchSummary(summary, items[0], 0, labels)

        const snapshot = buildStreamingProgressSnapshot(items, summary)
        assert.equal(snapshot.length, 1)
        assert.equal(snapshot[0]?.batchRunning, true)
        assert.equal(snapshot[0]?.batchEntries?.length, 1)
    })

    it('streams completed result tabs once a grid appears', () => {
        let summary = createStreamingBatchSummary(2, 'batch-2', labels)
        const items = [selectItem(0)]
        summary = appendStreamingBatchSummary(summary, items[0], 0, labels)

        const afterFirst = buildStreamingProgressSnapshot(items, summary)
        assert.equal(afterFirst.length, 2)
        assert.equal(afterFirst[0]?.columns?.length, 1)
        assert.equal(afterFirst[1]?.batchRunning, true)

        items.push(selectItem(1))
        summary = appendStreamingBatchSummary(summary, items[1], 1, labels)
        const afterSecond = buildStreamingProgressSnapshot(items, summary)
        assert.equal(afterSecond.length, 3)
        assert.equal(afterSecond[2]?.batchRunning, true)
        assert.equal(afterSecond[2]?.batchEntries?.length, 2)
    })
})
