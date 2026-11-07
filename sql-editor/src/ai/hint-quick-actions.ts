import type {SqlCompletionContext} from '@sql-editor/completion/context'
import type {SqlCompletionPlan} from '@sql-editor/completion/grammar/types'
import {resolveAiAssistScenarios} from '@sql-editor/ai/completion-scenarios'
import {sqlEditorT} from '@sql-editor/i18n'
import type {SqlEditorLocale, SqlQuickAction} from '@sql-editor/types'

export function resolveAiQuickActionsForContext(
    ctx: SqlCompletionContext,
    plan: Pick<SqlCompletionPlan, 'stage' | 'keywordSlot'>,
    options: {
        aiReady: boolean
        hasSelection: boolean
        locale: SqlEditorLocale
    },
): SqlQuickAction[] {
    if (!options.aiReady) return []

    const scenarios = resolveAiAssistScenarios(ctx, plan, {
        hasSelection: options.hasSelection,
        locale: options.locale,
    })

    return scenarios.map((scenario) => ({
        id: scenario.id,
        label: sqlEditorT(options.locale, scenario.labelKey as Parameters<typeof sqlEditorT>[1]),
        insertText: '',
        kind: 'text',
        titleKey: scenario.titleKey,
        aiAction: scenario.action,
        aiPrompt: scenario.prompt,
    }))
}
