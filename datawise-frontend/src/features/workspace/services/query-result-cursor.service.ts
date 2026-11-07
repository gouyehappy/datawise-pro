import type {ExecuteSqlResult} from '@/shared/api/types'
import type {QueryResultItem} from '@/features/workspace/types'
import {CURSOR_LOADED_ROWS_MAX} from '@/features/workspace/constants/query-result-limits'
import {sealQueryResultPayload} from '@/features/workspace/services/query-result-seal'

export interface AppendCursorRowsResult<T> {
    rows: T[]
    trimmedTotal: number
}

/** 追加游标分页行并在超过上限时从头部丢弃最早行 */
export function appendCursorRowsWithWindow<T>(
    existingRows: readonly T[],
    pageRows: readonly T[],
    options?: {
        maxRows?: number
        previousTrimmed?: number
    },
): AppendCursorRowsResult<T> {
    const maxRows = options?.maxRows ?? CURSOR_LOADED_ROWS_MAX
    const previousTrimmed = options?.previousTrimmed ?? 0
    if (pageRows.length === 0) {
        return {rows: existingRows as T[], trimmedTotal: previousTrimmed}
    }
    const total = existingRows.length + pageRows.length
    if (total <= maxRows) {
        return {
            rows: existingRows.concat(pageRows as T[]),
            trimmedTotal: previousTrimmed,
        }
    }
    const drop = total - maxRows
    if (drop >= existingRows.length) {
        return {
            rows: pageRows.slice(drop - existingRows.length) as T[],
            trimmedTotal: previousTrimmed + drop,
        }
    }
    return {
        rows: existingRows.slice(drop).concat(pageRows as T[]),
        trimmedTotal: previousTrimmed + drop,
    }
}

export function mergeCursorPageIntoQueryResult(
    item: QueryResultItem,
    page: ExecuteSqlResult,
    options?: {
        maxRows?: number
        /** true：触顶后截断并停止（maxResultRows）；false：滑动窗口保留最新行 */
        hardCap?: boolean
    },
): QueryResultItem {
    const maxRows = options?.maxRows ?? CURSOR_LOADED_ROWS_MAX
    const hardCap = options?.hardCap === true
    if (hardCap && maxRows > 0) {
        const remaining = Math.max(0, maxRows - item.rows.length)
        const pageRows = remaining < page.rows.length ? page.rows.slice(0, remaining) : page.rows
        const merged = pageRows.length === 0 ? item.rows : item.rows.concat(pageRows)
        const atCap = merged.length >= maxRows
        return sealQueryResultPayload({
            ...item,
            rows: merged,
            total: merged.length,
            durationMs: item.durationMs + page.durationMs,
            cursorId: atCap ? undefined : page.cursorId,
            hasMore: atCap ? false : (page.hasMore ?? false),
            pageOffset: page.pageOffset,
            pageSize: page.pageSize ?? item.pageSize,
            cursorTrimmedRows: item.cursorTrimmedRows ?? 0,
        })
    }
    const fetchedTotal = item.rows.length + page.rows.length
    const windowed = appendCursorRowsWithWindow(item.rows, page.rows, {
        previousTrimmed: item.cursorTrimmedRows ?? 0,
        maxRows,
    })
    return sealQueryResultPayload({
        ...item,
        rows: windowed.rows,
        total: fetchedTotal,
        durationMs: item.durationMs + page.durationMs,
        cursorId: page.cursorId,
        hasMore: page.hasMore ?? false,
        pageOffset: page.pageOffset,
        pageSize: page.pageSize ?? item.pageSize,
        cursorTrimmedRows: windowed.trimmedTotal,
    })
}
