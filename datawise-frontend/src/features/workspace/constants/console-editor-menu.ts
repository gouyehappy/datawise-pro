import type {ContextMenuItem} from '@/core/types'
import type {ComposerTranslation} from 'vue-i18n'

export function getSqlEditorMenu(t: ComposerTranslation, options?: {previewRows?: number}): ContextMenuItem[] {
    const previewRows = options?.previewRows ?? 100
    return [
        {id: 'run-selection', label: t('console.editorMenu.runSelection'), icon: 'run', shortcut: 'Ctrl+R', accent: true},
        {
            id: 'select-first-rows',
            label: t('console.editorMenu.selectFirstRows', {count: previewRows}),
            icon: 'run',
            shortcut: 'Ctrl+Shift+1',
        },
        {
            id: 'count-rows',
            label: t('console.editorMenu.countRows'),
            icon: 'run',
            shortcut: 'Ctrl+Shift+2',
        },
        {id: 'explain-plan', label: t('console.editorMenu.explainPlan'), icon: 'explain'},
        {id: 'explain', label: t('console.editorMenu.explain'), icon: 'explain'},
        {id: 'optimize', label: t('console.editorMenu.optimize'), icon: 'optimize'},
        {id: 'rewrite', label: t('console.editorMenu.rewrite'), icon: 'optimize'},
        {id: 'generate-insert', label: t('console.editorMenu.generateInsert'), icon: 'edit'},
        {id: 'suggest-index', label: t('console.editorMenu.suggestIndex'), icon: 'explain'},
        {id: 'divider-1', label: '', divider: true},
        {id: 'format', label: t('console.editorMenu.format'), icon: 'format'},
    ]
}
