import {hasSignal, hasTablesInQuery} from '@sql-editor/completion/context'
import type {SqlCompletionContext} from '@sql-editor/completion/context'
import type {SqlCompletionPlan} from '@sql-editor/completion/grammar/types'
import type {SqlEditorAiAction, SqlEditorLocale} from '@sql-editor/types'

export interface AiAssistScenario {
    id: string
    action: SqlEditorAiAction
    labelKey: string
    titleKey: string
    prompt?: string
    sortIndex: number
}

const MAX_SCENARIOS = 3

function isZh(locale: SqlEditorLocale): boolean {
    return locale.startsWith('zh')
}

function pushScenario(
    list: AiAssistScenario[],
    scenario: AiAssistScenario,
    seen: Set<string>,
) {
    if (seen.has(scenario.id) || list.length >= MAX_SCENARIOS) return
    seen.add(scenario.id)
    list.push(scenario)
}

/** 按补全上下文解析 AI 场景（HintBar 芯片 + 补全列表共用） */
export function resolveAiAssistScenarios(
    ctx: SqlCompletionContext,
    plan: Pick<SqlCompletionPlan, 'stage' | 'keywordSlot'>,
    options: { hasSelection: boolean; locale: SqlEditorLocale },
): AiAssistScenario[] {
    const scenarios: AiAssistScenario[] = []
    const seen = new Set<string>()
    const zh = isZh(options.locale)

    if (options.hasSelection) {
        pushScenario(
            scenarios,
            {
                id: 'ai-explain',
                action: 'explain',
                labelKey: 'completion.ai.explain',
                titleKey: 'completion.ai.explain_title',
                sortIndex: 0,
            },
            seen,
        )
        pushScenario(
            scenarios,
            {
                id: 'ai-optimize',
                action: 'optimize',
                labelKey: 'completion.ai.optimize',
                titleKey: 'completion.ai.optimize_title',
                sortIndex: 1,
            },
            seen,
        )
    }

    if (ctx.slot === 'statement_start') {
        pushScenario(
            scenarios,
            {
                id: 'ai-generate-query',
                action: 'generate',
                labelKey: 'completion.ai.generate',
                titleKey: 'completion.ai.generate_title',
                prompt: zh ? '写一条 SELECT 查询' : 'Write a SELECT query',
                sortIndex: 2,
            },
            seen,
        )
        return scenarios
    }

    if (
        plan.stage === 'table.clause_next' ||
        ctx.fromJoin?.tableClauseComplete ||
        plan.keywordSlot === 'after_table'
    ) {
        pushScenario(
            scenarios,
            {
                id: 'ai-clause-next',
                action: 'generate',
                labelKey: 'completion.ai.clause_next',
                titleKey: 'completion.ai.clause_next_title',
                prompt: zh ? '补全 WHERE 或 JOIN 子句' : 'Complete WHERE or JOIN clause',
                sortIndex: 2,
            },
            seen,
        )
    }

    if (ctx.slot === 'where' && !hasSignal(ctx, 'after_predicate_operator')) {
        pushScenario(
            scenarios,
            {
                id: 'ai-where',
                action: 'generate',
                labelKey: 'completion.ai.where',
                titleKey: 'completion.ai.where_title',
                prompt: zh ? '写 WHERE 过滤条件' : 'Write WHERE filter conditions',
                sortIndex: 3,
            },
            seen,
        )
    }

    if (ctx.slot === 'select_list' && hasTablesInQuery(ctx)) {
        pushScenario(
            scenarios,
            {
                id: 'ai-select-list',
                action: 'generate',
                labelKey: 'completion.ai.select_list',
                titleKey: 'completion.ai.select_list_title',
                prompt: zh ? '补全 SELECT 列与聚合' : 'Complete SELECT columns and aggregates',
                sortIndex: 4,
            },
            seen,
        )
    }

    if (
        plan.stage === 'predicate.after_where_complete' ||
        plan.stage === 'predicate.after_on_complete' ||
        plan.keywordSlot === 'after_where' ||
        plan.keywordSlot === 'after_on'
    ) {
        pushScenario(
            scenarios,
            {
                id: 'ai-after-where',
                action: 'generate',
                labelKey: 'completion.ai.after_where',
                titleKey: 'completion.ai.after_where_title',
                prompt: zh ? '补全 GROUP BY / ORDER BY 等后续子句' : 'Complete GROUP BY, ORDER BY, etc.',
                sortIndex: 5,
            },
            seen,
        )
    }

    if (ctx.slot === 'group_by') {
        pushScenario(
            scenarios,
            {
                id: 'ai-group-by',
                action: 'generate',
                labelKey: 'completion.ai.group_by',
                titleKey: 'completion.ai.group_by_title',
                prompt: zh ? '补全 GROUP BY 列' : 'Complete GROUP BY columns',
                sortIndex: 6,
            },
            seen,
        )
    }

    if (scenarios.length === 0 && !options.hasSelection) {
        pushScenario(
            scenarios,
            {
                id: 'ai-generate-fallback',
                action: 'generate',
                labelKey: 'completion.ai.generate',
                titleKey: 'completion.ai.generate_title',
                sortIndex: 9,
            },
            seen,
        )
    }

    return scenarios.slice(0, MAX_SCENARIOS)
}

export function matchesAiAssistPrefix(prefix: string): boolean {
    if (!prefix) return true
    const lower = prefix.toLowerCase()
    return 'ai'.startsWith(lower) || lower.startsWith('ai')
}
