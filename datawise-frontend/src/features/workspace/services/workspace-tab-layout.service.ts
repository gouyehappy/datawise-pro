import type {WorkspaceTab} from '@/core/types'

export interface WorkspaceTabGroup {
    id: string
    title: string
    collapsed?: boolean
    /** User renamed the group — keep title when members change. */
    titleCustom?: boolean
}

export type TabDropZone = 'before' | 'on' | 'after' | 'end'

export type TabBarSegment =
    | {kind: 'tab'; tab: WorkspaceTab}
    | {kind: 'group'; group: WorkspaceTabGroup; tabs: WorkspaceTab[]}

/** Middle band = stack/group; sides = insert before/after. */
export function resolveTabDropZone(clientX: number, rect: DOMRect): TabDropZone {
    const ratio = rect.width > 0 ? (clientX - rect.left) / rect.width : 0.5
    if (ratio < 0.28) return 'before'
    if (ratio > 0.72) return 'after'
    return 'on'
}

/**
 * Sticky zones reduce flicker while crossing the group/reorder boundary.
 * Once in `on`, stay until clearly into the edge bands.
 */
export function resolveTabDropZoneSticky(
    clientX: number,
    rect: DOMRect,
    previous: TabDropZone | null,
): TabDropZone {
    const ratio = rect.width > 0 ? (clientX - rect.left) / rect.width : 0.5
    if (previous === 'on') {
        if (ratio < 0.2) return 'before'
        if (ratio > 0.8) return 'after'
        return 'on'
    }
    if (previous === 'before' && ratio < 0.35) return 'before'
    if (previous === 'after' && ratio > 0.65) return 'after'
    return resolveTabDropZone(clientX, rect)
}

export function moveTabRelative(
    tabs: WorkspaceTab[],
    draggedId: string,
    targetId: string,
    place: 'before' | 'after',
): WorkspaceTab[] {
    if (draggedId === targetId) return tabs
    const from = tabs.findIndex((tab) => tab.id === draggedId)
    const to = tabs.findIndex((tab) => tab.id === targetId)
    if (from < 0 || to < 0) return tabs

    const next = tabs.slice()
    const [item] = next.splice(from, 1)
    let insertAt = next.findIndex((tab) => tab.id === targetId)
    if (insertAt < 0) return tabs
    if (place === 'after') insertAt += 1
    next.splice(insertAt, 0, item)
    return next
}

/**
 * Edge reorder: move beside target. Keep group only when landing next to a
 * sibling of the same group; otherwise ungroup the dragged tab.
 */
export function reorderTabByDrop(
    tabs: WorkspaceTab[],
    draggedId: string,
    targetId: string,
    place: 'before' | 'after',
): WorkspaceTab[] {
    const moved = moveTabRelative(tabs, draggedId, targetId, place)
    const idx = moved.findIndex((tab) => tab.id === draggedId)
    if (idx < 0) return moved

    const dragged = moved[idx]
    const left = moved[idx - 1]
    const right = moved[idx + 1]
    // Stay in / join a group only when sandwiched between two members.
    // Landing before the first or after the last member ejects onto the main bar.
    const nextGroupId =
        left?.tabGroupId && left.tabGroupId === right?.tabGroupId
            ? left.tabGroupId
            : undefined
    if (dragged.tabGroupId === nextGroupId) return moved

    return moved.map((tab) =>
        tab.id === draggedId ? {...tab, tabGroupId: nextGroupId} : tab,
    )
}

/** Pull a tab out of its group and park it on the main strip (end, or beside a tab). */
export function ejectTabByDrop(
    tabs: WorkspaceTab[],
    draggedId: string,
    targetId: string | null,
    place: 'before' | 'after' | 'end',
): WorkspaceTab[] {
    const cleared = tabs.map((tab) =>
        tab.id === draggedId ? {...tab, tabGroupId: undefined} : tab,
    )
    if (place === 'end' || !targetId || targetId === draggedId) {
        const from = cleared.findIndex((tab) => tab.id === draggedId)
        if (from < 0) return cleared
        const next = cleared.slice()
        const [item] = next.splice(from, 1)
        next.push(item)
        return next
    }
    return moveTabRelative(cleared, draggedId, targetId, place)
}

