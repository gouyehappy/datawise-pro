import {useEditorSettingsStore} from '@/features/settings/stores/editor-settings'
import {
    DEFAULT_SQL_PAGE_SIZE,
    resolveClientMaxResultRowsFromBase,
    resolveCursorLoadedRowsMaxFrom,
    resolveSqlPageSizeFromMax,
} from '@/features/settings/services/query-limit-core'

export {
    DEFAULT_SQL_PAGE_SIZE,
    resolveClientMaxResultRowsFromBase,
    resolveCursorLoadedRowsMaxFrom,
    resolveSqlPageSizeFromMax,
} from '@/features/settings/services/query-limit-core'

/** 客户端配置的 SQL / 表数据最大返回行数；0 表示不限制 */
export function resolveClientMaxResultRows(productionPerfActive = false): number {
    const base = useEditorSettingsStore().settings.maxResultRows
    return resolveClientMaxResultRowsFromBase(base, productionPerfActive)
}

/** 游标分页每页行数：默认 500；若 maxResultRows 更小则跟上限，避免首屏超出硬顶 */
export function resolveSqlPageSize(productionPerfActive = false): number {
    return resolveSqlPageSizeFromMax(resolveClientMaxResultRows(productionPerfActive))
}

/**
 * 游标「已加载行」窗口上限：内存窗口与 maxResultRows 取较小值，
 * 避免 load-more 越过用户配置的硬顶。
 */
export function resolveCursorLoadedRowsMax(productionPerfActive = false): number {
    return resolveCursorLoadedRowsMaxFrom(
        resolveClientMaxResultRows(productionPerfActive),
        productionPerfActive,
    )
}
