import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    applyGridViewStateToRows,
    cellMatchesFilter,
    clearGridViewState,
    compareCellValues,
    createEmptyGridViewState,
    gridViewStateIsActive,
    moveGridColumnOrder,
    normalizeGridViewState,
    resolveDisplayColumns,
    setGridColumnFilter,
    setGridColumnWidth,
    suggestGridColumnWidth,
    toggleGridSort,
} from '@/features/workspace/services/grid-view-state.service'
import type {TableColumn, TableRow} from '@/core/types'

const columns: TableColumn[] = [
    {name: 'id', key: 'c1', type: 'INT'},
    {name: 'name', key: 'c2', type: 'VARCHAR'},
]

const rows: TableRow[] = [
    {c1: 2, c2: 'beta'},
    {c1: 10, c2: 'alpha'},
    {c1: 1, c2: 'gamma'},
]

describe('grid-view-state.service', () => {
    it('filters rows by column text', () => {
        const state = setGridColumnFilter(createEmptyGridViewState(), 'c2', 'alp')
        const filtered = applyGridViewStateToRows(rows, columns, state)
        assert.equal(filtered.length, 1)
        assert.equal(filtered[0].c2, 'alpha')
    })

    it('sorts rows numerically when direction is asc', () => {
        const state = toggleGridSort(createEmptyGridViewState(), 'c1')
        const sorted = applyGridViewStateToRows(rows, columns, state)
        assert.deepEqual(sorted.map((row) => row.c1), [1, 2, 10])
    })

    it('toggles sort asc → desc → none', () => {
        let state = toggleGridSort(createEmptyGridViewState(), 'c1')
        assert.equal(state.sortDirection, 'asc')
        state = toggleGridSort(state, 'c1')
        assert.equal(state.sortDirection, 'desc')
        state = toggleGridSort(state, 'c1')
        assert.equal(state.sortDirection, null)
        assert.equal(state.sortColumn, null)
    })

    it('supports multi-column sort via Ctrl+click semantics', () => {
        let state = toggleGridSort(createEmptyGridViewState(), 'c2', {multi: true})
        state = toggleGridSort(state, 'c1', {multi: true})
        assert.deepEqual(state.sortSpecs, [
            {column: 'c2', direction: 'asc'},
            {column: 'c1', direction: 'asc'},
        ])
        assert.equal(state.sortColumn, 'c2')
        const rows2: TableRow[] = [
            {c1: 2, c2: 'a'},
            {c1: 1, c2: 'a'},
            {c1: 3, c2: 'b'},
        ]
        assert.deepEqual(
            applyGridViewStateToRows(rows2, columns, state).map((row) => [row.c2, row.c1]),
            [['a', 1], ['a', 2], ['b', 3]],
        )
    })

    it('normalizes persisted payloads', () => {
        const state = normalizeGridViewState({
            columnFilters: {c2: 'x'},
            sortColumn: 'c1',
            sortDirection: 'desc',
            columnWidths: {c1: 200, c2: 10},
            columnOrder: ['c2', 'c1'],
        })
        assert.equal(state.columnFilters.c2, 'x')
        assert.equal(state.sortDirection, 'desc')
        assert.equal(state.columnWidths.c1, 200)
        assert.equal(state.columnWidths.c2, 64)
        assert.deepEqual(state.columnOrder, ['c2', 'c1'])
    })

    it('reorders and clamps column layout', () => {
        let state = createEmptyGridViewState()
        state = setGridColumnWidth(state, 'c1', 999)
        assert.equal(state.columnWidths.c1, 720)
        state = moveGridColumnOrder(state, columns, 'c1', 'c2')
        assert.deepEqual(state.columnOrder, ['c2', 'c1'])
        assert.deepEqual(
            resolveDisplayColumns(columns, state.columnOrder).map((column) => column.key),
            ['c2', 'c1'],
        )
    })

    it('clear keeps column layout', () => {
        let state = setGridColumnWidth(createEmptyGridViewState(), 'c1', 180)
        state = moveGridColumnOrder(state, columns, 'c2', 'c1')
        state = setGridColumnFilter(state, 'c1', '1')
        state = clearGridViewState(state)
        assert.equal(state.columnFilters.c1, undefined)
        assert.equal(state.columnWidths.c1, 180)
        assert.deepEqual(state.columnOrder, ['c2', 'c1'])
    })

    it('suggests column width from type and declared length', () => {
        assert.ok(suggestGridColumnWidth({name: 'id', type: 'bigint'}) < suggestGridColumnWidth({name: 'username', type: 'varchar(255)'}))
        assert.equal(suggestGridColumnWidth({name: 'id', type: 'bigint'}), 108)
        assert.equal(suggestGridColumnWidth({name: 'ok', type: 'boolean'}), 72)
        assert.equal(suggestGridColumnWidth({name: 'created', type: 'datetime(6)'}), 188)
        assert.equal(suggestGridColumnWidth({name: 'note', type: 'text'}), 200)
        assert.equal(suggestGridColumnWidth({name: 'c', type: 'varchar(8)'}), 88)
        assert.equal(suggestGridColumnWidth({name: 'username', type: 'varchar(255)'}), 260)
        assert.ok(
            suggestGridColumnWidth({name: 'very_long_column_name_here', type: 'int'})
            > suggestGridColumnWidth({name: 'id', type: 'int'}),
        )
    })

    it('detects active filters or sort', () => {
        assert.equal(gridViewStateIsActive(createEmptyGridViewState()), false)
        assert.equal(gridViewStateIsActive(setGridColumnFilter(createEmptyGridViewState(), 'c1', '1')), true)
    })

    it('matches filter text case-insensitively', () => {
        assert.equal(cellMatchesFilter('Hello', 'ell'), true)
        assert.equal(cellMatchesFilter('Hello', 'zzz'), false)
    })

    it('compares numeric and null values', () => {
        assert.ok(compareCellValues(2, 10) < 0)
        assert.ok(compareCellValues(null, 1) > 0)
    })
})
