import {computed, onUnmounted, toValue, watch, type ComputedRef, type WatchSource} from 'vue'
import {usePageLocalEventListener} from '@/core/composables/usePageLocalEventListener'
import {usePageLocalActive} from '@/core/composables/usePageLocalActive'
import {
    LOCAL_SQL_EDITOR_SHORTCUT_IDS,
    type LocalSqlEditorShortcutId,
} from '@/core/shortcuts/scope'
import {
    clearPageLocalShortcuts,
    setPageLocalShortcuts,
    type PageLocalShortcutState,
} from '@/core/shortcuts/local-shortcut-registry'
import {SHORTCUT_DEFINITIONS} from '@/core/shortcuts/definitions'
import {isTerminalTarget, matchesBinding} from '@/core/shortcuts/shortcut.service'

export type LocalSqlEditorShortcutHandlers = Partial<
    Record<LocalSqlEditorShortcutId, (() => void) | undefined>
>

export interface PageLocalShortcutsOptions {
    /** 额外激活条件（如数据库工作台模块可见） */
    isActive?: WatchSource<boolean>
    /** 设置页可配置的局部动作 */
    actions?: WatchSource<LocalSqlEditorShortcutHandlers>
    /** 页面私有固定组合键（不进全局监听，避免 A/B 页同键串台） */
    keys?: WatchSource<Record<string, (() => void) | undefined>>
    /** Host injects feature-permission gate for configured actions. */
    canExecuteAction?: (id: LocalSqlEditorShortcutId) => boolean
    /** Host injects current binding lookup for configured actions. */
    getBinding?: (id: LocalSqlEditorShortcutId) => string
}

function defaultGetBinding(id: LocalSqlEditorShortcutId): string {
    return SHORTCUT_DEFINITIONS.find((def) => def.id === id)?.defaultBinding ?? ''
}

function buildState(
    actions: LocalSqlEditorShortcutHandlers | undefined,
    keys: Record<string, (() => void) | undefined> | undefined,
): PageLocalShortcutState {
    const actionHandlers: Partial<Record<LocalSqlEditorShortcutId, () => void>> = {}
    if (actions) {
        for (const [id, handler] of Object.entries(actions) as Array<
            [LocalSqlEditorShortcutId, (() => void) | undefined]
        >) {
            if (handler) actionHandlers[id] = handler
        }
    }
    const keyHandlers = new Map<string, () => void>()
    if (keys) {
        for (const [binding, handler] of Object.entries(keys)) {
            const trimmed = binding.trim()
            if (trimmed && handler) keyHandlers.set(trimmed, handler)
        }
    }
    return {actionHandlers, keyHandlers}
}

/**
 * 页面局部快捷键：仅 owner 页面挂载且 isActive 为真时注入；离开页面 / 模块隐藏后自动解绑。
 * 同一按键在不同页面可有不同 handler，但不会同时生效。
 */
export function usePageLocalShortcuts(ownerId: string, options: PageLocalShortcutsOptions) {
    const lifecycleActive = usePageLocalActive()
    const canExecuteAction = options.canExecuteAction ?? (() => true)
    const getBinding = options.getBinding ?? defaultGetBinding

    const pageActive: ComputedRef<boolean> = computed(() => {
        if (!lifecycleActive.value) return false
        if (options.isActive === undefined) return true
        return Boolean(toValue(options.isActive))
    })

    watch(
        () => ({
            active: pageActive.value,
            actions: options.actions ? toValue(options.actions) : undefined,
            keys: options.keys ? toValue(options.keys) : undefined,
        }),
        ({active, actions, keys}) => {
            if (!active) {
                clearPageLocalShortcuts(ownerId)
                return
            }
            setPageLocalShortcuts(ownerId, buildState(actions, keys))
        },
        {immediate: true, deep: true},
    )

    onUnmounted(() => {
        clearPageLocalShortcuts(ownerId)
    })

    function onKeydown(raw: Event) {
        const event = raw as KeyboardEvent
        if (!pageActive.value || isTerminalTarget(event.target)) return

        const {actionHandlers, keyHandlers} = buildState(
            options.actions ? toValue(options.actions) : undefined,
            options.keys ? toValue(options.keys) : undefined,
        )

        for (const actionId of LOCAL_SQL_EDITOR_SHORTCUT_IDS) {
            const handler = actionHandlers[actionId]
            if (!handler) continue
            if (!canExecuteAction(actionId)) continue
            const binding = getBinding(actionId)
            if (!binding || !matchesBinding(event, binding)) continue
            event.preventDefault()
            event.stopImmediatePropagation()
            handler()
            return
        }

        for (const [binding, handler] of keyHandlers) {
            if (!matchesBinding(event, binding)) continue
            event.preventDefault()
            event.stopImmediatePropagation()
            handler()
            return
        }
    }

    usePageLocalEventListener(window, 'keydown', onKeydown, {capture: true}, pageActive)
}
