import type {WorkspaceTab} from '@/core/types'

/** Most-recently-used tab order helpers (active tab first). */
export function touchMruTabIds(mruIds: string[], tabId: string, openTabIds: string[]): string[] {
    const open = new Set(openTabIds)
    const next = [tabId, ...mruIds.filter((id) => id !== tabId && open.has(id))]
    for (const id of openTabIds) {
        if (!next.includes(id)) next.push(id)
    }
    return next.filter((id) => open.has(id))
}

export function pruneMruTabIds(mruIds: string[], openTabIds: string[]): string[] {
    const open = new Set(openTabIds)
    return mruIds.filter((id) => open.has(id))
}

export function resolveMruSwitcherTabs(
    mruIds: string[],
    tabs: WorkspaceTab[],
): WorkspaceTab[] {
    const byId = new Map(tabs.map((tab) => [tab.id, tab]))
    const ordered: WorkspaceTab[] = []
    for (const id of mruIds) {
        const tab = byId.get(id)
        if (tab) ordered.push(tab)
    }
    for (const tab of tabs) {
        if (!ordered.some((item) => item.id === tab.id)) ordered.push(tab)
    }
    return ordered
}

/** Advance highlight index while the MRU overlay is open. */
export function advanceMruHighlight(current: number, length: number, direction: 1 | -1): number {
    if (length <= 0) return 0
    return (current + direction + length) % length
}
