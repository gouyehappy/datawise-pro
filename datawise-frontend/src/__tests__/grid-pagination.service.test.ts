import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    computePagedRows,
    resolveFormViewCanNext,
    resolveFormViewCanPrev,
    resolveFormViewRow,
    resolveFormViewRowIndex,
    resolveFormViewRowNumber,
    resolveFormViewRowTotal,
    resolveNextFormViewTarget,
    toggleLayoutMode,
} from '@/core/data-grid/services/grid-pagination.service'
import type {GridDisplayRow} from '@/core/data-grid/edit/useGridPendingEdit'

const rows: GridDisplayRow[] = [
    {id: 'r1', kind: 'existing', originalRow: {id: 1}},
    {id: 'r2', kind: 'existing', originalRow: {id: 2}},
    {id: 'r3', kind: 'existing', originalRow: {id: 3}},
]

describe('grid-pagination.service', () => {
    it('pages rows and exposes page metadata', () => {
        assert.deepEqual(computePagedRows(rows, 1, 2).map((row) => row.id), ['r1', 'r2'])
        assert.deepEqual(computePagedRows(rows, 2, 2).map((row) => row.id), ['r3'])
    })

    it('resolves form view row and index state', () => {
        assert.equal(resolveFormViewRow(rows, 'r2')?.id, 'r2')
        assert.equal(resolveFormViewRow(rows, null)?.id, 'r1')
        const formRow = resolveFormViewRow(rows, 'r2')
        const index = resolveFormViewRowIndex(rows, formRow)
        assert.equal(index, 1)
        assert.equal(resolveFormViewRowNumber(index, 0), 2)
        assert.equal(resolveFormViewRowTotal(rows, 3), 6)
        assert.equal(resolveFormViewCanPrev(index), true)
        assert.equal(resolveFormViewCanNext(index, rows), true)
        assert.equal(resolveFormViewCanNext(2, rows), false)
    })

    it('resolves next form view target with page change', () => {
        const target = resolveNextFormViewTarget(rows, 1, 1, 2)
        assert.equal(target.row?.id, 'r3')
        assert.equal(target.page, 2)
        const clamped = resolveNextFormViewTarget(rows, 2, 5, 2)
        assert.equal(clamped.row?.id, 'r3')
        assert.equal(clamped.page, 2)
    })

    it('toggles layout mode', () => {
        assert.equal(toggleLayoutMode('grid'), 'form')
        assert.equal(toggleLayoutMode('form'), 'grid')
    })
})
