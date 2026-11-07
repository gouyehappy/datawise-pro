import {onMounted, onUnmounted} from 'vue'
import {executeShortcutAction} from '@/core/shortcuts/execute-action'
import {
    EDITABLE_TARGET_GLOBAL_SHORTCUT_IDS,
    GLOBAL_SHORTCUT_ACTION_IDS,
} from '@/core/shortcuts/scope'
import {
    isEditableTarget,
    isTerminalTarget,
    matchesBinding,
    stripTrailingShortcutHint,
} from '@/core/shortcuts/shortcut.service'
import type {ShortcutActionId} from '@/core/shortcuts/types'
import {useShortcutSettingsStore} from '@/features/settings/stores/shortcut-settings-store'
import {useAppPalette} from '@/features/layout/composables/useAppPalette'
import {useLockScreenStore} from '@/features/auth/stores/lock-screen-store'

/**
 * 全局快捷键唯一入口（AppShell 挂载）。
 * 局部快捷键（如 SQL 编辑器执行/保存）由 usePageLocalShortcuts 在对应页面注入。
 */

export function useAppShortcutListener() {
    const shortcuts = useShortcutSettingsStore()
    const {togglePalette} = useAppPalette()
    const lockScreen = useLockScreenStore()

    function tryExecuteShortcuts(event: KeyboardEvent, actionIds: ShortcutActionId[]): boolean {
        for (const actionId of actionIds) {
            const binding = shortcuts.getBinding(actionId)
            if (!binding || !matchesBinding(event, binding)) continue
            if (!executeShortcutAction(actionId)) continue
            event.preventDefault()
            event.stopImmediatePropagation()
            return true
        }
        return false
    }

    function onKeydown(event: KeyboardEvent) {
        if (lockScreen.locked) {
            return
        }

        const key = event.key.toLowerCase()
        if ((event.ctrlKey || event.metaKey) && key === 'k') {
            event.preventDefault()
            togglePalette()
            return
        }

        // SSH / xterm: never steal keys before the PTY (textarea matches editable target).
        if (isTerminalTarget(event.target)) {
            return
        }

        if (isEditableTarget(event.target)) {
            if (tryExecuteShortcuts(event, EDITABLE_TARGET_GLOBAL_SHORTCUT_IDS)) return
            return
        }

        if (tryExecuteShortcuts(event, GLOBAL_SHORTCUT_ACTION_IDS)) return
    }

    onMounted(() => window.addEventListener('keydown', onKeydown, true))
    onUnmounted(() => window.removeEventListener('keydown', onKeydown, true))
}

export function formatShortcutLabel(actionId: ShortcutActionId): string {
    const shortcuts = useShortcutSettingsStore()
    return shortcuts.getDisplayBinding(actionId)
}

export function shortcutTooltip(label: string, actionId: ShortcutActionId): string {
    const hint = formatShortcutLabel(actionId)
    const base = stripTrailingShortcutHint(label)
    return hint ? `${base} (${hint})` : base
}
