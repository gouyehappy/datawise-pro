/**
 * Community workbench iframes stay mounted in WorkspaceArea (visibility toggle).
 * Cap concurrent iframes separately from Vue KeepAlive (WORKSPACE_KEEPALIVE_MAX).
 */
import type {WorkspaceTab} from '@/core/types'

/** Soft cap for live community-workbench iframes (CEF-heavy). */
export const COMMUNITY_WORKBENCH_IFRAME_MAX = 8

const focusSeqByTabId = new Map<string, number>()
let focusClock = 0

export function touchCommunityWorkbenchFocus(tabId: string): void {
    if (!tabId) return
    focusSeqByTabId.set(tabId, ++focusClock)
}

export function forgetCommunityWorkbenchFocus(tabId: string): void {
    focusSeqByTabId.delete(tabId)
}

/** Test helper — reset focus order between isolated unit tests. */
export function resetCommunityWorkbenchFocusForTests(): void {
    focusSeqByTabId.clear()
    focusClock = 0
}

export function listCommunityWorkbenchTabs(tabs: readonly WorkspaceTab[]): WorkspaceTab[] {
    return tabs.filter((tab) => tab.type === 'community-workbench' && Boolean(tab.pluginId?.trim()))
}

/**
 * Oldest focus first; tabs never focused sort before focused ones (FIFO of open order via clock 0).
 */
export function pickCommunityWorkbenchEvictionVictim(
    tabs: readonly WorkspaceTab[],
    protectIds: ReadonlySet<string>,
): string | null {
    const candidates = listCommunityWorkbenchTabs(tabs).filter((tab) => !protectIds.has(tab.id))
    if (!candidates.length) return null
    candidates.sort((a, b) => (focusSeqByTabId.get(a.id) ?? 0) - (focusSeqByTabId.get(b.id) ?? 0))
    return candidates[0]?.id ?? null
}

/**
 * Call before opening a new community workbench: evict until length < max so the
 * subsequent create stays at/under the soft cap. Never closes protected ids (active tab).
 * Uses the normal closeTab path so sidecar dispose still runs.
 */
export function ensureCommunityWorkbenchIframeCapacity(options: {
    tabs: WorkspaceTab[]
    activeTabId: string | null
    closeTab: (tabId: string) => void
    max?: number
}): void {
    const max = options.max ?? COMMUNITY_WORKBENCH_IFRAME_MAX
    if (max <= 0) return
    const protect = new Set<string>()
    if (options.activeTabId) protect.add(options.activeTabId)

    // Bound loops — never close the only remaining protected set.
    for (let i = 0; i < max + 4; i++) {
        const community = listCommunityWorkbenchTabs(options.tabs)
        if (community.length < max) return
        const victimId = pickCommunityWorkbenchEvictionVictim(options.tabs, protect)
        if (!victimId) return
        options.closeTab(victimId)
        forgetCommunityWorkbenchFocus(victimId)
    }
}
