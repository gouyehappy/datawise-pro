import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {expandExecuteSqlResults} from '@/features/workspace/services/expand-execute-sql-results'
import type {ExecuteSqlResult} from '@/shared/api/types'

function leaf(partial: Partial<ExecuteSqlResult> & Pick<ExecuteSqlResult, 'sql' | 'rowCount'>): ExecuteSqlResult {
    return {
        durationMs: 5,
        columns: [],
        rows: [],
        ...partial,
    }
}

describe('T-MULTI-1 expandExecuteSqlResults', () => {
    it('returns single result unchanged when resultSets absent', () => {
        const result = leaf({sql: 'select 1', rowCount: 1})
        assert.deepEqual(expandExecuteSqlResults(result), [result])
    })

    it('expands multi resultSets into separate tabs', () => {
        const a = leaf({sql: 'call multi()', rowCount: 1, columns: [{key: 'c1', name: 'c1', type: 'INT'} as never]})
        const b = leaf({sql: 'call multi()', rowCount: 0})
        const envelope = leaf({
            sql: 'call multi()',
            rowCount: 1,
            resultSets: [a, b],
        })
        const expanded = expandExecuteSqlResults(envelope)
        assert.equal(expanded.length, 2)
        assert.equal(expanded[0].rowCount, 1)
        assert.equal(expanded[1].rowCount, 0)
        assert.equal(expanded[0].resultSets, undefined)
    })
})
