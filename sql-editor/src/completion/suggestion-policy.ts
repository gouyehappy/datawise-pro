/**
 * 补全建议策略：何时展示表/列/别名/片段。
 * 关键字列表由 dt-sql-parser 提供，见 plan-keywords.ts。
 */
import type {SqlCompletionSlot, SqlStatementKind} from '@sql-editor/types'
import type {SqlCompletionContext} from './context'
import {mergeDialectSnippets} from '@sql-editor/constants/dialect-snippets'
import type {SqlSnippet} from '@sql-editor/types'
import {
    getConfiguredGlobalSnippets,
    getConfiguredSlotSnippets,
} from '@sql-editor/config/snippets'
import {isKeywordFirstContext, KEYWORD_FIRST_SLOTS} from './keyword-first'
import {mergeSnippetSources} from './snippet-sources'
import {isSnippetExpansionContext} from './snippet-context'

export {isKeywordFirstContext, KEYWORD_FIRST_SLOTS} from './keyword-first'

const COLUMN_SLOTS = new Set<SqlCompletionSlot>([
    'column_ref', 'select_list', 'where', 'having', 'order_by', 'group_by', 'on', 'set', 'insert_columns',
])

const TABLE_SLOTS = new Set<SqlCompletionSlot>(['from', 'join', 'insert_columns', 'update_table'])
const ALIAS_DOT_SLOTS = new Set<SqlCompletionSlot>(['select_list', 'where', 'on', 'having', 'order_by', 'group_by'])

export function shouldSuggestTables(ctx: Pick<SqlCompletionContext, 'slot' | 'fromJoin'>): boolean {
    if (!TABLE_SLOTS.has(ctx.slot)) return false
    if (ctx.fromJoin?.awaitingJoinTable) return true
    if (ctx.fromJoin?.awaitingTableName) return true
    if (ctx.fromJoin?.awaitingOnClause) return false
    if (ctx.fromJoin?.tableClauseComplete) return false
    return true
}

export function shouldSuggestColumns(
    slot: SqlCompletionSlot,
    hasTables: boolean,
    afterCompleteColumnRef = false,
): boolean {
    if (afterCompleteColumnRef) return false
    if (!COLUMN_SLOTS.has(slot)) return false
    if (slot === 'column_ref') return true
    return hasTables
}

export function shouldSuggestAliasDotStar(slot: SqlCompletionSlot, hasTables: boolean): boolean {
    return slot === 'select_list' && hasTables
}

export function shouldSuggestAliasComplete(
    slot: SqlCompletionSlot,
    hasTables: boolean,
    afterCompleteColumnRef = false,
): boolean {
    if (afterCompleteColumnRef) return false
    if (slot === 'group_by' || slot === 'order_by') return false
    return ALIAS_DOT_SLOTS.has(slot) && hasTables
}

/** 语句开头或输入片段前缀时展示模板；同 label 去重，槽位片段优先于全局片段 */
export function snippetsForContext(
    statement: SqlStatementKind,
    slot: SqlCompletionSlot,
    prefix: string,
    segment = '',
): SqlSnippet[] {
    if (!isSnippetExpansionContext(statement, slot, segment)) return []

    const slotSnippets = mergeDialectSnippets([...getConfiguredSlotSnippets(slot)], slot)
    const includeGlobals =
        statement === 'empty' || statement === 'unknown' || slot === 'statement_start'
    return mergeSnippetSources(slotSnippets, getConfiguredGlobalSnippets(), includeGlobals, prefix)
}
