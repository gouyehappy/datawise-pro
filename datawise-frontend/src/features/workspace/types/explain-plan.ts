export interface ExplainMetricPair {
    id: 'rows' | 'startup' | 'totalTime'
    estimate?: string | number
    actual?: string | number
}

export interface ExplainPlanNode {
    id: string
    label: string
    detail?: string
    metrics?: Record<string, string | number>
    /** estimate vs actual metrics when EXPLAIN ANALYZE is used */
    metricPairs?: ExplainMetricPair[]
    children?: ExplainPlanNode[]
}

export type ExplainPlanMode = 'estimate' | 'analyze'

export type ExplainPlanResultView = 'grid' | 'explain-plan'
