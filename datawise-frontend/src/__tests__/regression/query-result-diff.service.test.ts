import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import type {QueryResultItem} from '@/features/workspace/types'
import {
    buildQueryResultDiff,
    canCompareQueryResults,
} from '@/features/workspace/services/query-result-diff.service'

function result(partial: Partial<QueryResultItem> & Pick<QueryResultItem, 'label'>): QueryResultItem {
    return {
        id: partial.id ?? partial.label,
        sql: partial.sql ?? 'SELECT 1',
        columns: partial.columns ?? [{name: 'id', key: 'id'}],
        rows: partial.rows ?? [],
        total: partial.total ?? partial.rows?.length ?? 0,
        durationMs: partial.durationMs ?? 1,
        status: partial.status ?? 'success',
        ...partial,
    }
}

describe('query-result-diff.service', () => {
    it('allows diff only for comparable grid results', () => {
        const prev = result({label: 'Result 1', rows: [{id: 1}]})
        const curr = result({label: 'Result 2', rows: [{id: 2}]})
        assert.equal(canCompareQueryResults(prev, curr), true)
        assert.equal(canCompareQueryResults(prev, result({label: 'Err', status: 'error'})), false)
        assert.equal(canCompareQueryResults(undefined, curr), false)
    })

    it('detects modified cells by row index', () => {
        const baseline = result({
            label: 'Result 1',
            columns: [{name: 'id', key: 'id'}, {name: 'name', key: 'name'}],
            rows: [{id: 1, name: 'Alice'}, {id: 2, name: 'Bob'}],
        })
        const current = result({
            label: 'Result 2',
            columns: [{name: 'id', key: 'id'}, {name: 'name', key: 'name'}],
            rows: [{id: 1, name: 'Alice'}, {id: 2, name: 'Bobby'}],
        })

        const diff = buildQueryResultDiff(baseline, current)
        assert.equal(diff.summary.modifiedRows, 1)
        assert.equal(diff.summary.changedCells, 1)
        assert.equal(diff.rows[1]?.cells.name?.status, 'modified')
        assert.equal(diff.rows[0]?.cells.name?.status, 'unchanged')
    })

    it('marks added and removed rows', () => {
        const baseline = result({
            label: 'Result 1',
            rows: [{id: 1}, {id: 2}],
        })
        const current = result({
            label: 'Result 2',
            rows: [{id: 1}, {id: 2}, {id: 3}],
        })
        const diff = buildQueryResultDiff(baseline, current)
        assert.equal(diff.summary.addedRows, 1)
        assert.equal(diff.rows[2]?.rowStatus, 'added')

        const shrink = buildQueryResultDiff(current, baseline)
        assert.equal(shrink.summary.removedRows, 1)
        assert.equal(shrink.rows[2]?.rowStatus, 'removed')
    })

    it('caps compared rows when maxCompareRows is set', () => {
        const baseline = result({
            label: 'Result 1',
            rows: Array.from({length: 50}, (_, i) => ({id: i})),
        })
        const current = result({
            label: 'Result 2',
            rows: Array.from({length: 50}, (_, i) => ({id: i + 1})),
        })
        const diff = buildQueryResultDiff(baseline, current, {maxCompareRows: 10})
        assert.equal(diff.rows.length, 10)
    })
})
