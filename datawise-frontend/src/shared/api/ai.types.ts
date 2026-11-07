import type {DbType, TableColumn, TableRow} from '@/core/types'
import type {ChartSpec} from '@/shared/charts/chart-spec.types'

export type {ChartSpec}
export type AiChartSpec = ChartSpec

export interface AiAnalysisReport {
    markdown: string
    html?: string | null
}

export interface AiAnalysisResult {
    sql: string
    columns: TableColumn[]
    rows: TableRow[]
    chart?: AiChartSpec | null
    report?: AiAnalysisReport | null
    pythonInsight?: string | null
}

export interface AiAnalysisContextPayload {
    previousSql: string
    previousSummary?: string
    previousChartType?: string
}

export interface AiChatReplyPayload {
    reply: string
    mode?: 'chat' | 'analysis'
    sql?: string | null
    columns?: TableColumn[]
    rows?: TableRow[]
    chart?: AiChartSpec | null
    report?: AiAnalysisReport | null
    pythonInsight?: string | null
}

export interface AiAnalysisInterruptPayload {
    threadId: string
    checkpointId: string
    sql: string
    nextStep: string
}

export interface AiAnalysisResumeRequest {
    threadId: string
    checkpointId: string
    approved: boolean
}

export type AiAnalysisStepStatus = 'running' | 'ok' | 'failed' | 'skipped'

export interface AiAnalysisStepEvent {
    step: string
    status: AiAnalysisStepStatus
    message: string
    durationMs?: number | null
    detail?: Record<string, unknown> | null
}

export interface AiAnalysisErrorPayload {
    code?: string
    message?: string
}

export type AiTargetLevel = 'connection' | 'database' | 'table'

export interface AiDatabaseTarget {
    id: string
    connectionId: string
    connectionLabel: string
    databaseId: string
    databaseLabel: string
    tableId?: string
    tableLabel?: string
    level: AiTargetLevel
    dbType: DbType
    groupLabel: string
}

export interface AiDatabaseGroup {
    groupLabel: string
    targets: AiDatabaseTarget[]
}

export interface AiKnowledgeEntry {
    id: string
    connectionId?: string
    database?: string
    term: string
    definition: string
    synonyms: string[]
    relatedTables: string[]
}

export interface AiTableTagCatalogItem {
    connectionId: string
    connectionName: string
    database: string
    tableName: string
}

export const AI_ANALYSIS_STEP_ORDER = [
    'intent',
    'step_route',
    'planner',
    'evidence',
    'schema',
    'sql_generate',
    'sql_validate',
    'sql_execute',
    'python_generate',
    'python_execute',
    'python_analyze',
    'chart',
    'summary',
    'report',
] as const

export type AiAnalysisStepId = (typeof AI_ANALYSIS_STEP_ORDER)[number]

/** 可在设置中禁用的可选分析步骤（与后端 datawise.ai.analysis.steps 对齐） */
export const AI_ANALYSIS_CONFIGURABLE_STEPS = [
    'planner',
    'evidence',
    'sql_validate',
    'python',
    'chart',
    'summary',
    'report',
] as const

export type AiAnalysisConfigurableStepId = (typeof AI_ANALYSIS_CONFIGURABLE_STEPS)[number]

export type AiAnalysisMode = 'quick' | 'smart' | 'custom'
