import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    filterAndSortDisplayRows,
    readRawDisplayRowCell,
} from '@/core/data-grid/services/grid-display-rows.service'
import type {GridDisplayRow} from '@/core/data-grid/edit/useGridPendingEdit'
import type {TableColumn} from '@/core/types'
import type {GridViewState} from '@/features/workspace/data-grid/services/grid-view-state.service'

const columns: TableColumn[] = [
    {name: 'id', type: 'INT'},
    {name: 'name', type: 'VARCHAR'},
]

const rows: GridDisplayRow[] = [
    {id: 'r1', kind: 'existing', originalRow: {id: 1, name: 'Alice'}},
    {id: 'r2', kind: 'existing', originalRow: {id: 2, name: 'Bob'}},
    {id: 'r3', kind: 'existing', originalRow: {id: 3, name: 'Alina'}},
]

const getCellDisplayText = (item: GridDisplayRow, columnName: string) =>
    String((item as unknown as Record<string, unknown>)[columnName] ?? '')

const state = (overrides: Partial<GridViewState> = {}): GridViewState => ({
    columnFilters: {},
    whereExpression: '',
    sortSpecs: [],
    ...overrides,
})

describe('grid-display-rows.service', () => {
    it('filters by column filters', () => {
        const result = filterAndSortDisplayRows(rows, columns, state({columnFilters: {name: 'ali'}}), getCellDisplayText)
        assert.deepEqual(result.map((row) => row.id), ['r1', 'r3'])
    })

    it('sorts by column direction', () => {
        const asc = filterAndSortDisplayRows(rows, columns, state({sortSpecs: [{column: 'name', direction: 'asc'}]}), getCellDisplayText)
        assert.deepEqual(asc.map((row) => row.id), ['r1', 'r3', 'r2'])
        const desc = filterAndSortDisplayRows(rows, columns, state({sortSpecs: [{column: 'name', direction: 'desc'}]}), getCellDisplayText)
        assert.deepEqual(desc.map((row) => row.id), ['r2', 'r3', 'r1'])
    })

    it('reads existing rows from originalRow', () => {
        assert.equal(readRawDisplayRowCell(rows[0]!, columns[1]!, getCellDisplayText), 'Alice')
    })

    it('reads insert rows through display text and blanks to null', () => {
        const insert: GridDisplayRow = {id: 'new', kind: 'insert'}
        assert.equal(
            readRawDisplayRowCell(insert, columns[1]!, () => 'New value'),
            'New value',
        )
        assert.equal(
            readRawDisplayRowCell(insert, columns[1]!, () => ''),
            null,
        )
    })
})
