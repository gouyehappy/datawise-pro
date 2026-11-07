import type {SqlCompletionContext} from '../context'
import type {SqlCompletionPlan} from '../grammar/types'
import {resolveAiAssistScenarios} from '@sql-editor/ai/completion-scenarios'
import {getActiveSqlEditorRuntime} from '@sql-editor/runtime/sql-editor-runtime'
import {categoryCompletionLabel, completionItemKind} from '../completion-labels'
import {buildFilterText} from '../filter-text'
import {completionSort} from './sort-state'
import type {SuggestPush, SuggestTextRange} from '../suggest-types'
import {localeT, typeT} from './collector-locale'

export const SQL_EDITOR_AI_ASSIST_COMMAND = 'sqlEditor.aiAssist'

export function collectAiAssistSuggestions(
    ctx: SqlCompletionContext,
    push: SuggestPush,
    range: SuggestTextRange,
    prefix: string,
    plan: SqlCompletionPlan,
) {
    void prefix
    const runtime = getActiveSqlEditorRuntime()
    const selectedText = runtime.getSelectedText()
    const scenarios = resolveAiAssistScenarios(ctx, plan, {
        hasSelection: Boolean(selectedText),
        locale: runtime.getLocale(),
    })

    const aiType = typeT('ai')
    let index = 0
    for (const scenario of scenarios) {
        const label = localeT(scenario.labelKey)
        push({
            label: categoryCompletionLabel(label, aiType),
            kind: completionItemKind('ai'),
            insertText: '',
            detail: localeT('completion.ai.detail'),
            filterText: buildFilterText(label, ['ai', scenario.action, label]),
            range,
            sortText: completionSort('ai', index++),
            command: {
                id: SQL_EDITOR_AI_ASSIST_COMMAND,
                title: localeT(scenario.titleKey),
                arguments: [{action: scenario.action, prompt: scenario.prompt ?? ''}],
            },
        })
    }
}
