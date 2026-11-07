import {onBeforeUnmount, ref} from 'vue'
import type {WorkspaceTab} from '@/core/types'
import {
    resolveTabDropZoneSticky,
    type TabDropZone,
} from '@/features/workspace/services/workspace-tab-layout.service'

const DRAG_THRESHOLD_PX = 6
const AUTOSCROLL_EDGE_PX = 48
const AUTOSCROLL_SPEED_PX = 14

/**
 * Pointer-based tab drag (keeps the default arrow cursor — no grab/hand).
 * Dragging onto the workspace body (outside the tab bar) floats the tab.
 */
export function useWorkspaceTabDrag(options: {
    tabs: () => WorkspaceTab[]
    onDrop: (draggedId: string, targetId: string | null, zone: TabDropZone) => void
    onFloatAway?: (draggedId: string, clientX: number, clientY: number) => void
    scrollContainer?: () => HTMLElement | null | undefined
}) {
    const draggingId = ref<string | null>(null)
    const overId = ref<string | null>(null)
    const overZone = ref<TabDropZone | null>(null)
    const overGroupId = ref<string | null>(null)
    const floatAway = ref(false)
    const ghostX = ref(0)
    const ghostY = ref(0)
    const ghostTitle = ref('')
    const active = ref(false)

    let pointerId: number | null = null
    let originX = 0
    let originY = 0
    let pendingId: string | null = null
    let pendingTitle = ''
    let started = false
    let lastClientX = 0
    let scrollRaf = 0

    function reset() {
        draggingId.value = null
        overId.value = null
        overZone.value = null
        overGroupId.value = null
        floatAway.value = false
        active.value = false
        pointerId = null
        pendingId = null
        pendingTitle = ''
        started = false
        ghostTitle.value = ''
        if (scrollRaf) {
            cancelAnimationFrame(scrollRaf)
            scrollRaf = 0
        }
    }

    function suppressClickAfterDrag() {
        const suppress = (event: MouseEvent) => {
            event.preventDefault()
            event.stopPropagation()
            window.removeEventListener('click', suppress, true)
        }
        window.addEventListener('click', suppress, true)
        window.setTimeout(() => window.removeEventListener('click', suppress, true), 0)
    }

    function resolveGroupJoinTarget(groupId: string, draggedId: string): string | null {
        const member = options.tabs().find(
            (tab) => tab.tabGroupId === groupId && tab.id !== draggedId,
        )
        return member?.id ?? null
    }

    function resolveEmptyBarDrop(
        clientX: number,
        scroller: HTMLElement,
        draggedId: string,
    ): {targetId: string | null; zone: TabDropZone} {
        const nodes = [...scroller.querySelectorAll<HTMLElement>('[data-tab-id]')]
            .filter((node) => node.dataset.tabId && node.dataset.tabId !== draggedId)
        if (!nodes.length) return {targetId: null, zone: 'end'}
        for (const node of nodes) {
            const rect = node.getBoundingClientRect()
            if (clientX < rect.left + rect.width / 2) {
                return {targetId: node.dataset.tabId ?? null, zone: 'before'}
            }
        }
        return {targetId: nodes[nodes.length - 1].dataset.tabId ?? null, zone: 'after'}
    }

    function updateAutoscroll(clientX: number) {
        const scroller = options.scrollContainer?.() ?? null
        if (!scroller || !started) {
            if (scrollRaf) {
                cancelAnimationFrame(scrollRaf)
                scrollRaf = 0
            }
            return
        }
        const rect = scroller.getBoundingClientRect()
        let delta = 0
        if (clientX < rect.left + AUTOSCROLL_EDGE_PX) {
            delta = -AUTOSCROLL_SPEED_PX
        } else if (clientX > rect.right - AUTOSCROLL_EDGE_PX) {
            delta = AUTOSCROLL_SPEED_PX
        }
        if (!delta) {
            if (scrollRaf) {
                cancelAnimationFrame(scrollRaf)
                scrollRaf = 0
            }
            return
        }
        if (scrollRaf) return
        const tick = () => {
            scrollRaf = 0
            const el = options.scrollContainer?.()
            if (!el || !started) return
            const box = el.getBoundingClientRect()
            let step = 0
            if (lastClientX < box.left + AUTOSCROLL_EDGE_PX) step = -AUTOSCROLL_SPEED_PX
            else if (lastClientX > box.right - AUTOSCROLL_EDGE_PX) step = AUTOSCROLL_SPEED_PX
            if (!step) return
            el.scrollLeft += step
            scrollRaf = requestAnimationFrame(tick)
        }
        scrollRaf = requestAnimationFrame(tick)
    }

    function onPointerMove(event: PointerEvent) {
        if (pointerId == null || event.pointerId !== pointerId || !pendingId) return
        const dx = event.clientX - originX
        const dy = event.clientY - originY
        if (!started) {
            if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
            started = true
            active.value = true
            draggingId.value = pendingId
            ghostTitle.value = pendingTitle
        }
        lastClientX = event.clientX
        ghostX.value = event.clientX
        ghostY.value = event.clientY
        updateAutoscroll(event.clientX)

        const el = document.elementFromPoint(event.clientX, event.clientY)
        const tabEl = el?.closest?.('[data-tab-id]') as HTMLElement | null
        const groupEl = el?.closest?.('[data-tab-group-id]') as HTMLElement | null
        const barEnd = el?.closest?.('[data-tab-bar-end]') as HTMLElement | null
        const tabBar = el?.closest?.('.dw-tab-bar') as HTMLElement | null
        const floatSurface = el?.closest?.('[data-workspace-float-surface]') as HTMLElement | null
        const scroller = el?.closest?.('.dw-tab-scroll') as HTMLElement | null
            ?? options.scrollContainer?.()
            ?? null
        const targetId = tabEl?.dataset.tabId ?? null
        const draggedGroupId = options.tabs().find((tab) => tab.id === pendingId)?.tabGroupId

        if (targetId && targetId !== pendingId && tabEl) {
            floatAway.value = false
            const prev = overId.value === targetId ? overZone.value : null
            overId.value = targetId
            overZone.value = resolveTabDropZoneSticky(
                event.clientX,
                tabEl.getBoundingClientRect(),
                prev,
            )
            overGroupId.value = overZone.value === 'on'
                ? (tabEl.closest('[data-tab-group-id]') as HTMLElement | null)?.dataset.tabGroupId
                    ?? null
                : null
            return
        }

        // Other group's chrome: stack in. Own group chrome: leave members as-is
        // so the empty-bar path can eject them onto the main strip.
        const groupId = groupEl?.dataset.tabGroupId ?? null
        if (groupId && groupId !== draggedGroupId) {
            floatAway.value = false
            const joinTarget = resolveGroupJoinTarget(groupId, pendingId)
            if (joinTarget) {
                overId.value = joinTarget
                overZone.value = 'on'
                overGroupId.value = groupId
                return
            }
        }

        if (barEnd || scroller || tabBar) {
            floatAway.value = false
            const host = scroller ?? barEnd ?? options.scrollContainer?.() ?? null
            if (!host) {
                overId.value = null
                overZone.value = null
                overGroupId.value = null
                return
            }
            const insert = resolveEmptyBarDrop(event.clientX, host, pendingId)
            overId.value = insert.targetId
            overZone.value = barEnd ? 'end' : insert.zone
            overGroupId.value = null
            return
        }

        // Drop onto workspace body → float window.
        if (floatSurface && options.onFloatAway) {
            floatAway.value = true
            overId.value = null
            overZone.value = null
            overGroupId.value = null
            return
        }

        floatAway.value = false
        overId.value = null
        overZone.value = null
        overGroupId.value = null
    }

    function onPointerUp(event: PointerEvent) {
        if (pointerId == null || event.pointerId !== pointerId) return
        const dragged = pendingId
        const target = overId.value
        const zone = overZone.value
        const shouldFloat = floatAway.value
        const didDrag = started
        const dropX = event.clientX
        const dropY = event.clientY
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerup', onPointerUp)
        window.removeEventListener('pointercancel', onPointerUp)
        reset()
        if (didDrag) {
            suppressClickAfterDrag()
            if (dragged && shouldFloat) {
                options.onFloatAway?.(dragged, dropX, dropY)
            } else if (dragged && zone && (target || zone === 'end')) {
                options.onDrop(dragged, target, zone)
            }
        }
    }

    function beginPointerDrag(event: PointerEvent, tabId: string, title: string) {
        if (event.button !== 0) return
        const target = event.target as HTMLElement | null
        if (target?.closest('.dw-tab__close, .dw-tab__rename-input, a, button.dw-tab__close')) return
        // Don't start drag while renaming.
        if (target?.closest('.is-renaming')) return

        pointerId = event.pointerId
        originX = event.clientX
        originY = event.clientY
        lastClientX = event.clientX
        pendingId = tabId
        pendingTitle = title
        started = false
        window.addEventListener('pointermove', onPointerMove)
        window.addEventListener('pointerup', onPointerUp)
        window.addEventListener('pointercancel', onPointerUp)
    }

    onBeforeUnmount(() => {
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerup', onPointerUp)
        window.removeEventListener('pointercancel', onPointerUp)
        if (scrollRaf) cancelAnimationFrame(scrollRaf)
    })

    return {
        draggingId,
        overId,
        overZone,
        overGroupId,
        floatAway,
        ghostX,
        ghostY,
        ghostTitle,
        active,
        beginPointerDrag,
    }
}

export type WorkspaceTabDragState = ReturnType<typeof useWorkspaceTabDrag>
