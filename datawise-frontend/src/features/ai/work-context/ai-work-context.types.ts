import type {DbType} from '@/core/types'

/** 控制台 / 结果区 → AI 的统一工作上下文（Epic D-01） */
export interface AiWorkContext {
    connectionId?: string
    database?: string
    dbType?: DbType
    connectionLabel?: string
    /** 当前编辑器全文或失败语句 */
    sql?: string
    /** 编辑器选区（若有） */
    selection?: string
    /** 最近一次执行错误信息 */
    lastError?: string
    /** 失败 SQL 在编辑器中的行号（1-based） */
    errorLine?: number
}

export interface BuildAiWorkContextInput {
    connectionId?: string
    database?: string
    dbType?: DbType
    connectionLabel?: string
    sql?: string
    selection?: string
    lastError?: string
    errorLine?: number
}
