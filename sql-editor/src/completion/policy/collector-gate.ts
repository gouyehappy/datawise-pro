import {isSqlEditorAiCompletionEnabled} from '@sql-editor/ai/settings'
import {matchesAiAssistPrefix} from '@sql-editor/ai/completion-scenarios'
import {getActiveSqlEditorRuntime} from '@sql-editor/runtime/sql-editor-runtime'
import type {SqlCompletionContext} from '../context'
import {hasSignal} from '../context'
import type {SqlCompletionPlan} from '../grammar/types'
import type {CompletionCollector} from '../completion-collectors'
import type {SqlCompletionSlot} from '@sql-editor/types'

/** 列名匹配策略（模板字段，集中门控） */
export type ColumnMatchMode =
    | 'off'
    | 'allow-empty'
    | 'prefix-only'
    | 'prefix-or-chain'

const COLUMN_COLLECTORS = new Set<CompletionCollector>([
    'columns',
    'aliasDotStar',
    'aliasComplete',
    'starExpansion',
    'fkOn',
])

const NO_COLUMN_STAGES = new Set<string>([
    'predicate.after_on_complete',
    'predicate.after_where_complete',
    'predicate.after_having_complete',
    'predicate.after_column',
    // pick_value 允许列/别名（ON/WHERE = 右侧）；字面量由 predicateValues 并行
    'group_by.clause_next',
    'join.on_keyword',
    'table.clause_next',
    'update.after_table',
    'update.after_set_item',
    'delete.after_table',
    'ddl.after_table',
    'select_list.after_aggregate',
    'select_list.after_item',
    'order_by.after_column',
    'order_by.clause_next',
])

function defaultColumnMatch(stage: string | undefined): ColumnMatchMode {
    if (!stage) return 'prefix-only'
    if (stage === 'predicate.pick_column' || stage === 'predicate.pick_fk_on_column') return 'allow-empty'
    if (stage === 'predicate.after_connector' || stage === 'update.set') return 'allow-empty'
    if (stage === 'insert.pick_column' || stage === 'insert.values') return 'allow-empty'
    if (
        stage === 'group_by.pick_column' ||
        stage === 'group_by.after_comma' ||
        stage === 'order_by.pick_column' ||
        stage === 'order_by.after_comma'
    ) {
        return 'allow-empty'
    }
    if (stage === 'select_list.after_comma') return 'prefix-or-chain'
    if (stage === 'select_list.default') return 'allow-empty'
    return 'prefix-only'
}

export function resolveColumnMatchMode(plan: SqlCompletionPlan): ColumnMatchMode {
    if (plan.columnMatch) return plan.columnMatch
    return defaultColumnMatch(plan.stage)
}

function shouldRunKeywordCollector(
    plan: SqlCompletionPlan,
    ctx: SqlCompletionContext,
    prefix: string,
): boolean {
    if (plan.keywordPhase === 'none') return false
    // SELECT 列表空前缀仍给出 FROM / DISTINCT（及列后 AS）top-N
    if (plan.keywordPhase === 'clause-prefix' && !prefix) {
        if (
            plan.keywordSlot !== 'select_list' &&
            plan.stage !== 'select_list.default' &&
            plan.stage !== 'select_list.after_comma' &&
            plan.stage !== 'select_list.after_item'
        ) {
            return false
        }
    }
    // 列后正在打别名（SELECT id u|）：不要用 AS/FROM 关键字抢补全
    if (
        (plan.keywordPhase === 'clause-prefix' || ctx.slot === 'select_list') &&
        prefix.trim()
    ) {
        const p = prefix.toLowerCase()
        const mayBeKeyword = ['as', 'from', 'distinct'].some((kw) => kw.startsWith(p))
        if (!mayBeKeyword) {
            const trimmed = ctx.segment.trimEnd()
            const withoutPrefix =
                trimmed.toLowerCase().endsWith(p) && trimmed.length >= prefix.length
                    ? trimmed.slice(0, trimmed.length - prefix.length).trimEnd()
                    : trimmed
            const afterItem =
                hasSignal(ctx, 'after_select_list_item') ||
                /(?:^|,|\bSELECT\b)\s*(?:DISTINCT\s+)?(?:[\w$]+\.)?[\w$]+$/i.test(withoutPrefix)
            if (afterItem) return false
        }
    }
    if (ctx.slot === 'column_ref' && !hasSignal(ctx, 'after_complete_column_ref')) return false
    if (hasSignal(ctx, 'after_condition_connector') && !prefix) return false
    if (hasSignal(ctx, 'after_predicate_operator')) return false
    return true
}

function planAllowsSnippets(
    plan: Pick<SqlCompletionPlan, 'keywordPhase' | 'keywordSlot'>,
    slot: SqlCompletionSlot,
): boolean {
    if (plan.keywordPhase === 'none') {
        return slot === 'statement_start' || slot === 'from' || slot === 'join'
    }
    if (plan.keywordPhase === 'clause-next') return true
    if (plan.keywordPhase === 'clause-prefix') return true
    if (plan.keywordPhase === 'insert-clause-next') return true
    if (plan.keywordPhase === 'update-clause-next') return true
    if (plan.keywordPhase === 'ddl-alter-next') return true
    return plan.keywordPhase === 'all'
}

function shouldRunSnippetCollector(
    plan: SqlCompletionPlan,
    ctx: SqlCompletionContext,
    prefix: string,
): boolean {
    if (hasSignal(ctx, 'after_condition_connector') && !prefix) return false
    if (ctx.fromJoin?.clauseKeywordPrefix && !ctx.fromJoin.joinKeywordPrefix) return false
    // 子句关键字优先：空前缀不抢戏；打出前缀后再出相关片段
    if (
        (plan.keywordPhase === 'clause-next' || plan.keywordPhase === 'clause-prefix') &&
        !prefix.trim()
    ) {
        return false
    }
    return planAllowsSnippets(plan, ctx.slot)
}

/** 是否应运行某收集器（grammar 阶段 + 前缀策略，单一门控） */
export function shouldRunCollector(
    collector: CompletionCollector,
    plan: SqlCompletionPlan,
    ctx: SqlCompletionContext,
    prefix: string,
): boolean {
    if (collector === 'keywords') {
        return shouldRunKeywordCollector(plan, ctx, prefix)
    }
    if (collector === 'functions') {
        // 字母前缀：正常函数补全；空前缀仅 SELECT 列表注入常用函数（见 collectFunctionSuggestions）
        return !prefix || /[A-Za-z_]/.test(prefix)
    }
    if (collector === 'snippets') {
        return shouldRunSnippetCollector(plan, ctx, prefix)
    }
    if (collector === 'predicateValues') {
        return hasSignal(ctx, 'after_predicate_operator')
    }
    if (collector === 'aiAssist') {
        const ai = getActiveSqlEditorRuntime().getEffectiveSettings().ai
        if (!isSqlEditorAiCompletionEnabled(ai)) return false
        return matchesAiAssistPrefix(prefix)
    }

    if (!COLUMN_COLLECTORS.has(collector)) return true
    if (plan.stage && NO_COLUMN_STAGES.has(plan.stage)) return false

    const mode = resolveColumnMatchMode(plan)
    if (mode === 'off') return false

    if (mode === 'allow-empty') return true

    if (mode === 'prefix-or-chain') {
        if (prefix.length > 0) return true
        return hasSignal(ctx, 'after_comma')
    }

    return prefix.length > 0
}
