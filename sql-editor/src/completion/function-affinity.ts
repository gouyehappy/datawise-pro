import type {SqlFunctionSignature} from './function-config'
import {classifyColumnType, type SqlValueKind} from './column-type'
import type {SqlCompletionContext} from './context'
import {tablesReferencedInQuery} from './context'
import {resolvePredicateLeftColumn} from './predicate-column'
import type {SqlEditorSchema} from '@sql-editor/types'

const AGGREGATE_NAMES = new Set(['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'])

/** 常用函数置顶权重（越小越靠前）；未列出的保持 0 */
const COMMON_FUNCTION_PIN: Record<string, number> = {
    COUNT: -200,
    SUM: -190,
    AVG: -180,
    MIN: -170,
    MAX: -160,
    IFNULL: -150,
    COALESCE: -145,
    NULLIF: -140,
    CONCAT: -130,
    SUBSTRING: -120,
    TRIM: -115,
    UPPER: -110,
    LOWER: -105,
    NOW: -100,
    CURDATE: -95,
    CURRENT_TIMESTAMP: -90,
    DATE_FORMAT: -85,
    DATE_ADD: -80,
    DATEDIFF: -75,
    ABS: -70,
    ROUND: -65,
    CAST: -60,
    CONVERT: -55,
}

export function commonFunctionPinBoost(fn: SqlFunctionSignature): number {
    return COMMON_FUNCTION_PIN[fn.name.toUpperCase()] ?? 0
}

/** 函数返回值粗分类（用于按上下文提权/降权） */
export function classifyFunctionReturnKind(fn: SqlFunctionSignature): SqlValueKind {
    const fromReturns = classifyColumnType(fn.returns)
    if (fromReturns !== 'unknown') return fromReturns

    const name = fn.name.toUpperCase()
    if (AGGREGATE_NAMES.has(name)) return 'numeric'
    if (/^(CONCAT|SUBSTR|SUBSTRING|TRIM|LTRIM|RTRIM|UPPER|LOWER|REPLACE|LEFT|RIGHT|COALESCE|IFNULL|NULLIF|FORMAT|GROUP_CONCAT|STRING_AGG)/.test(name)) {
        return 'string'
    }
    if (/^(DATE|TIME|YEAR|MONTH|DAY|NOW|CURDATE|CURRENT_|TIMESTAMP|TO_DATE|TO_TIMESTAMP|DATE_ADD|DATE_SUB|DATEDIFF|EXTRACT)/.test(name)) {
        return 'temporal'
    }
    if (/^(ABS|CEIL|FLOOR|ROUND|MOD|POWER|SQRT|LENGTH|CHAR_LENGTH|GREATEST|LEAST)/.test(name)) {
        return 'numeric'
    }
    return 'unknown'
}

export function isAggregateFunction(fn: SqlFunctionSignature): boolean {
    return AGGREGATE_NAMES.has(fn.name.toUpperCase())
}

export type FunctionContextHint = {
    /** 期望的值类型（谓词右侧 / 比较语境） */
    expectKind?: SqlValueKind
    /** SELECT 列表优先聚合 */
    preferAggregate?: boolean
}

/** 从当前 SQL 片段推断函数补全语境 */
export function resolveFunctionContextHint(
    ctx: SqlCompletionContext,
    schema: SqlEditorSchema,
): FunctionContextHint {
    const hint: FunctionContextHint = {}
    if (ctx.slot === 'select_list') {
        hint.preferAggregate = true
    }

    const left = resolvePredicateLeftColumn(
        ctx.segment,
        ctx.aliases,
        tablesReferencedInQuery(ctx),
        schema,
    )
    if (left?.meta?.type) {
        const kind = classifyColumnType(left.meta.type)
        if (kind !== 'unknown') hint.expectKind = kind
    }
    return hint
}

/**
 * 排序加分（越小越靠前，与 columnSortBoost 同号约定）。
 * 匹配期望类型 / 聚合语境 → 负分；明显不符 → 正分（沉底，仍可出现）。
 */
export function functionAffinityBoost(fn: SqlFunctionSignature, hint: FunctionContextHint): number {
    let boost = commonFunctionPinBoost(fn)
    const kind = classifyFunctionReturnKind(fn)
    const agg = isAggregateFunction(fn)

    if (hint.preferAggregate) {
        boost += agg ? -80 : 40
    }
    if (hint.expectKind && hint.expectKind !== 'unknown') {
        if (kind === hint.expectKind) boost -= 100
        else if (kind !== 'unknown' && kind !== hint.expectKind) boost += 120
    }
    return boost
}
