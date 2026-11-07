import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    closeAllConsoleQueryResults,
    closeConsoleQueryResult,
    closeConsoleQueryResultsToLeft,
    closeConsoleQueryResultsToRight,
    closeOtherConsoleQueryResults,
    getConsoleQueryState,
    renameConsoleQueryResult,
    setConsoleQueryResults,
} from '@/features/workspace/services/workspace-query-results.service'
import type {QueryResultItem} from '@/features/workspace/types/query-result'

const resolveLabel = (_item: QueryResultItem, index: number) => `R${index + 1}`
const seal = (item: QueryResultItem) => item
const fallbackLabel = (n: number) => `Result ${n}`

function result(id: string, label: string): QueryResultItem {
    return {
        id,
        label,
        sql: 'select 1',
        columns: [],
        rows: [],
        total: 0,
        durationMs: 0,
        status: 'success',
    }
}

function stateWith(items: QueryResultItem[]) {
    const state = {}
    setConsoleQueryResults(state, 't1', items, {seal, fallbackLabel})
    return state
}

describe('workspace-query-results.service', () => {
    it('sets results and selects the last view', () => {
        const state = stateWith([result('r1', 'A'), result('r2', 'B'), result('r3', 'C')])
        assert.equal(state.t1.results.length, 3)
        assert.equal(state.t1.activeView, 2)
    })

    it('returns a stable empty state per tab', () => {
        const state = {}
        const first = getConsoleQueryState(state, 't1')
        assert.deepEqual(first, {results: [], activeView: -1})
        assert.equal(getConsoleQueryState(state, 't1'), first)
    })

    it('closeConsoleQueryResult re-targets the active view', () => {
        const state = stateWith([result('r1', 'A'), result('r2', 'B'), result('r3', 'C')])
        closeConsoleQueryResult(state, 't1', 1, resolveLabel)
        assert.deepEqual(state.t1.results.map((item: QueryResultItem) => item.id), ['r1', 'r3'])
        assert.equal(state.t1.activeView, 1)
    })

    it('keeps only the target when closing others', () => {
        const state = stateWith([result('r1', 'A'), result('r2', 'B'), result('r3', 'C')])
        closeOtherConsoleQueryResults(state, 't1', 1, resolveLabel)
        assert.deepEqual(state.t1.results.map((item: QueryResultItem) => item.id), ['r2'])
        assert.equal(state.t1.activeView, 0)
    })

    it('closes results to the left and right', () => {
        const left = stateWith([result('r1', 'A'), result('r2', 'B'), result('r3', 'C')])
        closeConsoleQueryResultsToLeft(left, 't1', 2, resolveLabel)
        assert.deepEqual(left.t1.results.map((item: QueryResultItem) => item.id), ['r3'])
        assert.equal(left.t1.activeView, 0)

        const right = stateWith([result('r1', 'A'), result('r2', 'B'), result('r3', 'C')])
        closeConsoleQueryResultsToRight(right, 't1', 0, resolveLabel)
        assert.deepEqual(right.t1.results.map((item: QueryResultItem) => item.id), ['r1'])
        assert.equal(right.t1.activeView, 0)
    })

    it('renames with trim and rejects blanks or missing results', () => {
        const state = stateWith([result('r1', 'A')])
        assert.equal(renameConsoleQueryResult(state, 't1', 0, '  New  '), true)
        assert.equal(state.t1.results[0]?.label, 'New')
        assert.equal(renameConsoleQueryResult(state, 't1', 0, '   '), false)
        assert.equal(renameConsoleQueryResult(state, 't1', 9, 'X'), false)
    })

    it('clears all results and resets the view', () => {
        const state = stateWith([result('r1', 'A'), result('r2', 'B')])
        closeAllConsoleQueryResults(state, 't1')
        assert.equal(state.t1.results.length, 0)
        assert.equal(state.t1.activeView, -1)
    })
})
