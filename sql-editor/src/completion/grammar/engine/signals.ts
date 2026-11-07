import type {SqlCompletionSlot} from '@sql-editor/types'
import type {FromJoinTableState} from '../../from-join'
import {isKeywordFirstContext} from '../../keyword-first'
import {orderBySelectItems} from '../../select-list'
import type {TransitionId} from '../definitions/types'
import {detectAfterCompleteGroupByList} from '../transitions/clause'
import {
    detectAfterCompleteOnPredicate,
    detectAfterCompleteWherePredicate,
    segmentEndsWithOperator,
    segmentHasIncompletePredicateRhs,
} from '../transitions/predicate'
import {detectAfterSelectAggregateKeyword} from '../transitions/select-list'
import {detectDdlAwaitingColumnType, detectDdlAfterAlterTable} from '../transitions/ddl'
import {
    detectInsertInColumnList,
    detectAfterInsertColumnList,
    detectAfterCompleteSetAssignment,
} from '../transitions/dml'

/** 所有 TransitionId（always 由 evaluateTransition 直接处理，不入 signals） */
export const TRANSITION_IDS: readonly TransitionId[] = [
    'column_ref',
    'after_comma',
    'after_select_aggregate',
    'after_complete_on_predicate',
    'after_complete_where_predicate',
    'after_complete_group_by_list',
    'after_complete_order_by',
    'after_complete_having_predicate',
    'after_predicate_operator',
    'after_complete_column_ref',
    'after_condition_connector',
    'order_by_after_column',
    'after_select_list_item',
    'after_select_list_complete_col',
    'from_awaiting_on_clause',
    'from_table_clause_complete',
    'from_awaiting_table_name',
    'from_awaiting_join_table',
    'keyword_first_slot',
    'ddl_awaiting_column_type',
    'ddl_after_alter_table',
    'insert_in_column_list',
    'after_insert_column_list',
    'after_complete_set_assignment',
] as const

export type GrammarSignals = Readonly<Record<Exclude<TransitionId, 'always'>, boolean>>

const PREDICATE_SLOTS = new Set<SqlCompletionSlot>(['where', 'having', 'on', 'set'])

const CONDITION_KEYWORDS = new Set([
    'and', 'or', 'not', 'in', 'like', 'between', 'is', 'exists', 'null',
])

export type ComputeSignalsInput = {
    segment: string
    slot: SqlCompletionSlot
    columnPrefix: string | null
    resolvedTable: string | null
    knownColumns: Record<string, { name: string }[]>
    knownColumnNames: Set<string>
    fromJoin: FromJoinTableState | null
}

function emptySignals(): Record<Exclude<TransitionId, 'always'>, boolean> {
    return Object.fromEntries(TRANSITION_IDS.map((id) => [id, false])) as Record<
        Exclude<TransitionId, 'always'>,
        boolean
    >
}

function isKnownColumnName(name: string, knownColumnNames: Set<string>): boolean {
    const lower = name.toLowerCase()
    if (CONDITION_KEYWORDS.has(lower)) return false
    return knownColumnNames.has(lower)
}

