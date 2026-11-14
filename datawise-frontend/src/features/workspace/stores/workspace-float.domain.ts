/**
 * Workspace tab float windowing domain (FE-P0-3 store Phase B).
 * Factory over shared store refs — `useWorkspaceStore` remains the public facade.
 */
import {ref, type Ref} from 'vue'
import type {WorkspaceTab} from '@/core/types'
import {
    clampTabFloatOpacity,
    clampTabFloatToBounds,
    layoutMinimizedFloatStrip,
    layoutTabFloatsCascade,
    layoutTabFloatsTile,
    placeNewTabFloat,
    TAB_FLOAT_DEFAULT_HEIGHT,
    TAB_FLOAT_DEFAULT_WIDTH,
    TAB_FLOAT_MIN_HEIGHT,
    TAB_FLOAT_MIN_WIDTH,
    TAB_FLOAT_OPACITY_DEFAULT,
    type TabFloatArrangeMode,
    type TabFloatSnapGuide,
    type WorkspaceTabFloatMap,
    type WorkspaceTabFloatRect,
    type WorkspaceTabFloatState,
} from '@/features/workspace/services/workspace-tab-float.service'

const TAB_FLOAT_OPACITY_STORAGE_KEY = 'dw.workspace.tabFloatOpacity'

export type WorkspaceFloatDomainDeps = {
    tabs: Ref<WorkspaceTab[]>
    activeTabId: Ref<string | null>
    /** Late-bound: activate may raise floats and touch connection state. */
    activateTab: (tabId: string) => void
    /** Optional: community workbench focus when a tab is floated. */
    onCommunityWorkbenchFloated?: (tabId: string) => void
}

function readStoredTabFloatOpacity(): number {
    try {
        if (typeof localStorage === 'undefined') return TAB_FLOAT_OPACITY_DEFAULT
        return clampTabFloatOpacity(Number(localStorage.getItem(TAB_FLOAT_OPACITY_STORAGE_KEY)))
    } catch {
        return TAB_FLOAT_OPACITY_DEFAULT
    }
}

