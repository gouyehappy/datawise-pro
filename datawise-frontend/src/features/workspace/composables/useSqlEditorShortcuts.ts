import type {WatchSource} from 'vue'
import {
    usePageLocalShortcuts,
    type LocalSqlEditorShortcutHandlers,
} from '@/core/composables/usePageLocalShortcuts'
import type {LocalSqlEditorShortcutId} from '@/core/shortcuts/scope'
import type {ShortcutActionId} from '@/core/shortcuts/types'
import {canExecuteShortcutAction} from '@/features/auth/services/feature-permission.service'
import {useShortcutSettingsStore} from '@/features/settings/stores/shortcut-settings-store'
import {useLayoutStore} from '@/features/layout/stores/layout'

/** SQL / 视图模型编辑器 Tab：执行、保存、AI（仅数据库工作台且本 Tab 挂载时生效） */
export function useSqlEditorShortcuts(
    ownerId: string,
    handlers: WatchSource<LocalSqlEditorShortcutHandlers>,
) {
    const layout = useLayoutStore()
    const shortcuts = useShortcutSettingsStore()
    usePageLocalShortcuts(ownerId, {
        isActive: () => layout.isDatabaseModule,
        actions: handlers,
        canExecuteAction: (id: LocalSqlEditorShortcutId) =>
            canExecuteShortcutAction(id as ShortcutActionId),
        getBinding: (id: LocalSqlEditorShortcutId) => shortcuts.getBinding(id),
    })
}

export type {LocalSqlEditorShortcutHandlers}
