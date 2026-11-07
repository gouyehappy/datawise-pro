import {
    isProductionEnvironment,
} from '@/features/connection/services/connection-environment.service'
import {CURSOR_LOADED_ROWS_MAX} from '@/features/workspace/constants/query-result-limits'

/** 生产环境性能模式下单次查询/打开表的最大返回行数（用户设为 0 不限制时也生效） */
export const PRODUCTION_PERF_MAX_RESULT_ROWS = 2_000

/** 生产环境性能模式下游标结果内存滑动窗口上限 */
export const PRODUCTION_PERF_CURSOR_MAX = 8_000

export type ConnectionEnvSource = {
    env?: string | null
    envCustom?: string | null
}

export function isProductionConnectionNode(node: ConnectionEnvSource | null | undefined): boolean {
    return isProductionEnvironment(node?.env, node?.envCustom)
}

export function isProductionPerfActiveForConnection(
    connectionId: string | undefined,
    findNode: (id: string) => ConnectionEnvSource | null,
    productionPerfModeEnabled: boolean,
): boolean {
    if (!productionPerfModeEnabled || !connectionId?.trim()) return false
    return isProductionConnectionNode(findNode(connectionId))
}

export function resolveEffectiveMaxResultRows(
    baseMaxRows: number,
    productionPerfActive: boolean,
): number {
    if (!productionPerfActive) return baseMaxRows
    if (baseMaxRows <= 0) return PRODUCTION_PERF_MAX_RESULT_ROWS
    return Math.min(baseMaxRows, PRODUCTION_PERF_MAX_RESULT_ROWS)
}

export function resolveEffectiveCursorLoadedRowsMax(productionPerfActive: boolean): number {
    if (!productionPerfActive) return CURSOR_LOADED_ROWS_MAX
    return Math.min(CURSOR_LOADED_ROWS_MAX, PRODUCTION_PERF_CURSOR_MAX)
}
