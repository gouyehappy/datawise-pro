import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {useGridPendingEdit} from '@/core/composables/useGridPendingEdit'
import type {TableColumn, TableRow} from '@/core/types'

const columns: TableColumn[] = [{name: 'id', type: 'INTEGER'}]
const rows: TableRow[] = [{id: 1}, {id: 2}]

describe('useGridPendingEdit', () => {
    it('keeps pending-delete rows visible and flagged', () => {
        const edit = useGridPendingEdit({
            columns: () => columns,
            rows: () => rows,
            columnDetails: () => [{name: 'id', type: 'INTEGER', nullable: false, autoIncrement: true}],
            editable: () => true,
            pkColumns: () => ['id'],
            tableAutoIncrement: () => '5',
            onSubmit: async () => true,
        })

        edit.selectRow({id: 'id:1', kind: 'existing', originalRow: rows[0]})
        edit.markDeleteSelected()

        assert.equal(edit.displayRows.value.length, 2)
        assert.deepEqual(edit.displayRows.value[0], {
            id: 'id:1',
            kind: 'existing',
            originalRow: rows[0],
            pendingDelete: true,
        })
        assert.equal(edit.isRowPendingDelete(edit.displayRows.value[0]!), true)
        assert.equal(edit.hasPendingChanges.value, true)
    })

    it('submits delete only after save', async () => {
        let submitted: unknown = null
        const edit = useGridPendingEdit({
            columns: () => columns,
            rows: () => rows,
            columnDetails: () => [{name: 'id', type: 'INTEGER', nullable: false, autoIncrement: true}],
            editable: () => true,
            pkColumns: () => ['id'],
            tableAutoIncrement: () => '5',
            onSubmit: async (batch) => {
                submitted = batch
                return true
            },
        })

        edit.selectRow({id: 'id:2', kind: 'existing', originalRow: rows[1]})
        edit.markDeleteSelected()
        assert.equal(submitted, null)

        await edit.submitPending()
        assert.deepEqual(submitted, {
            inserts: [],
            updates: [],
            deletes: [rows[1]],
        })
    })

    it('does not mark row modified until value changes', async () => {
        const edit = useGridPendingEdit({
            columns: () => columns,
            rows: () => rows,
            columnDetails: () => [{name: 'id', type: 'INTEGER', nullable: false, autoIncrement: true}],
            editable: () => true,
            pkColumns: () => ['id'],
            tableAutoIncrement: () => '5',
            onSubmit: async () => true,
        })

        const item = {id: 'id:1', kind: 'existing' as const, originalRow: rows[0]}
        await edit.startEditCell(item, 'id')
        assert.equal(edit.isRowModified(item), false)

        edit.setCellValue(item, 'id', '99')
        assert.equal(edit.isRowModified(item), true)
    })
})