export function createWorkspaceFloatDomain(deps: WorkspaceFloatDomainDeps) {
    /** Floated tab windows inside the workspace body (no hard cap). */
    const tabFloats = ref<WorkspaceTabFloatMap>({})
    /** Edge-snap preview while dragging a float title bar. */
    const tabFloatSnapGuide = ref<TabFloatSnapGuide | null>(null)
    /** Shared opacity for all floating tab windows (0.55–1). */
    const tabFloatOpacity = ref(readStoredTabFloatOpacity())
    let tabFloatZTop = 20

    function isTabFloated(tabId: string): boolean {
        return Boolean(tabFloats.value[tabId])
    }

    function floatedTabIds(): string[] {
        return Object.keys(tabFloats.value)
    }

    function getTabFloat(tabId: string): WorkspaceTabFloatState | null {
        return tabFloats.value[tabId] ?? null
    }

    function raiseTabFloat(tabId: string) {
        const current = tabFloats.value[tabId]
        if (!current) return
        tabFloatZTop += 1
        tabFloats.value = {
            ...tabFloats.value,
            [tabId]: {...current, zIndex: tabFloatZTop},
        }
    }

    function patchTabFloat(tabId: string, patch: Partial<WorkspaceTabFloatState>) {
        const current = tabFloats.value[tabId]
        if (!current) return
        tabFloats.value = {
            ...tabFloats.value,
            [tabId]: {...current, ...patch},
        }
    }

    function clearTabFloat(tabId: string) {
        if (!tabFloats.value[tabId]) return
        const next = {...tabFloats.value}
        delete next[tabId]
        tabFloats.value = next
    }

    /** Clear all floats (e.g. session restore). */
    function resetAllTabFloats() {
        tabFloats.value = {}
        tabFloatSnapGuide.value = null
        tabFloatZTop = 20
    }

    /**
     * Pop a tab into a floating window inside the workspace body.
     * `bounds` is the workspace-body size used for placement / clamping.
     */
    function floatTab(
        tabId: string,
        bounds: {width: number; height: number},
        preferred?: (Partial<WorkspaceTabFloatRect> & {maximized?: boolean}) | null,
    ) {
        if (!deps.tabs.value.some((tab) => tab.id === tabId)) return
        if (tabFloats.value[tabId]) {
            raiseTabFloat(tabId)
            deps.activeTabId.value = tabId
            return
        }
        const rect = placeNewTabFloat(Object.keys(tabFloats.value).length, bounds, preferred)
        const maximized = Boolean(preferred?.maximized)
        tabFloatZTop += 1
        tabFloats.value = {
            ...tabFloats.value,
            [tabId]: {
                ...rect,
                zIndex: tabFloatZTop,
                minimized: false,
                maximized,
                restoreRect: maximized
                    ? {
                          x: Math.max(16, (bounds.width - TAB_FLOAT_DEFAULT_WIDTH) / 2),
                          y: Math.max(16, (bounds.height - TAB_FLOAT_DEFAULT_HEIGHT) / 2),
                          width: Math.min(TAB_FLOAT_DEFAULT_WIDTH, bounds.width - 48),
                          height: Math.min(TAB_FLOAT_DEFAULT_HEIGHT, bounds.height - 48),
                      }
                    : undefined,
            },
        }
        deps.activeTabId.value = tabId
        const tab = deps.tabs.value.find((item) => item.id === tabId)
        if (tab?.type === 'community-workbench') {
            deps.onCommunityWorkbenchFloated?.(tabId)
        }
    }

    function dockTab(tabId: string) {
        if (!tabFloats.value[tabId]) return
        clearTabFloat(tabId)
        deps.activateTab(tabId)
    }

    function setTabFloatSnapGuide(guide: TabFloatSnapGuide | null) {
        tabFloatSnapGuide.value = guide
    }

    function setTabFloatOpacity(value: number) {
        tabFloatOpacity.value = clampTabFloatOpacity(value)
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(TAB_FLOAT_OPACITY_STORAGE_KEY, String(tabFloatOpacity.value))
            }
        } catch {
            // ignore quota / private mode
        }
    }

    function relayoutMinimizedFloats(bounds: {width: number; height: number}) {
        const minimizedIds = Object.keys(tabFloats.value).filter((id) => tabFloats.value[id]?.minimized)
        if (!minimizedIds.length) return
        const strip = layoutMinimizedFloatStrip(minimizedIds.length, bounds)
        const next = {...tabFloats.value}
        minimizedIds.forEach((id, index) => {
            const cur = next[id]
            const slot = strip[index]
            if (!cur || !slot) return
            next[id] = {
                ...cur,
                x: slot.x,
                y: slot.y,
                width: slot.width,
                // Keep stored height for restore; chrome uses minimized height when rendering.
                maximized: false,
            }
        })
        tabFloats.value = next
    }

    /**
     * Keep open (non-minimized) tab floats inside the workspace body after it resizes.
     * Maximized floats re-fill the body; others keep size when possible and only shift/shrink.
     */
    function clampOpenTabFloatsToBounds(bounds: {width: number; height: number}) {
        const ids = Object.keys(tabFloats.value)
        if (!ids.length) return
        const margin = 8
        let changed = false
        const next = {...tabFloats.value}
        for (const id of ids) {
            const cur = next[id]
            if (!cur || cur.minimized) continue
            const target = cur.maximized
                ? {
                    x: margin,
                    y: margin,
                    width: Math.max(TAB_FLOAT_MIN_WIDTH, bounds.width - margin * 2),
                    height: Math.max(TAB_FLOAT_MIN_HEIGHT, bounds.height - margin * 2),
                }
                : cur
            const clamped = clampTabFloatToBounds(target, bounds, margin)
            if (
                clamped.x !== cur.x
                || clamped.y !== cur.y
                || clamped.width !== cur.width
                || clamped.height !== cur.height
            ) {
                next[id] = {...cur, ...clamped}
                changed = true
            }
        }
        if (changed) tabFloats.value = next
    }

    function toggleTabFloatMinimized(tabId: string, bounds?: {width: number; height: number}) {
        const current = tabFloats.value[tabId]
        if (!current) return
        const nextMinimized = !current.minimized
        if (nextMinimized) {
            patchTabFloat(tabId, {
                minimized: true,
                maximized: false,
                restoreRect: current.restoreRect ?? {
                    x: current.x,
                    y: current.y,
                    width: current.width,
                    height: current.height,
                },
            })
            if (bounds) relayoutMinimizedFloats(bounds)
        } else {
            const restored = current.restoreRect
            patchTabFloat(tabId, {
                minimized: false,
                ...(restored
                    ? {x: restored.x, y: restored.y, width: restored.width, height: restored.height}
                    : {}),
                restoreRect: undefined,
            })
            if (bounds) relayoutMinimizedFloats(bounds)
        }
        raiseTabFloat(tabId)
    }

    function toggleTabFloatMaximized(tabId: string, bounds: {width: number; height: number}) {
        const current = tabFloats.value[tabId]
        if (!current) return
        if (current.maximized) {
            const restored = current.restoreRect ?? {
                x: current.x,
                y: current.y,
                width: Math.min(TAB_FLOAT_DEFAULT_WIDTH, bounds.width - 32),
                height: Math.min(TAB_FLOAT_DEFAULT_HEIGHT, bounds.height - 32),
            }
            patchTabFloat(tabId, {
                ...restored,
                maximized: false,
                minimized: false,
                restoreRect: undefined,
            })
        } else {
            const margin = 8
            patchTabFloat(tabId, {
                restoreRect: {
                    x: current.x,
                    y: current.y,
                    width: current.width,
                    height: current.height,
                },
                x: margin,
                y: margin,
                width: Math.max(TAB_FLOAT_MIN_WIDTH, bounds.width - margin * 2),
                height: Math.max(TAB_FLOAT_MIN_HEIGHT, bounds.height - margin * 2),
                maximized: true,
                minimized: false,
            })
        }
        raiseTabFloat(tabId)
    }

    function arrangeTabFloats(mode: TabFloatArrangeMode, bounds: {width: number; height: number}) {
        const ids = Object.keys(tabFloats.value).filter((id) => !tabFloats.value[id]?.minimized)
        if (!ids.length) return
        const layouts = mode === 'tile'
            ? layoutTabFloatsTile(ids.length, bounds)
            : layoutTabFloatsCascade(ids.length, bounds)
        const next = {...tabFloats.value}
        ids.forEach((id, index) => {
            const cur = next[id]
            const slot = layouts[index]
            if (!cur || !slot) return
            next[id] = {
                ...cur,
                ...slot,
                maximized: false,
                minimized: false,
                restoreRect: undefined,
            }
        })
        tabFloats.value = next
        relayoutMinimizedFloats(bounds)
    }

    function dockAllTabFloats() {
        const ids = Object.keys(tabFloats.value)
        if (!ids.length) return
        tabFloats.value = {}
        tabFloatSnapGuide.value = null
        const focus = ids.includes(deps.activeTabId.value ?? '')
            ? deps.activeTabId.value
            : ids[ids.length - 1]
        if (focus) deps.activateTab(focus)
    }

    return {
        tabFloats,
        tabFloatSnapGuide,
        tabFloatOpacity,
        isTabFloated,
        floatedTabIds,
        getTabFloat,
        raiseTabFloat,
        patchTabFloat,
        clearTabFloat,
        resetAllTabFloats,
        floatTab,
        dockTab,
        setTabFloatSnapGuide,
        setTabFloatOpacity,
        relayoutMinimizedFloats,
        clampOpenTabFloatsToBounds,
        toggleTabFloatMinimized,
        toggleTabFloatMaximized,
        arrangeTabFloats,
        dockAllTabFloats,
    }
}

export type WorkspaceFloatDomain = ReturnType<typeof createWorkspaceFloatDomain>
