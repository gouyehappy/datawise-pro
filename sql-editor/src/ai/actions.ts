import type {SqlEditorAiAction, SqlEditorLocale} from '@sql-editor/types'

export type {SqlEditorAiAction} from '@sql-editor/types'

export const SQL_EDITOR_AI_ACTIONS: SqlEditorAiAction[] = [
    'generate',
    'explain',
    'optimize',
    'fix',
    'mock',
]

function isZhLocale(locale: SqlEditorLocale): boolean {
    return locale.startsWith('zh')
}

/** 无额外输入时是否允许提交（需配合选区或编辑器内容） */
export function aiActionAllowsEmptyPrompt(action: SqlEditorAiAction): boolean {
    return action === 'explain' || action === 'optimize'
}

export function resolveAiDefaultPrompt(
    action: SqlEditorAiAction,
    locale: SqlEditorLocale,
): string {
    const zh = isZhLocale(locale)
    switch (action) {
        case 'explain':
            return zh ? '逐步解释这段 SQL 的逻辑' : 'Explain this SQL step by step'
        case 'optimize':
            return zh ? '优化可读性与查询性能' : 'Optimize for readability and performance'
        case 'generate':
        case 'fix':
        case 'mock':
        default:
            return ''
    }
}

export function aiActionRequiresSelectionHint(action: SqlEditorAiAction): boolean {
    return action === 'explain' || action === 'optimize' || action === 'fix'
}
