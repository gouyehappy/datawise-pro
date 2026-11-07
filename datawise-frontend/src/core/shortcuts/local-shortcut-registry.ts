import type {LocalSqlEditorShortcutId} from '@/core/shortcuts/scope'
import {
    clearLocalShortcutHandlers as clearLocalShortcutHandlersPkg,
    clearPageLocalShortcuts as clearPageLocalShortcutsPkg,
    getActivePageLocalShortcutOwner as getActivePageLocalShortcutOwnerPkg,
    getLocalShortcutHandlers as getLocalShortcutHandlersPkg,
    getPageLocalShortcutState as getPageLocalShortcutStatePkg,
    invokeLocalShortcut as invokeLocalShortcutPkg,
    setLocalShortcutHandlers as setLocalShortcutHandlersPkg,
    setPageLocalShortcuts as setPageLocalShortcutsPkg,
    type PageLocalShortcutState as PageLocalShortcutStatePkg,
} from '@datawise/shortcuts'

type LocalShortcutHandler = () => void

export type PageLocalShortcutState = Omit<PageLocalShortcutStatePkg, 'actionHandlers'> & {
    actionHandlers: Partial<Record<LocalSqlEditorShortcutId, LocalShortcutHandler>>
}

export function setPageLocalShortcuts(ownerId: string, state: PageLocalShortcutState) {
    setPageLocalShortcutsPkg(ownerId, state)
}

export function clearPageLocalShortcuts(ownerId: string) {
    clearPageLocalShortcutsPkg(ownerId)
}

export function getActivePageLocalShortcutOwner(): string | null {
    return getActivePageLocalShortcutOwnerPkg()
}

export function getPageLocalShortcutState(): PageLocalShortcutState {
    return getPageLocalShortcutStatePkg() as PageLocalShortcutState
}

export function invokeLocalShortcut(actionId: LocalSqlEditorShortcutId): boolean {
    return invokeLocalShortcutPkg(actionId)
}

/** @deprecated use getPageLocalShortcutState */
export function getLocalShortcutHandlers() {
    return getLocalShortcutHandlersPkg() as Partial<
        Record<LocalSqlEditorShortcutId, LocalShortcutHandler>
    >
}

/** @deprecated use setPageLocalShortcuts */
export function setLocalShortcutHandlers(
    handlers: Partial<Record<LocalSqlEditorShortcutId, LocalShortcutHandler | undefined>>,
) {
    setLocalShortcutHandlersPkg(handlers)
}

/** @deprecated use clearPageLocalShortcuts */
export function clearLocalShortcutHandlers() {
    clearLocalShortcutHandlersPkg()
}
