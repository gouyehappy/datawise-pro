import type {DbType, TreeNode} from '@/core/types'
import {findNodeById} from '@/core/utils/tree'
import {
    normalizeConnectionEnvironment,
    resolveConnectionEnvironmentLabel,
    type NormalizedConnectionEnvironment,
} from '@/features/connection/services/connection-environment.service'
import type {SchemaScope} from '@/features/schema-compare/types/schema-compare.types'
import {scopeKey} from '@/features/schema-compare/services/schema-scope.service'
import {isDangerousSql} from '@/features/workspace/services/dangerous-sql-preview.service'
import type {QueryResultDiffView} from '@/features/workspace/services/query-result-diff.service'
import type {QueryResultItem} from '@/features/workspace/types'

export const CROSS_ENV_COMPARE_SAMPLE_DEFAULT = 100
export const CROSS_ENV_COMPARE_SAMPLE_MAX = 500

export type CrossEnvCompareStep = 'baseline' | 'target' | 'query' | 'diff'

export function clampCrossEnvSampleRowCount(value: number): number {
    if (!Number.isFinite(value)) return CROSS_ENV_COMPARE_SAMPLE_DEFAULT
    const rounded = Math.round(value)
    if (rounded < 1) return 1
    if (rounded > CROSS_ENV_COMPARE_SAMPLE_MAX) return CROSS_ENV_COMPARE_SAMPLE_MAX
    return rounded
}

export function resolveConnectionEnvFromTree(
    tree: TreeNode[],
    connectionId: string,
): NormalizedConnectionEnvironment {
    const node = findNodeById(tree, connectionId)
    if (!node || node.type !== 'connection') {
        return normalizeConnectionEnvironment()
    }
    return normalizeConnectionEnvironment(node.env, node.envCustom)
}

export function buildCrossEnvResultLabel(
    scope: SchemaScope,
    env: NormalizedConnectionEnvironment,
    translate?: (key: string) => string,
): string {
    const envLabel = resolveConnectionEnvironmentLabel(env.env, env.envCustom, translate)
    return `${envLabel} · ${scope.connectionLabel} / ${scope.database}`
}

export function validateCrossEnvCompareSql(sql: string): string | null {
    const trimmed = sql.trim()
    if (!trimmed) return 'sqlRequired'
    if (isDangerousSql(trimmed)) return 'readOnlySql'
    return null
}

export function scopesReadyForCompare(
    left: SchemaScope | null | undefined,
    right: SchemaScope | null | undefined,
): boolean {
    if (!left || !right) return false
    if (left.connectionId === right.connectionId && left.database === right.database) return false
    return true
}

/** 根据已保存的 Tab 状态决定向导起始步。 */
export function resolveInitialCrossEnvCompareStep(options: {
    left?: SchemaScope | null
    right?: SchemaScope | null
    sql?: string | null
}): CrossEnvCompareStep {
    const sql = options.sql?.trim()
    if (options.left && options.right && sql) return 'query'
    if (options.left && options.right) return 'query'
    if (options.left) return 'target'
    return 'baseline'
}

export function buildCrossEnvCompareScope(options: {
    connectionId: string
    connectionLabel: string
    database: string
    dbType: DbType
}): SchemaScope {
    return {
        connectionId: options.connectionId,
        connectionLabel: options.connectionLabel,
        database: options.database,
        dbType: options.dbType,
    }
}

export function crossEnvCompareTabStateKey(scope: {
    left?: SchemaScope | null
    right?: SchemaScope | null
    sql?: string | null
}): string {
    return `${scopeKey(scope.left)}|${scopeKey(scope.right)}|${scope.sql?.trim() ?? ''}`
}

export interface CrossEnvCompareExecution {
    diff: QueryResultDiffView
    leftResult: QueryResultItem
    rightResult: QueryResultItem
}

export class CrossEnvCompareSideError extends Error {
    readonly side: 'left' | 'right'
    readonly result: QueryResultItem

    constructor(side: 'left' | 'right', result: QueryResultItem, message: string) {
        super(message)
        this.name = 'CrossEnvCompareSideError'
        this.side = side
        this.result = result
    }
}
