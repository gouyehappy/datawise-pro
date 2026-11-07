import {
    resolveEffectiveCursorLoadedRowsMax,
    resolveEffectiveMaxResultRows,
} from '@/features/settings/services/production-perf-mode.policy'
import {CURSOR_LOADED_ROWS_MAX} from '@/features/workspace/constants/query-result-limits'

/** 游标分页默认每页行数（与 maxResultRows 解耦：上限只裁剪总行，不放大首屏） */
export const DEFAULT_SQL_PAGE_SIZE = 500

/** Pure helpers — safe for node:test without Pinia/monaco. */
export function resolveClientMaxResultRowsFromBase(
    baseMaxRows: number,
    productionPerfActive = false,
): number {
    return resolveEffectiveMaxResultRows(baseMaxRows, productionPerfActive)
}

export function resolveSqlPageSizeFromMax(maxResultRows: number): number {
    if (maxResultRows > 0 && maxResultRows < DEFAULT_SQL_PAGE_SIZE) {
        return maxResultRows
    }
    return DEFAULT_SQL_PAGE_SIZE
}

export function resolveCursorLoadedRowsMaxFrom(
    clientMaxRows: number,
    productionPerfActive = false,
): number {
    const windowMax = resolveEffectiveCursorLoadedRowsMax(productionPerfActive)
    if (clientMaxRows > 0) {
        return Math.min(windowMax, clientMaxRows)
    }
    return windowMax
}

/** @deprecated Prefer {@link CURSOR_LOADED_ROWS_MAX} from query-result-limits */
export const DEFAULT_CURSOR_LOADED_ROWS_MAX = CURSOR_LOADED_ROWS_MAX
