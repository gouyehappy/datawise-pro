import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    appendCursorRowsWithWindow,
    mergeCursorPageIntoQueryResult,
} from '@/features/workspace/services/query-result-cursor.service'
import {CURSOR_LOADED_ROWS_MAX} from '@/features/workspace/constants/query-result-limits'
import type {QueryResultItem} from '@/features/workspace/types'

function makeRow(id: number) {
    return {id: String(id), values: {n: id}}
}

function baseItem(rows: ReturnType<typeof makeRow>[]): QueryResultItem {
    return {
        id: 'r1',
        label: 'Result 1',
        sql: 'SELECT 1',
        columns: [{name: 'n', type: 'int'}],
        rows,
        total: rows.length,
        durationMs: 1,
        status: 'success',
        cursorId: 'c1',
        hasMore: true,
    }
}

describe('query-result-cursor.service', () => {
    it('appendCursorRowsWithWindow keeps rows when below max', () => {
        const existing = [makeRow(1), makeRow(2)]
        const page = [makeRow(3)]
        const result = appendCursorRowsWithWindow(existing, page)
        assert.equal(result.rows.length, 3)
        assert.equal(result.trimmedTotal, 0)
    })

    it('appendCursorRowsWithWindow drops oldest rows when above max', () => {
        const existing = Array.from({length: CURSOR_LOADED_ROWS_MAX}, (_, i) => makeRow(i))
        const page = [makeRow(99_999), makeRow(100_000)]
        const result = appendCursorRowsWithWindow(existing, page)
        assert.equal(result.rows.length, CURSOR_LOADED_ROWS_MAX)
        assert.equal(result.trimmedTotal, 2)
        assert.equal(result.rows[0]?.values.n, 2)
        assert.equal(result.rows.at(-1)?.values.n, 100_000)
    })

    it('mergeCursorPageIntoQueryResult tracks fetched total and trimmed rows', () => {
        const item = baseItem(Array.from({length: CURSOR_LOADED_ROWS_MAX}, (_, i) => makeRow(i)))
        item.cursorTrimmedRows = 5
        const merged = mergeCursorPageIntoQueryResult(item, {
            columns: item.columns,
            rows: [makeRow(200_000)],
            durationMs: 2,
            cursorId: 'c2',
            hasMore: true,
            sql: 'SELECT 1',
            rowCount: 1,
        })
        assert.equal(merged.rows.length, CURSOR_LOADED_ROWS_MAX)
        assert.equal(merged.total, CURSOR_LOADED_ROWS_MAX + 1)
        assert.equal(merged.cursorTrimmedRows, 6)
        assert.equal(merged.cursorId, 'c2')
    })

    it('mergeCursorPageIntoQueryResult hardCap stops at maxRows', () => {
        const item = baseItem([makeRow(1), makeRow(2)])
        const merged = mergeCursorPageIntoQueryResult(
            item,
            {
                columns: item.columns,
                rows: [makeRow(3), makeRow(4), makeRow(5)],
                durationMs: 2,
                cursorId: 'c2',
                hasMore: true,
                sql: 'SELECT 1',
                rowCount: 3,
            },
            {maxRows: 4, hardCap: true},
        )
        assert.equal(merged.rows.length, 4)
        assert.equal(merged.hasMore, false)
        assert.equal(merged.cursorId, undefined)
        assert.equal(merged.rows.at(-1)?.values.n, 4)
    })
})
