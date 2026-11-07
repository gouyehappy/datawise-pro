import type {SqlEditorSchema, SqlCompletionSlot} from '@sql-editor/types'
import type {SqlCompletionContext} from '../context'
import type {CompletionCollector} from '../completion-collectors'
import type {SqlCompletionPlan} from '../grammar/types'
import {collectPredicateValueSuggestions} from '../predicate-values'
import {shouldRunCollector} from '../policy/collector-gate'
import type {SuggestEditorSlice, SuggestPush, SuggestTextRange} from '../suggest-types'
import {
    collectAliasComplete,
    collectAliasDotStar,
    collectColumnSuggestions,
    collectStarExpansion,
} from './column-collectors'
import {
    collectFkJoinLineSuggestions,
    collectFkOnSuggestions,
    collectTableSuggestions,
} from './table-collectors'
import {
    collectDdlTypeSuggestions,
    collectFunctionSuggestions,
    collectKeywordSuggestions,
    collectSnippetSuggestions,
} from './keyword-snippet-collectors'
import {collectAiAssistSuggestions} from './ai-assist-collector'
import {collectRecentSqlSuggestions} from './recent-sql-collector'

export type CompletionPush = SuggestPush

export interface RunCollectorsInput {
    ctx: SqlCompletionContext
    plan: SqlCompletionPlan
    push: SuggestPush
    editor: SuggestEditorSlice
    range: SuggestTextRange
    prefix: string
    hasTables: boolean
    schema: SqlEditorSchema
}

export function runCollectors(input: RunCollectorsInput): void {
    const {ctx, plan, push, editor, range, prefix, hasTables, schema} = input
    const snippetSlot =
        plan.keywordSlot === 'after_table'
            ? (ctx.statement === 'delete'
                ? 'where'
                : ctx.slot === 'join' || ctx.slot === 'from'
                    ? 'join'
                    : 'where')
            : plan.keywordSlot === 'after_where'
                ? 'group_by'
                : (plan.keywordSlot as SqlCompletionSlot)

    const runCollector = (name: CompletionCollector) => {
        switch (name) {
            case 'fkJoinLines':
                collectFkJoinLineSuggestions(ctx, push, editor, range, prefix)
                break
            case 'tables':
                if (!plan.suppressTables) collectTableSuggestions(ctx, push, editor, range, prefix, plan)
                break
            case 'keywords':
                collectKeywordSuggestions(ctx, push, editor, range, prefix, plan)
                break
            case 'functions':
                collectFunctionSuggestions(ctx, push, range, prefix, plan, editor.lineBeforeCursor)
                break
            case 'snippets':
                collectSnippetSuggestions(ctx, push, range, prefix, snippetSlot, plan)
                break
            case 'columns':
                collectColumnSuggestions(ctx, push, range, prefix, hasTables, editor.lineBeforeCursor)
                break
            case 'aliasDotStar':
                collectAliasDotStar(ctx, push, range, prefix, hasTables)
                break
            case 'aliasComplete':
                collectAliasComplete(ctx, push, range, prefix, hasTables)
                break
            case 'starExpansion':
                collectStarExpansion(ctx, push, range, prefix, hasTables, editor.lineBeforeCursor)
                break
            case 'fkOn':
                collectFkOnSuggestions(ctx, push, range, prefix)
                break
            case 'predicateValues':
                collectPredicateValueSuggestions(ctx, push, range, prefix, schema, schema.tables)
                break
            case 'ddlTypes':
                collectDdlTypeSuggestions(push, range, prefix)
                break
            case 'aiAssist':
                collectAiAssistSuggestions(ctx, push, range, prefix, plan)
                break
            case 'recentSql':
                collectRecentSqlSuggestions(ctx, push, range, prefix, plan)
                break
        }
    }

    for (const collector of plan.collectors) {
        if (!shouldRunCollector(collector, plan, ctx, prefix)) continue
        runCollector(collector)
    }

    if (shouldRunCollector('aiAssist', plan, ctx, prefix)) {
        runCollector('aiAssist')
    }
}
