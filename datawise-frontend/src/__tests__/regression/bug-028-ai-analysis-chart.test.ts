import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    buildAiChartOption,
    disambiguateCategories,
} from '@/shared/charts/build-chart-option'
import type {AiChartSpec} from '@/features/ai/types/analysis'

describe('ai-chart.service', () => {
    it('builds line chart option from analysis result', () => {
        const chart: AiChartSpec = {
            type: 'line',
            title: 'Sales trend',
            xField: 'month',
            yFields: ['total_sales'],
            seriesNames: ['total_sales'],
        }
        const option = buildAiChartOption(
            chart,
            [
                {name: 'month', key: 'month'},
                {name: 'total_sales', key: 'total_sales'},
            ],
            [
                {month: '2026-01', total_sales: 120},
                {month: '2026-02', total_sales: 156},
            ],
        )

        assert.ok(option)
        assert.equal((option as { series?: Array<{ type?: string }> }).series?.[0]?.type, 'line')
    })

    it('omits echarts title when showTitle is false', () => {
        const chart: AiChartSpec = {
            type: 'line',
            title: 'Sales trend',
            xField: 'month',
            yFields: ['total_sales', 'orders'],
            seriesNames: ['total_sales', 'orders'],
        }
        const option = buildAiChartOption(
            chart,
            [
                {name: 'month', key: 'month'},
                {name: 'total_sales', key: 'total_sales'},
                {name: 'orders', key: 'orders'},
            ],
            [
                {month: '2026-01', total_sales: 120, orders: 3},
                {month: '2026-02', total_sales: 156, orders: 5},
            ],
            {showTitle: false},
        )

        assert.ok(option)
        assert.equal(option.title, undefined)
        assert.equal((option.legend as {type?: string} | undefined)?.type, 'scroll')
        assert.equal((option.legend as {bottom?: number} | undefined)?.bottom, 4)
    })

    it('disambiguates duplicate category labels', () => {
        assert.deepEqual(disambiguateCategories(['2026-07', '2026-07', '2026-07']), [
            '2026-07 (1)',
            '2026-07 (2)',
            '2026-07 (3)',
        ])
        assert.deepEqual(disambiguateCategories(['2026-01', '2026-02']), ['2026-01', '2026-02'])
    })
})
