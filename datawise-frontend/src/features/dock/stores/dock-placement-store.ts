import {defineStore} from 'pinia'
import {computed, ref} from 'vue'
import {
    cloneDefaultDockFloats,
    clampDockFloatToViewport,
    DEFAULT_DOCK_FLOATS,
    DEFAULT_DOCK_PLACEMENT,
    DOCK_DRAG_PANELS,
    maximizeDockFloatInViewport,
    normalizeDockPlacement,
    normalizePanelFloat,
    placeDockFloatInViewport,
    type DockDragPanel,
    type DockDropTarget,
    type DockFloatMap,
    type DockFloatRect,
    type DockPlacement,
    type ExplorerDockSide,
    type ShortcutDockSide,
    type TerminalDockSide,
    type WorkspaceDockSide,
} from '@/features/dock/types/dock.types'
import {ensureShortcutFloatContent} from '@/features/dock/services/ensure-shortcut-float-content'
import {DOCK_FLOAT_STACK_SPAN, DOCK_FLOAT_Z_INDEX} from '@/features/dock/dock-z'

export const useDockPlacementStore = defineStore('dock-placement', () => {
    const placement = ref<DockPlacement>({...DEFAULT_DOCK_PLACEMENT})
    const floats = ref<DockFloatMap>(cloneDefaultDockFloats())
    const draggingPanel = ref<DockDragPanel | null>(null)
    const hoverTarget = ref<DockDropTarget | null>(null)
    const maximized = ref<Record<DockDragPanel, boolean>>({
        explorer: false,
        terminal: false,
        shortcut: false,
        workspace: false,
    })
    const maximizeRestore = ref<Partial<DockFloatMap>>({})
    /** Last-raised float is last in the list (highest z). */
    const floatStack = ref<DockDragPanel[]>([...DOCK_DRAG_PANELS])

    const explorerSide = computed(() => placement.value.explorer)
    const terminalSide = computed(() => placement.value.terminal)
    const shortcutSide = computed(() => placement.value.shortcut)
    const workspaceSide = computed(() => placement.value.workspace)
    const isDragging = computed(() => draggingPanel.value != null)

    /** Convenience mirrors — keep existing call sites thin. */
    const terminalFloat = computed(() => floats.value.terminal)
    const explorerFloat = computed(() => floats.value.explorer)
    const shortcutFloat = computed(() => floats.value.shortcut)
    const workspaceFloat = computed(() => floats.value.workspace)

    function onShortcutEnteredFloat(prev: ShortcutDockSide) {
        if (prev === 'float') return
        queueMicrotask(() => ensureShortcutFloatContent())
    }

    function applyPlacement(next: Partial<DockPlacement> | null | undefined) {
        const prev = placement.value
        const prevShortcut = prev.shortcut
        placement.value = normalizeDockPlacement(next ?? DEFAULT_DOCK_PLACEMENT)
        for (const panel of DOCK_DRAG_PANELS) {
            if (prev[panel] === 'float' && placement.value[panel] !== 'float') {
                clearFloatMaximize(panel)
            }
        }
        if (placement.value.shortcut === 'float') onShortcutEnteredFloat(prevShortcut)
    }

    function floatRect(panel: DockDragPanel): DockFloatRect {
        return floats.value[panel]
    }

    function applyFloat(panel: DockDragPanel, next: Partial<DockFloatRect> | null | undefined) {
        floats.value = {
            ...floats.value,
            [panel]: clampDockFloatToViewport(normalizePanelFloat(panel, next)),
        }
    }

    function patchFloat(panel: DockDragPanel, rect: Partial<DockFloatRect>) {
        // Drop maximize session when the user resizes; position-only moves keep size.
        if (maximized.value[panel]) {
            const prev = floats.value[panel]
            const sizeChanged =
                (rect.width != null && rect.width !== prev.width)
                || (rect.height != null && rect.height !== prev.height)
            if (sizeChanged) clearFloatMaximize(panel)
        }
        floats.value = {
            ...floats.value,
            [panel]: clampDockFloatToViewport(
                normalizePanelFloat(panel, {...floats.value[panel], ...rect}),
            ),
        }
    }

    function setExplorerSide(side: ExplorerDockSide) {
        if (placement.value.explorer === 'float' && side !== 'float') clearFloatMaximize('explorer')
        placement.value = {...placement.value, explorer: side}
    }

    function setTerminalSide(side: TerminalDockSide) {
        if (placement.value.terminal === 'float' && side !== 'float') clearFloatMaximize('terminal')
        placement.value = {...placement.value, terminal: side}
    }

    function setShortcutSide(side: ShortcutDockSide) {
        const prev = placement.value.shortcut
        if (prev === 'float' && side !== 'float') clearFloatMaximize('shortcut')
        placement.value = {...placement.value, shortcut: side}
        if (side === 'float') onShortcutEnteredFloat(prev)
    }

    function setWorkspaceSide(side: WorkspaceDockSide) {
        if (placement.value.workspace === 'float' && side !== 'float') clearFloatMaximize('workspace')
        placement.value = {...placement.value, workspace: side}
    }

    function resetToClassic() {
        placement.value = {...DEFAULT_DOCK_PLACEMENT}
        floats.value = cloneDefaultDockFloats()
        draggingPanel.value = null
        hoverTarget.value = null
        maximized.value = {explorer: false, terminal: false, shortcut: false, workspace: false}
        maximizeRestore.value = {}
        floatStack.value = [...DOCK_DRAG_PANELS]
    }

    function raiseFloat(panel: DockDragPanel) {
        const stack = floatStack.value
        if (stack[stack.length - 1] === panel) return
        floatStack.value = [...stack.filter((id) => id !== panel), panel]
    }

    function floatZIndex(panel: DockDragPanel): number {
        const rank = floatStack.value.indexOf(panel)
        const offset = rank < 0 ? 0 : Math.min(rank, DOCK_FLOAT_STACK_SPAN - 1)
        return DOCK_FLOAT_Z_INDEX + offset
    }

    function beginDrag(panel: DockDragPanel) {
        raiseFloat(panel)
        draggingPanel.value = panel
        hoverTarget.value = null
    }

    function setHoverTarget(target: DockDropTarget | null) {
        const prev = hoverTarget.value
        if (prev === target) return
        if (
            prev
            && target
            && prev.panel === target.panel
            && prev.side === target.side
        ) {
            return
        }
        hoverTarget.value = target
    }

    function isPanelFloating(panel: DockDragPanel): boolean {
        return placement.value[panel] === 'float'
    }

    function isFloatMaximized(panel: DockDragPanel): boolean {
        return Boolean(maximized.value[panel])
    }

    function clearFloatMaximize(panel: DockDragPanel) {
        if (!maximized.value[panel] && !maximizeRestore.value[panel]) return
        maximized.value = {...maximized.value, [panel]: false}
        const next = {...maximizeRestore.value}
        delete next[panel]
        maximizeRestore.value = next
    }

    function toggleFloatMaximize(panel: DockDragPanel): boolean {
        if (!isPanelFloating(panel)) return false
        if (maximized.value[panel]) {
            const restored = maximizeRestore.value[panel]
            clearFloatMaximize(panel)
            if (restored) applyFloat(panel, restored)
            return true
        }
        maximizeRestore.value = {...maximizeRestore.value, [panel]: {...floats.value[panel]}}
        maximized.value = {...maximized.value, [panel]: true}
        // Bypass per-panel max width (explorer 560) so maximize can fill the window.
        floats.value = {
            ...floats.value,
            [panel]: maximizeDockFloatInViewport(),
        }
        return true
    }

    /** Park a newly floated panel in the viewport (no-op if already floating). */
    function prepareEnterFloat(panel: DockDragPanel) {
        if (isPanelFloating(panel)) return
        clearFloatMaximize(panel)
        applyFloat(panel, placeDockFloatInViewport(panel, floats.value[panel]))
        raiseFloat(panel)
    }

    function commitDrop(
        target: DockDropTarget | null,
        anchor?: {x: number; y: number} | null,
    ) {
        if (target) {
            if (target.side === 'float' && !isPanelFloating(target.panel)) {
                applyFloat(
                    target.panel,
                    placeDockFloatInViewport(target.panel, floats.value[target.panel], anchor),
                )
            }
            if (target.panel === 'explorer') setExplorerSide(target.side)
            else if (target.panel === 'terminal') setTerminalSide(target.side)
            else if (target.panel === 'shortcut') setShortcutSide(target.side)
            else setWorkspaceSide(target.side)
            if (target.side === 'float') raiseFloat(target.panel)
        }
        draggingPanel.value = null
        hoverTarget.value = null
    }

    function cancelDrag() {
        draggingPanel.value = null
        hoverTarget.value = null
    }

    /**
     * Repair floats after loading persisted layout: piled minimap-cursor stacks
     * and full-height windows that hide the SE resize handle.
     * Returns true when any rect changed (caller may persist).
     */
    function repairLoadedFloats(): boolean {
        if (typeof window === 'undefined') return false
        if (window.innerWidth < 320 || window.innerHeight < 240) return false
        const floating = DOCK_DRAG_PANELS.filter((panel) => isPanelFloating(panel))
        if (floating.length === 0) return false

        let piled = false
        for (let i = 0; i < floating.length && !piled; i++) {
            for (let j = i + 1; j < floating.length; j++) {
                if (Math.abs(floats.value[floating[i]].x - floats.value[floating[j]].x) < 96) {
                    piled = true
                    break
                }
            }
        }

        const maxComfortH = Math.round(window.innerHeight * 0.72)
        const oversized = floating.filter((panel) => floats.value[panel].height > maxComfortH)
        if (!piled && oversized.length === 0) return false

        const targets = piled ? floating : oversized
        let changed = false
        for (const panel of targets) {
            const prev = floats.value[panel]
            const next = placeDockFloatInViewport(panel, {
                width: Math.min(prev.width, DEFAULT_DOCK_FLOATS[panel].width),
                height: Math.min(prev.height, DEFAULT_DOCK_FLOATS[panel].height),
            })
            if (
                prev.x !== next.x
                || prev.y !== next.y
                || prev.width !== next.width
                || prev.height !== next.height
            ) {
                applyFloat(panel, next)
                changed = true
            }
        }
        return changed
    }

    /**
     * Keep floating panels on-screen after the OS / host window resizes.
     * Maximized floats re-fill the viewport (bypass per-panel max width).
     * Returns true when any rect changed (in-memory only — do not persist every frame).
     */
    function syncFloatsToViewport(): boolean {
        if (typeof window === 'undefined') return false
        if (window.innerWidth < 320 || window.innerHeight < 240) return false

        let changed = false
        const nextFloats: DockFloatMap = {...floats.value}

        for (const panel of DOCK_DRAG_PANELS) {
            if (!isPanelFloating(panel)) continue
            const prev = floats.value[panel]
            // Maximize path must not go through normalizePanelFloat (explorer maxW 560).
            const next = maximized.value[panel]
                ? maximizeDockFloatInViewport()
                : clampDockFloatToViewport(prev)
            if (
                prev.x !== next.x
                || prev.y !== next.y
                || prev.width !== next.width
                || prev.height !== next.height
            ) {
                nextFloats[panel] = next
                changed = true
            }
        }

        if (changed) floats.value = nextFloats
        return changed
    }

    return {
        placement,
        floats,
        terminalFloat,
        explorerFloat,
        shortcutFloat,
        workspaceFloat,
        draggingPanel,
        hoverTarget,
        explorerSide,
        terminalSide,
        shortcutSide,
        workspaceSide,
        isDragging,
        applyPlacement,
        floatRect,
        applyFloat,
        patchFloat,
        setExplorerSide,
        setTerminalSide,
        setShortcutSide,
        setWorkspaceSide,
        resetToClassic,
        beginDrag,
        setHoverTarget,
        isPanelFloating,
        isFloatMaximized,
        clearFloatMaximize,
        toggleFloatMaximize,
        prepareEnterFloat,
        commitDrop,
        cancelDrag,
        repairLoadedFloats,
        syncFloatsToViewport,
        raiseFloat,
        floatZIndex,
    }
})
