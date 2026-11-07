import type {SqlCompletionContext} from '../context'
import {hasSignal} from '../context'
import {isFromJoinQualifiedTrailingDot} from '@sql-editor/utils/from-qualified-input'
import {isCursorInStringOrComment} from '../sql-scan'
import {isMandatoryColumnSuggestContext} from '../trigger-policy'

/** 与 Monaco CompletionTriggerKind 数值对齐：0 = Invoke，1 = TriggerCharacter */
export type CompletionTriggerKind = number

/**
 * 补全弹出策略（按优先级）：
 * 1. 字符串 / 注释内 → 一律不补全
 * 2. 表名已完整且别名在光标后（orders| ord）→ 不补全
 * 3. 自动触发且当前词无前缀 → 仅允许结构性上下文（见 allowsEmptyPrefixCompletion）
 * 4. 手动 Ctrl+Space（triggerKind === 0）→ 跳过规则 3
 */

export function allowsEmptyPrefixCompletion(ctx: SqlCompletionContext): boolean {
    if (ctx.slot === 'column_ref') return true
    if (ctx.slot === 'values') return true
    if (hasSignal(ctx, 'insert_in_column_list')) return true
    if (hasSignal(ctx, 'after_complete_set_assignment')) return true
    if (hasSignal(ctx, 'ddl_after_alter_table')) return true
    if (
        (ctx.slot === 'on' || ctx.slot === 'where' || ctx.slot === 'having' || ctx.slot === 'set') &&
        !hasSignal(ctx, 'after_complete_column_ref') &&
        !hasSignal(ctx, 'after_predicate_operator')
    ) {
        return true
    }
    if (ctx.fromJoin?.awaitingJoinTable || ctx.fromJoin?.awaitingTableName) return true
    if (ctx.fromJoin?.awaitingOnClause) return true
    if (
        (ctx.slot === 'from' || ctx.slot === 'join')
        && ctx.fromJoin?.tablePrefix
        && isFromJoinQualifiedTrailingDot(ctx.fromJoin.tablePrefix)
    ) {
        return true
    }
    if (ctx.fromJoin?.joinKeywordPrefix) return false
    if (ctx.fromJoin?.tableClauseComplete && !ctx.fromJoin.aliasOnLineAfterCursor) return true
    if (hasSignal(ctx, 'after_predicate_operator')) return true
    if (hasSignal(ctx, 'after_complete_on_predicate')) return true
    if (hasSignal(ctx, 'after_complete_where_predicate')) return true
    if (hasSignal(ctx, 'after_complete_group_by_list')) return true
    if (hasSignal(ctx, 'after_select_aggregate')) return true
    if (hasSignal(ctx, 'after_complete_column_ref')) return true
    return false
}

export function shouldSuppressEmptyPrefixCompletion(
    prefix: string,
    ctx: SqlCompletionContext,
    triggerKind: CompletionTriggerKind,
): boolean {
    if (prefix.length > 0) return false
    if (triggerKind === 0) return false
    return !allowsEmptyPrefixCompletion(ctx)
}

export type CompletionGuardInput = {
    sql: string
    offset: number
    prefix: string
    ctx: SqlCompletionContext
    triggerKind: CompletionTriggerKind
}

/** 是否应中止本次补全请求。 */
export function shouldAbortCompletion(input: CompletionGuardInput): boolean {
    if (isCursorInStringOrComment(input.sql, input.offset)) return true
    // 全局：alias. 后必须列补全，优先于其它抑制规则
    if (isMandatoryColumnSuggestContext(input.ctx)) return false
    if (
        input.ctx.fromJoin?.aliasOnLineAfterCursor &&
        input.ctx.fromJoin.tableClauseComplete
    ) {
        return true
    }
    // 刚选中 SELECT 等语句头关键字后，Monaco 常会立即再弹列表；等用户继续输入或 Ctrl+Space
    const segmentTrimmed = input.ctx.segment.trimEnd()
    if (
        input.triggerKind !== 0 &&
        input.prefix.length === 0 &&
        /^\s*SELECT\s*$/i.test(segmentTrimmed)
    ) {
        return true
    }
    // 表名刚选中（尚未输入空格）：仅允许空格或 Ctrl+Space 触发，禁止自动弹框
    if (
        input.triggerKind !== 0 &&
        input.triggerKind !== 1 &&
        input.prefix.length === 0 &&
        input.ctx.fromJoin?.tableClauseComplete &&
        !input.ctx.fromJoin.aliasOnLineAfterCursor &&
        !/\s$/.test(segmentTrimmed)
    ) {
        return true
    }
    if (input.prefix.length > 0 && input.ctx.fromJoin?.joinKeywordPrefix) return false
    if (input.prefix.length > 0 && input.ctx.fromJoin?.clauseKeywordPrefix) return false
    if (shouldSuppressEmptyPrefixCompletion(input.prefix, input.ctx, input.triggerKind)) {
        return true
    }
    return false
}
