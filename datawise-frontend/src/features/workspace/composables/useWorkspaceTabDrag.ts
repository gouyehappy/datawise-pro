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
 * IDEA-like strip ↔ float hysteresis:
 * - Enter float only after leaving the strip by a clear margin (esp. below).
 * - Stay in float until the pointer is clearly back inside the strip (no flicker).
 */
const ENTER_FLOAT_BELOW_PX = 12
const ENTER_FLOAT_SIDE_PX = 10
const REENTER_STRIP_INSET_PX = 2

/**
 * Pointer-based tab drag (default arrow cursor).
 *
 * IDEA mapping:
 * - Inside tab strip → reorder / group (caret on bar, quiet chip ghost)
 * - Leave strip into editor/workspace → undock as floating window
 * - Chip follows the pointer; drop commits float at the pointer
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
    let lastClientY = 0
    let scrollRaf = 0
    let ghostRaf = 0
    let captureEl: HTMLElement | null = null

    function releaseCapture() {
        if (captureEl == null || pointerId == null) {
            captureEl = null
            return
        }
        try {
            if (captureEl.hasPointerCapture(pointerId)) {
                captureEl.releasePointerCapture(pointerId)
            }
        } catch {
            /* ignore */
        }
        captureEl = null
    }

    function reset() {
        releaseCapture()
        document.body.classList.remove('is-workspace-tab-dragging')
        document.body.classList.remove('is-workspace-tab-float-away')
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
        if (ghostRaf) {
            cancelAnimationFrame(ghostRaf)
            ghostRaf = 0
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

    function readTabStripRect(): DOMRect | null {
        const scroller = options.scrollContainer?.() ?? null
        const bar =
            (scroller?.closest('.dw-tab-bar') as HTMLElement | null)
            ?? (document.querySelector('.dw-tab-bar') as HTMLElement | null)
        return bar?.getBoundingClientRect() ?? null
    }

    function isClearlyInsideStrip(clientX: number, clientY: number): boolean {
        const rect = readTabStripRect()
        if (!rect) return false
        const inset = REENTER_STRIP_INSET_PX
        return (
            clientX >= rect.left + inset
            && clientX <= rect.right - inset
            && clientY >= rect.top + inset
            && clientY <= rect.bottom - inset
        )
    }

    /** Hysteresis: harder to enter float than to leave it (IDEA-stable mode). */
    function shouldArmFloatAway(clientX: number, clientY: number, currently: boolean): boolean {
        if (!options.onFloatAway) return false
        const rect = readTabStripRect()
        if (!rect) return currently

        if (currently) {
            return !isClearlyInsideStrip(clientX, clientY)
        }

        const below = clientY > rect.bottom + ENTER_FLOAT_BELOW_PX
        const above = clientY < rect.top - ENTER_FLOAT_SIDE_PX
        const left = clientX < rect.left - ENTER_FLOAT_SIDE_PX
        const right = clientX > rect.right + ENTER_FLOAT_SIDE_PX
        return below || above || left || right
    }

    function setFloatAway(next: boolean) {
        if (floatAway.value === next) return
        floatAway.value = next
        document.body.classList.toggle('is-workspace-tab-float-away', next)
        if (next) {
            overId.value = null
            overZone.value = null
            overGroupId.value = null
        }
    }

    function scheduleGhost(clientX: number, clientY: number) {
        lastClientX = clientX
        lastClientY = clientY
        if (ghostRaf) return
        ghostRaf = requestAnimationFrame(() => {
            ghostRaf = 0
            ghostX.value = lastClientX
            ghostY.value = lastClientY
        })
    }

    function updateAutoscroll(clientX: number) {
        const scroller = options.scrollContainer?.() ?? null
        if (!scroller || !started || floatAway.value) {
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
            if (!el || !started || floatAway.value) return
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

    function updateReorderTargets(event: PointerEvent) {
        const el = document.elementFromPoint(event.clientX, event.clientY)
        const tabEl = el?.closest?.('[data-tab-id]') as HTMLElement | null
        const groupEl = el?.closest?.('[data-tab-group-id]') as HTMLElement | null
        const barEnd = el?.closest?.('[data-tab-bar-end]') as HTMLElement | null
        const tabBar = el?.closest?.('.dw-tab-bar') as HTMLElement | null
        const scroller = el?.closest?.('.dw-tab-scroll') as HTMLElement | null
            ?? options.scrollContainer?.()
            ?? null
        const targetId = tabEl?.dataset.tabId ?? null
        const draggedGroupId = options.tabs().find((tab) => tab.id === pendingId)?.tabGroupId

        if (targetId && targetId !== pendingId && tabEl) {
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

        const groupId = groupEl?.dataset.tabGroupId ?? null
        if (groupId && groupId !== draggedGroupId && pendingId) {
            const joinTarget = resolveGroupJoinTarget(groupId, pendingId)
            if (joinTarget) {
                overId.value = joinTarget
                overZone.value = 'on'
                overGroupId.value = groupId
                return
            }
        }

        if (barEnd || scroller || tabBar) {
            const host = scroller ?? barEnd ?? options.scrollContainer?.() ?? null
            if (!host || !pendingId) {
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

        overId.value = null
        overZone.value = null
        overGroupId.value = null
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
            document.body.classList.add('is-workspace-tab-dragging')
            event.preventDefault()
        }
        scheduleGhost(event.clientX, event.clientY)
        updateAutoscroll(event.clientX)

        const wantFloat = shouldArmFloatAway(event.clientX, event.clientY, floatAway.value)
        if (wantFloat) {
            setFloatAway(true)
            return
        }

        setFloatAway(false)
        updateReorderTargets(event)
    }

    function cleanupListeners() {
        window.removeEventListener('pointermove', onPointerMove, true)
        window.removeEventListener('pointerup', onPointerUp, true)
        window.removeEventListener('pointercancel', onPointerUp, true)
    }

    function onPointerUp(event: PointerEvent) {
        if (pointerId == null || event.pointerId !== pointerId) return
        const dragged = pendingId
        const target = overId.value
        const zone = overZone.value
        const outsideForFloat = shouldArmFloatAway(
            event.clientX,
            event.clientY,
            floatAway.value || false,
        )
        const shouldFloat = Boolean(
            options.onFloatAway && (floatAway.value || (started && outsideForFloat)),
        )
        const didDrag = started
        const dropX = event.clientX
        const dropY = event.clientY
        cleanupListeners()
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
        if (target?.closest('.is-renaming')) return

        pointerId = event.pointerId
        originX = event.clientX
        originY = event.clientY
        lastClientX = event.clientX
        lastClientY = event.clientY
        pendingId = tabId
        pendingTitle = title
        started = false

        captureEl =
            (target?.closest('.dw-tab') as HTMLElement | null)
            ?? (event.currentTarget as HTMLElement | null)
            ?? target
        try {
            captureEl?.setPointerCapture(event.pointerId)
        } catch {
            captureEl = null
        }

        window.addEventListener('pointermove', onPointerMove, true)
        window.addEventListener('pointerup', onPointerUp, true)
        window.addEventListener('pointercancel', onPointerUp, true)
    }

    onBeforeUnmount(() => {
        cleanupListeners()
        releaseCapture()
        if (scrollRaf) cancelAnimationFrame(scrollRaf)
        if (ghostRaf) cancelAnimationFrame(ghostRaf)
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
