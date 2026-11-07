import type {ConsoleQueryState, QueryResultItem} from '@/features/workspace/types'
import {sealQueryResultPayload} from '@/features/workspace/services/query-result-seal'

export type QueryResultRefreshRequest = {
    sql: string
    resultIndex: number
}

/** 结果 Tab 应保存实际执行的 SQL，而非 API 可能截断的首行摘要 */
export function resolveStoredQuerySql(apiSql: string, executedSql?: string): string {
    const trimmed = executedSql?.trim()
    return trimmed || apiSql
}

/** 结果区刷新应重跑该结果 Tab 对应的 SQL，而非编辑器当前行 */
export function resolveQueryResultRefreshSql(
    result: Pick<QueryResultItem, 'sql'> | null | undefined,
): string {
    return result?.sql?.trim() ?? ''
}

export function resolveQueryResultRefreshRequest(
    result: Pick<QueryResultItem, 'sql'> | null | undefined,
    resultIndex: number,
): QueryResultRefreshRequest | null {
    const sql = resolveQueryResultRefreshSql(result)
    if (!sql || resultIndex < 0) return null
    return {sql, resultIndex}
}

/** 刷新时原地替换单个结果 Tab，保留其它 Tab 与 activeView */
export function replaceConsoleQueryResultAtIndex(
    stateByTabId: Record<string, ConsoleQueryState>,
    tabId: string,
    index: number,
    item: QueryResultItem,
): Record<string, ConsoleQueryState> {
    const state = stateByTabId[tabId]
    if (!state || index < 0 || index >= state.results.length) return stateByTabId

    const existing = state.results[index]
    const nextResults = [...state.results]
    nextResults[index] = sealQueryResultPayload({
        ...item,
        id: existing.id,
        label: existing.label,
    })

    state.results = nextResults
    return stateByTabId
}

export function sumConsoleQueryTotals(results: QueryResultItem[]) {
    return {
        totalRows: results.reduce((sum, row) => sum + row.total, 0),
        totalDuration: results.reduce((sum, row) => sum + row.durationMs, 0),
    }
}
