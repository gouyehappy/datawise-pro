import {t} from '@/i18n'
import type {DbType} from '@/core/types'
import type {ExecuteSqlResult} from '@/shared/api/types'
import type {QueryResultItem} from '@/features/workspace/types'
import {resolveStoredQuerySql} from '@/features/workspace/services/query-result-refresh.service'
import {
    isExplainAnalyzeStatement,
    isExplainStatement,
    parseExplainPlanResult,
} from '@/features/workspace/services/explain-plan.service'
import {isNonGridResult} from '@/features/workspace/services/query-result-batch.utils'

export function resolveQueryResultTabLabel(item: QueryResultItem, index: number): string {
    const sql = item.sql ?? ''
    if (isExplainAnalyzeStatement(sql)) {
        return t('queryResult.explainPlanAnalyzeTab', {n: index + 1})
    }
    if (isExplainStatement(sql)) {
        return t('queryResult.explainPlanEstimateTab', {n: index + 1})
    }
    if (item.batchEntries?.length) {
        return item.label
    }
    if (isNonGridResult(item) && item.status === 'success') {
        return t('queryResult.execTab', {n: index + 1})
    }
    return t('queryResult.resultTab', {n: index + 1})
}

/** 将 ExecuteSqlResult 转为结果 Tab 条目；sql 优先用客户端记录的完整执行语句 */
export function buildSuccessQueryResultItem(
    result: ExecuteSqlResult,
    index: number,
    executedSql?: string,
    dbType?: DbType,
): QueryResultItem {
    const sql = resolveStoredQuerySql(result.sql, executedSql)
    const item: QueryResultItem = {
        id: `result-${index}-${Date.now()}`,
        label: '',
        sql,
        columns: result.columns,
        rows: result.rows,
        total: result.rowCount,
        where: result.where,
        orderBy: result.orderBy,
        durationMs: result.durationMs,
        status: 'success',
        errorMessage: undefined,
        errorLine: undefined,
        executedAtMs: Date.now(),
        cursorId: result.cursorId,
        hasMore: result.hasMore,
        pageOffset: result.pageOffset,
        pageSize: result.pageSize,
    }
    item.label = resolveQueryResultTabLabel(item, index)

    if (isExplainStatement(sql)) {
        const explainPlan = parseExplainPlanResult(result.columns, result.rows, dbType)
        if (explainPlan.length) {
            item.explainPlan = explainPlan
            item.explainMode = isExplainAnalyzeStatement(sql) ? 'analyze' : 'estimate'
            item.resultView = 'explain-plan'
        }
    }

    return item
}

export function buildErrorQueryResultItem(
    payload: {
        sql: string
        errorMessage: string
        errorLine?: number
        durationMs?: number
    },
    index: number,
): QueryResultItem {
    return {
        id: `result-${index}-${Date.now()}`,
        label: t('queryResult.resultTab', {n: index + 1}),
        sql: payload.sql,
        columns: [],
        rows: [],
        total: 0,
        durationMs: payload.durationMs ?? 0,
        status: 'error',
        errorMessage: payload.errorMessage,
        errorLine: payload.errorLine,
        executedAtMs: Date.now(),
        where: undefined,
        orderBy: undefined,
    }
}
