/** Host-safe chart spec (query results + AI analysis share the same shape). */

export interface ChartSpec {
    type: 'bar' | 'line' | 'pie'
    title: string
    xField: string
    yFields: string[]
    seriesNames: string[]
}