export function mergeTabsByDrop(
    tabs: WorkspaceTab[],
    groups: WorkspaceTabGroup[],
    draggedId: string,
    targetId: string,
    createId: () => string,
    defaultTitle: string,
): {tabs: WorkspaceTab[]; groups: WorkspaceTabGroup[]} {
    if (draggedId === targetId) return {tabs, groups}

    const target = tabs.find((tab) => tab.id === targetId)
    const dragged = tabs.find((tab) => tab.id === draggedId)
    if (!target || !dragged) return {tabs, groups}

    let nextGroups = groups.slice()
    let groupId = target.tabGroupId

    if (!groupId) {
        groupId = createId()
        nextGroups.push({id: groupId, title: defaultTitle, collapsed: false})
    } else if (!nextGroups.some((group) => group.id === groupId)) {
        nextGroups.push({id: groupId, title: defaultTitle, collapsed: false})
    }

    let nextTabs = tabs.map((tab) => {
        if (tab.id === draggedId || tab.id === targetId) {
            return {...tab, tabGroupId: groupId}
        }
        return tab
    })

    // Place dragged immediately after target so the group stays contiguous.
    nextTabs = moveTabRelative(nextTabs, draggedId, targetId, 'after')
    nextGroups = pruneEmptyTabGroups(nextTabs, nextGroups)
    return {tabs: nextTabs, groups: nextGroups}
}

export function pruneEmptyTabGroups(
    tabs: WorkspaceTab[],
    groups: WorkspaceTabGroup[],
): WorkspaceTabGroup[] {
    const counts = new Map<string, number>()
    for (const tab of tabs) {
        const id = tab.tabGroupId
        if (!id) continue
        counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    // A group with a single tab is pointless — clear membership too at call sites that map tabs.
    return groups.filter((group) => (counts.get(group.id) ?? 0) >= 2)
}

/** Clear tabGroupId for singles left after prune. */
export function clearOrphanTabGroupIds(
    tabs: WorkspaceTab[],
    groups: WorkspaceTabGroup[],
): WorkspaceTab[] {
    const alive = new Set(groups.map((group) => group.id))
    const counts = new Map<string, number>()
    for (const tab of tabs) {
        const id = tab.tabGroupId
        if (!id || !alive.has(id)) continue
        counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    return tabs.map((tab) => {
        const id = tab.tabGroupId
        if (!id) return tab
        if (!alive.has(id) || (counts.get(id) ?? 0) < 2) {
            return {...tab, tabGroupId: undefined}
        }
        return tab
    })
}

export function dissolveTabGroup(
    tabs: WorkspaceTab[],
    groups: WorkspaceTabGroup[],
    groupId: string,
): {tabs: WorkspaceTab[]; groups: WorkspaceTabGroup[]} {
    return {
        tabs: tabs.map((tab) =>
            tab.tabGroupId === groupId ? {...tab, tabGroupId: undefined} : tab,
        ),
        groups: groups.filter((group) => group.id !== groupId),
    }
}

/**
 * Walk tabs in order; consecutive same tabGroupId collapse into one group segment.
 * Non-consecutive same id still render as separate clusters (merge ops keep contiguous).
 */
export function buildTabBarSegments(
    tabs: WorkspaceTab[],
    groups: WorkspaceTabGroup[],
): TabBarSegment[] {
    const byId = new Map(groups.map((group) => [group.id, group]))
    const segments: TabBarSegment[] = []
    let i = 0
    while (i < tabs.length) {
        const tab = tabs[i]
        const gid = tab.tabGroupId
        const group = gid ? byId.get(gid) : undefined
        if (!gid || !group) {
            segments.push({kind: 'tab', tab})
            i += 1
            continue
        }
        const cluster: WorkspaceTab[] = []
        while (i < tabs.length && tabs[i].tabGroupId === gid) {
            cluster.push(tabs[i])
            i += 1
        }
        if (cluster.length < 2) {
            for (const item of cluster) segments.push({kind: 'tab', tab: {...item, tabGroupId: undefined}})
        } else {
            segments.push({kind: 'group', group, tabs: cluster})
        }
    }
    return segments
}

function shortTitle(title: string, max = 14): string {
    const text = title.trim().replace(/\s+/g, ' ')
    if (!text) return ''
    if (text.length <= max) return text
    return `${text.slice(0, Math.max(1, max - 1))}…`
}

/** Strip trailing auto count (` · 3`) so rename / storage keep the name only. */
export function stripGroupTitleCount(title: string): string {
    return title.replace(/\s*·\s*\d+\s*$/u, '').trim()
}

/** Collapsed chip label: `SSH · 3`. */
export function formatGroupDisplayTitle(title: string, count: number): string {
    const base = stripGroupTitleCount(title) || title.trim()
    if (!base) return String(count)
    return `${base} · ${count}`
}

/** Auto group name only (count is appended at display time). */
export function defaultGroupTitle(tabs: WorkspaceTab[], fallback: string): string {
    if (!tabs.length) return fallback
    const types = new Set(tabs.map((tab) => tab.type))
    if (types.size === 1) {
        const type = tabs[0].type
        if (type === 'ssh-terminal') return 'SSH'
        if (type === 'community-workbench') {
            return shortTitle(tabs[0].title.split('@')[0] || 'Workbench', 12)
        }
        if (type === 'console') return 'SQL'
        if (type === 'terminal') return 'Terminal'
    }
    return shortTitle(tabs[0].title) || fallback
}
