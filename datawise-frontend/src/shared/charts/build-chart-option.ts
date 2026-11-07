import type {EChartsOption} from 'echarts'
import type {TableColumn, TableRow} from '@/core/types'
import type {ChartSpec} from '@/shared/charts/chart-spec.types'
import {readDocumentUiTextScaleFactor} from '@/shared/config/ui-text-scale'

export type BuildChartOptionParams = {
    /** When false, skip ECharts title (host chrome already shows it). Default true. */
    showTitle?: boolean
}

function isDarkTheme(): boolean {
    if (typeof document === 'undefined') return true
    return document.documentElement.getAttribute('data-theme') === 'dark'
}

function chartPalette() {
    const dark = isDarkTheme()
    return {
        text: dark ? '#f0f0f3' : '#111827',
        textSecondary: dark ? '#d4d4d8' : '#64748b',
        textMuted: dark ? '#c4c7cc' : '#94a3b8',
        border: dark ? '#2e3440' : '#e2e8f0',
        split: dark ? '#252b33' : '#eef2f7',
    }
}

/** Chart label sizes follow shell uiTextScale (no separate chart font setting). */
function chartFontSize(basePx: number): number {
    const scaled = Math.round(basePx * readDocumentUiTextScaleFactor())
    return Math.min(18, Math.max(9, scaled))
}

function columnKey(column: TableColumn): string {
    return column.key ?? column.name
}

function readCell(row: TableRow, key: string): string | number | null {
    const value = row[key]
    if (value === null || value === undefined) return null
    if (typeof value === 'number') return value
    const text = String(value).trim()
    if (!text) return null
    const numeric = Number(text)
    return Number.isFinite(numeric) && text !== '' ? numeric : text
}

function readCategories(rows: TableRow[], xField: string): string[] {
    return rows.map((row) => {
        const value = readCell(row, xField)
        return value == null ? '' : String(value)
    })
}

/** Make duplicate category labels distinguishable on the axis. */
export function disambiguateCategories(categories: string[]): string[] {
    const frequency = new Map<string, number>()
    for (const item of categories) {
        frequency.set(item, (frequency.get(item) ?? 0) + 1)
    }
    const seen = new Map<string, number>()
    return categories.map((item) => {
        if ((frequency.get(item) ?? 0) <= 1) return item
        const next = (seen.get(item) ?? 0) + 1
        seen.set(item, next)
        return item ? `${item} (${next})` : `#${next}`
    })
}

function legendConfig(seriesCount: number, ink: ReturnType<typeof chartPalette>): EChartsOption['legend'] | undefined {
    if (seriesCount <= 1) return undefined
    return {
        type: 'scroll',
        orient: 'horizontal',
        bottom: 4,
        left: 'center',
        width: '92%',
        itemGap: 14,
        itemWidth: 12,
        itemHeight: 8,
        pageIconSize: 10,
        pageButtonItemGap: 6,
        textStyle: {
            fontSize: chartFontSize(11),
            color: ink.textSecondary,
        },
        pageTextStyle: {
            color: ink.textMuted,
        },
    }
}

function cartesianGrid(seriesCount: number): EChartsOption['grid'] {
    return {
        left: 56,
        right: 20,
        top: 28,
        bottom: seriesCount > 1 ? 56 : 36,
        containLabel: true,
    }
}

/** Convert a chart spec + result rows into an ECharts option. */
export function buildChartOption(
    chart: ChartSpec,
    columns: TableColumn[],
    rows: TableRow[],
    params: BuildChartOptionParams = {},
): EChartsOption | null {
    if (!rows.length || !chart.yFields.length) return null

    const showTitle = params.showTitle !== false
    const ink = chartPalette()
    const xField = chart.xField
    const categories = disambiguateCategories(readCategories(rows, xField))
    const titleOption = showTitle && chart.title
        ? {
            text: chart.title,
            left: 'center',
            top: 4,
            textStyle: {
                fontSize: chartFontSize(13),
                fontWeight: 600 as const,
                color: ink.text,
            },
        }
        : undefined

    if (chart.type === 'pie' && chart.yFields.length === 1) {
        const yField = chart.yFields[0]
        return {
            title: titleOption,
            tooltip: {trigger: 'item'},
            legend: {
                type: 'scroll',
                orient: 'horizontal',
                bottom: 4,
                left: 'center',
                textStyle: {
                    fontSize: chartFontSize(11),
                    color: ink.textSecondary,
                },
            },
            series: [
                {
                    type: 'pie',
                    radius: ['36%', '64%'],
                    center: ['50%', showTitle ? '46%' : '48%'],
                    data: rows.map((row, index) => ({
                        name: categories[index] || String(readCell(row, xField) ?? ''),
                        value: Number(readCell(row, yField) ?? 0),
                    })),
                },
            ],
        }
    }

    const series = chart.yFields.map((field, index) => ({
        name: chart.seriesNames[index] ?? columns.find((col) => columnKey(col) === field)?.name ?? field,
        type: chart.type,
        smooth: chart.type === 'line',
        showSymbol: rows.length <= 24,
        symbolSize: 7,
        lineStyle: chart.type === 'line' ? {width: 2} : undefined,
        emphasis: {focus: 'series' as const},
        data: rows.map((row) => Number(readCell(row, field) ?? 0)),
    }))

    const rotateLabels = categories.some((item) => item.length > 10) || categories.length > 8

    return {
        title: titleOption,
        color: [
            '#3b82f6',
            '#22c55e',
            '#eab308',
            '#f43f5e',
            '#38bdf8',
            '#84cc16',
            '#f97316',
            '#a855f7',
            '#14b8a6',
            '#fb7185',
        ],
        tooltip: {
            trigger: 'axis',
            axisPointer: {type: chart.type === 'bar' ? 'shadow' : 'line'},
            confine: true,
        },
        legend: legendConfig(series.length, ink),
        grid: cartesianGrid(series.length),
        xAxis: {
            type: 'category',
            data: categories,
            boundaryGap: chart.type === 'bar',
            axisTick: {alignWithLabel: true},
            axisLabel: {
                hideOverlap: true,
                interval: 'auto',
                rotate: rotateLabels ? 28 : 0,
                fontSize: chartFontSize(11),
                color: ink.textMuted,
            },
            axisLine: {
                lineStyle: {color: ink.border},
            },
        },
        yAxis: {
            type: 'value',
            splitNumber: 4,
            axisLabel: {
                fontSize: chartFontSize(11),
                color: ink.textMuted,
                hideOverlap: true,
            },
            splitLine: {
                lineStyle: {
                    type: 'dashed',
                    color: ink.split,
                    opacity: 0.9,
                },
            },
            axisLine: {show: false},
            axisTick: {show: false},
        },
        series,
    }
}

/** @deprecated Prefer {@link buildChartOption} */
export const buildAiChartOption = buildChartOption