function detectAfterComma(segment: string, slot: SqlCompletionSlot): boolean {
    if (
        slot !== 'select_list' &&
        slot !== 'where' &&
        slot !== 'group_by' &&
        slot !== 'order_by' &&
        slot !== 'tail'
    ) {
        return false
    }
    return /,\s*[\w$`"']*$/.test(segment) || /,\s*$/.test(segment)
}

/** 光标仍在 SELECT 列表区（尚未进入 FROM / JOIN / WHERE …） */
function isSelectListRegion(segment: string): boolean {
    const s = segment.replace(/[\r\n]+$/, '')
    const markers: Array<{name: string; re: RegExp}> = [
        {name: 'select', re: /\bSELECT\b/gi},
        {name: 'from', re: /\bFROM\b/gi},
        {name: 'join', re: /\b(?:INNER|LEFT|RIGHT|FULL|CROSS)\s+JOIN\b|\bJOIN\b/gi},
        {name: 'where', re: /\bWHERE\b/gi},
        {name: 'group', re: /\bGROUP\s+BY\b/gi},
        {name: 'having', re: /\bHAVING\b/gi},
        {name: 'order', re: /\bORDER\s+BY\b/gi},
    ]
    let bestName = ''
    let bestIdx = -1
    for (const {name, re} of markers) {
        re.lastIndex = 0
        let match: RegExpExecArray | null
        while ((match = re.exec(s)) !== null) {
            if (match.index >= bestIdx) {
                bestIdx = match.index
                bestName = name
            }
        }
    }
    return bestName === 'select'
}

const SORT_DIRECTION_PREFIX = /^(?:a(?:sc?)?|d(?:e(?:sc?)?)?)$/i

/** 剥离正在输入的 ASC/DESC 前缀，避免误伤未写完的排序列 */
function stripTrailingSortDirectionPrefix(orderList: string): string {
    const trimmed = orderList.trimEnd()
    const match = /\s+([A-Za-z_][\w$]*)$/i.exec(trimmed)
    if (!match?.[1] || !SORT_DIRECTION_PREFIX.test(match[1])) return trimmed
    return trimmed.slice(0, match.index).trimEnd()
}

function unquoteIdent(value: string): string {
    return value.replace(/^[`"'\[]|[`"'\]]$/g, '')
}

/** ORDER BY 末尾是否已是完整排序键（已知列 / 别名 / 序号），而非输入中的前缀 */
function isCompleteOrderBySortKey(
    orderList: string,
    segment: string,
    knownColumnNames: Set<string>,
): boolean {
    const list = stripTrailingSortDirectionPrefix(orderList)
    if (!list || /,\s*$/.test(list)) return false

    if (/\b\d+\s*$/.test(list)) return true

    const qualMatch = /\b([\w$]+)\.([`"'\[]?[\w$]+[`"'\]]?)\s*$/i.exec(list)
    if (qualMatch) {
        return isKnownColumnName(unquoteIdent(qualMatch[2]), knownColumnNames)
    }

    const bareMatch = /(?:^|,)\s*([`"'\[]?[A-Za-z_][\w$]*[`"'\]]?)\s*$/i.exec(list)
    if (!bareMatch?.[1]) return false
    const name = unquoteIdent(bareMatch[1])
    if (isKnownColumnName(name, knownColumnNames)) return true

    const lower = name.toLowerCase()
    for (const item of orderBySelectItems(segment)) {
        if (item.alias?.toLowerCase() === lower) return true
        if (item.expression.toLowerCase() === lower) return true
    }
    return false
}

function detectAfterCompleteColumnRef(input: ComputeSignalsInput): boolean {
    const {segment, slot, columnPrefix, resolvedTable, knownColumns, knownColumnNames} = input
    if (segmentEndsWithOperator(segment)) return false

    if (slot === 'column_ref' && columnPrefix && columnPrefix !== '*') {
        if (resolvedTable) {
            const cols = knownColumns[resolvedTable] ?? knownColumns[resolvedTable.toLowerCase()]
            if (cols?.some((c) => c.name.toLowerCase() === columnPrefix.toLowerCase())) return true
        }
        // 别名暂未解析时：列名已在 schema 中则视为完成态，避免再推同名字段
        if (isKnownColumnName(columnPrefix, knownColumnNames)) return true
    }

    if (PREDICATE_SLOTS.has(slot)) {
        const qualMatch = /\b([\w$]+)\.([\w$]+)\s*$/i.exec(segment.trimEnd())
        if (qualMatch) {
            const col = qualMatch[2]
            if (col && isKnownColumnName(col, knownColumnNames)) return true
        }

        const unqualMatch = /\b(?:AND|OR|WHERE|HAVING|ON|SET|,)\s+([\w$]+)\s*$/i.exec(segment.trimEnd())
        if (unqualMatch?.[1]) {
            const col = unqualMatch[1]
            if (isKnownColumnName(col, knownColumnNames)) return true
        }
    }

    if (slot === 'order_by') {
        const tail = segment.trimEnd()
        if (/\b(ASC|DESC)\s*$/i.test(tail)) return false
        const match = /\bORDER BY\s+(.+)$/i.exec(tail)
        if (!match?.[1]?.trim()) return false
        return isCompleteOrderBySortKey(match[1], segment, knownColumnNames)
    }

    return false
}

function detectAfterConditionConnector(segment: string, slot: SqlCompletionSlot): boolean {
    if (!PREDICATE_SLOTS.has(slot) && slot !== 'where' && slot !== 'having' && slot !== 'on') {
        return false
    }
    const tail = segment.trimEnd()
    if (/\b(AND|OR)\s*$/i.test(tail)) return true
    if (/\bWHERE\s+1\s*=\s*1\s+AND\s*$/i.test(tail)) return true
    return false
}

function detectAfterPredicateOperator(segment: string, slot: SqlCompletionSlot): boolean {
    if (!PREDICATE_SLOTS.has(slot)) return false
    if (segmentEndsWithOperator(segment)) return true
    // `= pr` / `LIKE pa`：仍在填右值，保持 pick_value（列 + 字面量）
    if (segmentHasIncompletePredicateRhs(segment)) return true
    const tail = segment.trimEnd()
    if (/\b(LIKE|IN|IS|BETWEEN)\s+$/i.test(tail)) return true
    return false
}

/** 单一入口：从 segment + 作用域计算全部语法信号 */
export function computeGrammarSignals(input: ComputeSignalsInput): GrammarSignals {
    const {segment, slot, fromJoin} = input
    const signals = emptySignals()

    signals.column_ref = slot === 'column_ref'
    signals.after_comma = detectAfterComma(segment, slot)
    signals.after_select_aggregate = detectAfterSelectAggregateKeyword(segment, slot)
    signals.after_complete_on_predicate = detectAfterCompleteOnPredicate(segment, slot)
    const whereOrHavingComplete = detectAfterCompleteWherePredicate(segment, slot)
    signals.after_complete_where_predicate = slot === 'where' && whereOrHavingComplete
    signals.after_complete_having_predicate = slot === 'having' && whereOrHavingComplete
    signals.after_complete_group_by_list = detectAfterCompleteGroupByList(segment, slot)

    const clauseComplete =
        signals.after_complete_on_predicate ||
        signals.after_complete_where_predicate ||
        signals.after_complete_having_predicate

    signals.after_complete_column_ref = clauseComplete
        ? false
        : detectAfterCompleteColumnRef(input)

    signals.after_condition_connector =
        !signals.after_complete_column_ref && detectAfterConditionConnector(segment, slot)

    signals.after_predicate_operator =
        !signals.after_complete_column_ref &&
        !signals.after_condition_connector &&
        detectAfterPredicateOperator(segment, slot)

    signals.order_by_after_column =
        slot === 'order_by' &&
        signals.after_complete_column_ref &&
        !/\b(ASC|DESC)\s*$/i.test(segment.trimEnd())

    signals.after_complete_order_by =
        slot === 'order_by' && /\b(ASC|DESC)\s*$/i.test(segment.trimEnd())

    // 列项写完（trim 后以标识符结尾）；勿对 trimEnd 后再要求 \\s+$（恒失败）
    // `t1.col|`（无尾随空格）另见 after_select_list_complete_col
    const selectListTail = segment.trimEnd()
    signals.after_select_list_item =
        slot === 'select_list' &&
        !signals.after_comma &&
        !signals.after_select_aggregate &&
        /(?:^|,|\bSELECT\b)\s*(?:DISTINCT\s+)?(?:[\w$]+\.)?[\w$]+$/i.test(selectListTail) &&
        !/\b(AS|DISTINCT|ALL|SELECT)$/i.test(selectListTail)

    signals.after_select_list_complete_col =
        slot === 'column_ref' &&
        signals.after_complete_column_ref &&
        isSelectListRegion(segment) &&
        /(?:^|,|\bSELECT\b)\s*(?:DISTINCT\s+)?(?:[\w$]+\.)?[\w$]+$/i.test(selectListTail) &&
        !/\b(AS|DISTINCT|ALL|SELECT)$/i.test(selectListTail)

    signals.from_awaiting_on_clause = fromJoin?.awaitingOnClause === true
    signals.from_table_clause_complete =
        fromJoin?.tableClauseComplete === true && !fromJoin?.awaitingOnClause
    signals.from_awaiting_table_name = fromJoin?.awaitingTableName === true
    signals.from_awaiting_join_table = fromJoin?.awaitingJoinTable === true

    signals.keyword_first_slot = isKeywordFirstContext(
        slot,
        signals.after_comma,
        signals.after_condition_connector,
        signals.after_predicate_operator,
    )

    signals.ddl_awaiting_column_type = detectDdlAwaitingColumnType(segment)
    signals.ddl_after_alter_table = detectDdlAfterAlterTable(segment)
    signals.insert_in_column_list = detectInsertInColumnList(segment)
    signals.after_insert_column_list = detectAfterInsertColumnList(segment)
    signals.after_complete_set_assignment =
        !signals.after_predicate_operator &&
        !signals.after_complete_column_ref &&
        detectAfterCompleteSetAssignment(segment, slot)

    return signals
}

export function hasSignal(ctx: { signals: GrammarSignals }, id: Exclude<TransitionId, 'always'>): boolean {
    return ctx.signals[id] === true
}
