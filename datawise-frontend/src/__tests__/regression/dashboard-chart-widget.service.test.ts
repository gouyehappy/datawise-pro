import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    addDashboardChartWidget,
    chartWidgetsForColumn,
    createDashboardChartWidget,
    normalizeChartWidgets,
    removeDashboardChartWidget,
    snapshotChartWidgetRows,
} from '@/features/dashboard/services/dashboard-chart-widget.service'
import {createDefaultDashboardPreferences} from '@/features/dashboard/services/dashboard-widget.service'
import type {TableColumn, TableRow} from '@/core/types'

describe('dashboard-chart-widget.service', () => {
    const columns: TableColumn[] = [
        {name: 'region', key: 'region', type: 'varchar'},
        {name: 'amount', key: 'amount', type: 'decimal'},
    ]

    const rows: TableRow[] = [
        {region: 'East', amount: 10},
        {region: 'West', amount: 20},
        {region: 'East', amount: 5},
    ]

    const config = {
        chartType: 'bar' as const,
        xField: 'region',
        yFields: ['amount'],
        title: 'Sales',
    }

    it('creates chart widget with row snapshot', () => {
        const widget = createDashboardChartWidget({
            title: 'Sales by region',
            column: 'main',
            config,
            pivotEnabled: true,
            columns,
            rows,
        })
        assert.match(widget.id, /^chart-/)
        assert.equal(widget.title, 'Sales by region')
        assert.equal(widget.column, 'main')
        assert.equal(widget.pivotEnabled, true)
        assert.equal(widget.rows.length, 2)
        assert.equal(widget.rows.find((row) => row.region === 'East')?.amount, 15)
    })

    it('caps snapshot rows at 500', () => {
        const manyRows = Array.from({length: 600}, (_, index) => ({region: `R${index}`, amount: index}))
        const snapshot = snapshotChartWidgetRows(manyRows, config, false)
        assert.equal(snapshot.length, 500)
    })

    it('adds and lists chart widgets by column', () => {
        const widget = createDashboardChartWidget({
            title: 'Chart A',
            column: 'left',
            config,
            pivotEnabled: false,
            columns,
            rows,
        })
        const prefs = addDashboardChartWidget(createDefaultDashboardPreferences(), widget)
        assert.equal(prefs.chartWidgets.length, 1)
        assert.deepEqual(chartWidgetsForColumn(prefs, 'left').map((item) => item.id), [widget.id])
    })

    it('removes chart widget by id', () => {
        const widget = createDashboardChartWidget({
            title: 'Chart A',
            column: 'main',
            config,
            pivotEnabled: false,
            columns,
            rows,
        })
        const prefs = addDashboardChartWidget(createDefaultDashboardPreferences(), widget)
        const next = removeDashboardChartWidget(prefs, widget.id)
        assert.equal(next.chartWidgets.length, 0)
    })

    it('normalizes invalid persisted chart widgets', () => {
        const normalized = normalizeChartWidgets([
            {
                id: 'chart-1',
                column: 'main',
                visible: true,
                title: 'Valid',
                config,
                pivotEnabled: false,
                columns,
                rows,
                createdAt: 1,
            },
            {
                id: 'bad',
                column: 'left',
                config: {chartType: 'invalid', xField: '', yFields: []},
                columns: [],
                rows: [],
            },
        ])
        assert.equal(normalized.length, 1)
        assert.equal(normalized[0]?.title, 'Valid')
    })
})
