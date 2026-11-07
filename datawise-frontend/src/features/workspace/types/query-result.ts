import type {TableColumn, TableRow} from '@/core/types'
import type {ExplainPlanMode, ExplainPlanNode, ExplainPlanResultView} from '@/features/workspace/types/explain-plan'

export interface QueryResultBatchEntry {
    label: string
    sql: string
    status: 'success' | 'error'
    durationMs: number
    total: number
    errorMessage?: string
    errorLine?: number
    /** 语句完成时刻（epoch ms），用于输出日志时间戳 */
    executedAtMs?: number
}

export interface QueryResultItem {
    id: string
    label: string
    sql: string
    columns: TableColumn[]
    rows: TableRow[]
    total: number
    where?: string
    orderBy?: string
    durationMs: number
    status: 'success' | 'error'
    errorMessage?: string
    errorLine?: number
    /** 结果完成时刻（epoch ms），用于输出日志时间戳 */
    executedAtMs?: number
    /** 批量 DDL/DML 合并摘要；有值时只展示摘要页，不再为每条语句开 Tab */
    batchEntries?: QueryResultBatchEntry[]
    /** 批量执行进行中；配合 batchTotal 展示进度 */
    batchRunning?: boolean
    batchTotal?: number
    /** EXPLAIN / EXPLAIN ANALYZE 解析后的树形计划 */
    explainPlan?: ExplainPlanNode[]
    explainMode?: ExplainPlanMode
    resultView?: ExplainPlanResultView
    /** 服务端游标分页：还有更多行可加载 */
    cursorId?: string
    hasMore?: boolean
    pageOffset?: number
    pageSize?: number
    /** 滑动窗口已从内存丢弃的最早行数（用于行号偏移与提示） */
    cursorTrimmedRows?: number
}

export interface ConsoleQueryState {
    results: QueryResultItem[]
    /** 结果集选中下标；消息 Tab 为 -1；无结果时为 -1 */
    activeView: number
}
