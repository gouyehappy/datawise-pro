import type {SqlCompletionSlot} from '@sql-editor/types'

const AGGREGATE_FN = /\b(COUNT|SUM|AVG|MIN|MAX)\s*$/i

/** SELECT 列表刚输入聚合函数名（未写 `(`）— 应接 `(` 而非字段 */
export function detectAfterSelectAggregateKeyword(segment: string, slot: SqlCompletionSlot): boolean {
    if (slot !== 'select_list') return false
    const tail = segment.trimEnd()
    if (/\b(COUNT|SUM|AVG|MIN|MAX)\s*\(/i.test(tail)) return false
    return AGGREGATE_FN.test(tail)
}
