import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    buildDefaultQueryResultChartConfig,
    canVisualizeQueryResult,
    inferQueryResultChartFields,
    pivotQueryResultRows,
} from '@/features/workspace/services/query-result-chart.service'
import type {TableColumn, TableRow} from '@/core/types'

describe('query-result-chart.service', () => {
    const columns: TableColumn[] = [
        {name: 'region', key: 'region', type: 'varchar'},
        {name: 'amount', key: 'amount', type: 'decimal'},
        {name: 'orders', key: 'orders', type: 'int'},
    ]

    const rows: TableRow[] = [
        {region: 'East', amount: '120', orders: 3},
        {region: 'West', amount: '80', orders: 2},
        {region: 'East', amount: '30', orders: 1},
    ]

    it('detects dimension and measure fields', () => {
        const fields = inferQueryResultChartFields(columns, rows)
        assert.equal(fields.find((field) => field.key === 'region')?.kind, 'dimension')
        assert.equal(fields.find((field) => field.key === 'amount')?.kind, 'measure')
    })

    it('builds default chart config', () => {
        const config = buildDefaultQueryResultChartConfig(columns, rows, 'Sales')
        assert.ok(config)
        assert.equal(config?.xField, 'region')
        assert.deepEqual(config?.yFields, ['amount', 'orders'])
        assert.equal(config?.title, 'Sales')
    })

    it('pivots rows by dimension with sum', () => {
        const pivoted = pivotQueryResultRows(rows, 'region', ['amount', 'orders'])
        assert.equal(pivoted.length, 2)
        const east = pivoted.find((row) => row.region === 'East')
        assert.equal(east?.amount, 150)
        assert.equal(east?.orders, 4)
    })

    it('reports chart availability', () => {
        assert.equal(canVisualizeQueryResult(columns, rows), true)
        assert.equal(canVisualizeQueryResult([{name: 'note', key: 'note'}], [{note: 'a'}]), false)
    })
})
