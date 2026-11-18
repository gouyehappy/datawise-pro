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
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'

/**
 * SQL / 视图模型编辑器 Tab：执行、保存、AI。
 * 仅当本 Tab 是当前激活工作台时生效——workspace 用 visibility 常驻壳而非
 * KeepAlive，pageActive 不会随切 Tab 变 false，必须显式按 activeTabId 守卫，
 * 否则多个控制台 Tab 会同时监听并争抢同一组合键（保存/执行串台）。
 */
export function useSqlEditorShortcuts(
    ownerId: string,
    handlers: WatchSource<LocalSqlEditorShortcutHandlers>,
) {
    const layout = useLayoutStore()
    const shortcuts = useShortcutSettingsStore()
    const workspace = useWorkspaceStore()
    usePageLocalShortcuts(ownerId, {
        isActive: () => layout.isDatabaseModule && workspace.activeTabId === ownerId,
        actions: handlers,
        canExecuteAction: (id: LocalSqlEditorShortcutId) =>
            canExecuteShortcutAction(id as ShortcutActionId),
        getBinding: (id: LocalSqlEditorShortcutId) => shortcuts.getBinding(id),
    })
}

export type {LocalSqlEditorShortcutHandlers}
