import type {SqlCompletionSlot} from '@sql-editor/types'

/** 这些槽位在「选下一子句」阶段优先展示关键字（ORDER BY / JOIN 等） */
export const KEYWORD_FIRST_SLOTS = new Set<SqlCompletionSlot>([
    'order_by',
    'group_by',
    'tail',
    'join',
])

export function isKeywordFirstContext(
    slot: SqlCompletionSlot,
    afterComma: boolean,
    afterConditionConnector = false,
    afterPredicateOperator = false,
): boolean {
    return (
        KEYWORD_FIRST_SLOTS.has(slot) &&
        !afterComma &&
        !afterConditionConnector &&
        !afterPredicateOperator
    )
}
