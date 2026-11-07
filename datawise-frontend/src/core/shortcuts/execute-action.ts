import {
    configureShortcutActions,
    executeShortcutAction,
    type ShortcutActionHandler,
} from '@datawise/shortcuts'
import type {ShortcutActionId} from '@/core/shortcuts/types'
import {isLocalShortcutId} from '@/core/shortcuts/scope'

export type GlobalShortcutActionHandler = ShortcutActionHandler

type GlobalShortcutActionsConfig = {
    canExecute: (actionId: ShortcutActionId) => boolean
    handlers: Partial<Record<ShortcutActionId, GlobalShortcutActionHandler>>
}

/** Features layer registers handlers once at AppShell boot. */
export function configureGlobalShortcutActions(next: GlobalShortcutActionsConfig): void {
    configureShortcutActions({
        canExecute: (actionId) => next.canExecute(actionId as ShortcutActionId),
        handlers: next.handlers as Partial<Record<string, ShortcutActionHandler>>,
        // Host product list — works before / without package registry hydration.
        isLocal: (actionId) => isLocalShortcutId(actionId as ShortcutActionId),
    })
}

export {executeShortcutAction}
