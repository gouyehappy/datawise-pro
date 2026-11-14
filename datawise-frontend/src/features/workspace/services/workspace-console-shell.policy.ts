/**
 * SQL console shell persistence (PERF-01).
 *
 * Consoles stay mounted in WorkspaceArea (visibility toggle) so Monaco keeps
 * cursor / undo / scroll. Cap concurrent shelled consoles with LRU among
 * non-protected tabs — never close the tab, only drop the shell so a later
 * activate remounts. Floated + active/main consoles are always protected.
 */
import type {WorkspaceTab} from '@/core/types'

/** Soft cap for mounted SQL console shells (Monaco-heavy). */
export const WORKSPACE_CONSOLE_SHELL_MAX = 8

const focusSeqByTabId = new Map<string, number>()
let focusClock = 0

export function touchConsoleShellFocus(tabId: string): void {
    if (!tabId) return
    focusSeqByTabId.set(tabId, ++focusClock)
}

export function forgetConsoleShellFocus(tabId: string): void {
    focusSeqByTabId.delete(tabId)
}

/** Test helper — reset focus order between isolated unit tests. */
export function resetConsoleShellFocusForTests(): void {
    focusSeqByTabId.clear()
    focusClock = 0
}

export function listConsoleTabs(tabs: readonly WorkspaceTab[]): WorkspaceTab[] {
    return tabs.filter((tab) => tab.type === 'console')
}

/**
 * Which console tab ids may stay in the workspace shell.
 * Protected ids always win; remaining slots go to most recently focused.
 * If protected alone exceeds max, all protected stay (cannot drop active/float).
 */
export function selectConsoleShellPersistIds(options: {
    tabs: readonly WorkspaceTab[]
    protectIds: ReadonlySet<string>
    max?: number
}): Set<string> {
    const max = options.max ?? WORKSPACE_CONSOLE_SHELL_MAX
    const consoles = listConsoleTabs(options.tabs)
    const out = new Set<string>()
    if (!consoles.length || max <= 0) return out

    const protectedConsoles = consoles.filter((tab) => options.protectIds.has(tab.id))
    for (const tab of protectedConsoles) out.add(tab.id)

    if (out.size >= max) return out

    const rest = consoles
        .filter((tab) => !out.has(tab.id))
        .sort((a, b) => (focusSeqByTabId.get(b.id) ?? 0) - (focusSeqByTabId.get(a.id) ?? 0))

    for (const tab of rest) {
        if (out.size >= max) break
        out.add(tab.id)
    }
    return out
}
