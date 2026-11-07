import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    collectConsoleCursorIds,
    collectCursorIdsFromResults,
    releaseSqlCursorsBestEffort,
} from '@/features/workspace/services/sql-cursor-release.service'
import type {ConsoleQueryState, QueryResultItem} from '@/features/workspace/types'

function item(partial: Partial<QueryResultItem>): QueryResultItem {
    return {
        id: 'r1',
        label: 'Result',
        sql: 'select 1',
        columns: [],
        rows: [],
        total: 0,
        durationMs: 0,
        status: 'success',
        ...partial,
    }
}

describe('sql-cursor-release.service', () => {
    it('collects non-blank cursor ids from console state', () => {
        const state: ConsoleQueryState = {
            activeView: 0,
            results: [
                item({cursorId: 'c1'}),
                item({cursorId: '  '}),
                item({cursorId: 'c2'}),
                item({}),
            ],
        }
        assert.deepEqual(collectConsoleCursorIds(state), ['c1', 'c2'])
        assert.deepEqual(collectCursorIdsFromResults(state.results.slice(0, 1)), ['c1'])
    })

    it('releaseSqlCursorsBestEffort invokes close for each id', async () => {
        const seen: string[] = []
        releaseSqlCursorsBestEffort(['a', 'b'], async (id) => {
            seen.push(id)
        })
        await Promise.resolve()
        assert.deepEqual(seen, ['a', 'b'])
    })
})
