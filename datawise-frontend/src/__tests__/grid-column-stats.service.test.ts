import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {computeGridColumnStats} from '@/features/workspace/services/grid-column-stats.service'
import type {TableColumn, TableRow} from '@/core/types'

const amountColumn: TableColumn = {name: 'amount', type: 'decimal'}
const statusColumn: TableColumn = {name: 'status', type: 'varchar'}

describe('grid-column-stats.service', () => {
    it('computes numeric and categorical stats', () => {
        const rows: TableRow[] = [
            {amount: 10, status: 'ok'},
            {amount: 20, status: 'ok'},
            {amount: null, status: 'fail'},
        ]
        const stats = computeGridColumnStats(amountColumn, rows)
        assert.equal(stats.rowCount, 3)
        assert.equal(stats.nullCount, 1)
        assert.equal(stats.distinctCount, 2)
        assert.equal(stats.numericMin, 10)
        assert.equal(stats.numericMax, 20)
        assert.equal(stats.numericAvg, 15)

        const statusStats = computeGridColumnStats(statusColumn, rows)
        assert.equal(statusStats.topValues[0]?.value, 'ok')
        assert.equal(statusStats.topValues[0]?.count, 2)
    })
})
