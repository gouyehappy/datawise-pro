import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    buildGridPendingSqlPreview,
    summarizeGridPendingBatch,
} from '@/features/workspace/services/grid-pending-sql-preview.service'
import type {GridPendingBatch} from '@/core/composables/useGridPendingEdit'
import type {TableColumn, TableRow} from '@/core/types'

const columns: TableColumn[] = [
    {name: 'id', type: 'int'},
    {name: 'name', type: 'varchar'},
]

function row(id: number, name: string): TableRow {
    return {id, name}
}

describe('T-GRID-1 grid pending SQL preview', () => {
    it('summarizes batch counts', () => {
        const batch: GridPendingBatch = {
            deletes: [row(1, 'a')],
            updates: [{
                originalRow: row(2, 'b'),
                keyValues: {id: 2},
                values: {name: 'b2'},
            }],
            inserts: [{id: 3, name: 'c'}],
        }
        assert.deepEqual(summarizeGridPendingBatch(batch), {
            deleteCount: 1,
            updateCount: 1,
            insertCount: 1,
            total: 3,
        })
    })

    it('builds delete → update → insert SQL in submit order', () => {
        const batch: GridPendingBatch = {
            deletes: [row(1, 'a')],
            updates: [{
                originalRow: row(2, 'b'),
                keyValues: {id: 2},
                values: {name: 'b2'},
            }],
            inserts: [{id: 3, name: "O'Brien"}],
        }
        const preview = buildGridPendingSqlPreview({
            batch,
            tableName: 'users',
            columns,
            pkColumns: ['id'],
        })
        assert.match(preview.sql, /^DELETE FROM users WHERE id = 1;/m)
        assert.match(preview.sql, /UPDATE users SET name = 'b2' WHERE id = 2;/)
        assert.match(preview.sql, /INSERT INTO users \(id, name\) VALUES \(3, 'O''Brien'\);/)
        assert.equal(preview.statementCount, 3)
        const deleteAt = preview.sql.indexOf('DELETE')
        const updateAt = preview.sql.indexOf('UPDATE')
        const insertAt = preview.sql.indexOf('INSERT')
        assert.ok(deleteAt < updateAt && updateAt < insertAt)
    })
})
