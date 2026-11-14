import {onBeforeUnmount} from 'vue'
import {useDockPlacementStore} from '@/features/dock/stores/dock-placement-store'
import type {DockDragPanel, DockFloatRect} from '@/features/dock/types/dock.types'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {
    clearDockFloatLivePreview,
    setDockFloatLivePreview,
} from '@/features/dock/services/dock-float-live-preview'
import {toDockDropTarget} from '@/features/dock/components/dock-minimap.config'

/** Ignore tiny pointer jitter before dock-drag starts (grip / header). */
const DRAG_THRESHOLD_PX = 4
/** Cancel long-press arming if the pointer wanders first. */
const LONG_PRESS_CANCEL_PX = 8
const DEFAULT_LONG_PRESS_MS = 280

export type DockDragActivation = 'threshold' | 'longpress'

/**
 * Attach to a DockDragGrip or quiet surface.
 * - threshold: small move starts drag (preferred for visible grips)
 * - longpress: hold until armed, then drag starts immediately (no second threshold)
 */
export function usePanelHeaderDrag(
    panel: DockDragPanel,
    options?: {
        activation?: DockDragActivation
        longPressMs?: number
    },
) {
    const dock = useDockPlacementStore()
    const appConfig = useAppConfigStore()
    const activation = options?.activation ?? 'threshold'
    const longPressMs = options?.longPressMs ?? DEFAULT_LONG_PRESS_MS

    let pointerId: number | null = null
    let startX = 0
    let startY = 0
    let dragging = false
    let armed = false
    let floatStartX = 0
    let floatStartY = 0
    let movingFloat = false
    let longPressTimer: ReturnType<typeof setTimeout> | null = null
    let captureEl: HTMLElement | null = null
    let lastClickAt = 0
    let lastClickX = 0
    let lastClickY = 0

    function readFloatRect(): DockFloatRect {
        return dock.floatRect(panel)
    }

    function readFloatOrigin() {
        const rect = readFloatRect()
        floatStartX = rect.x
        floatStartY = rect.y
    }

    function writeFloatPosition(dx: number, dy: number) {
        // UX-01: preview locally; commit to Pinia on pointerup / Escape restore.
        setDockFloatLivePreview(panel, {
            x: Math.max(0, floatStartX + dx),
            y: Math.max(0, floatStartY + dy),
        })
    }

    function commitFloatPosition(dx: number, dy: number) {
        clearDockFloatLivePreview(panel)
        dock.patchFloat(panel, {
            x: Math.max(0, floatStartX + dx),
            y: Math.max(0, floatStartY + dy),
        })
    }

    function restoreFloatOrigin() {
        if (!movingFloat) return
        clearDockFloatLivePreview(panel)
        dock.patchFloat(panel, {
            x: Math.max(0, floatStartX),
            y: Math.max(0, floatStartY),
        })
    }

    function endSessionChrome() {
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        document.body.classList.remove('is-dock-panel-dragging')
    }

    function clearLongPressTimer() {
        if (longPressTimer == null) return
        clearTimeout(longPressTimer)
        longPressTimer = null
    }

    function releaseCapture() {
        if (captureEl == null || pointerId == null) return
        try {
            if (captureEl.hasPointerCapture(pointerId)) {
                captureEl.releasePointerCapture(pointerId)
            }
        } catch {
            /* ignore */
        }
        captureEl = null
    }

    function startDragging() {
        if (dragging) return
        dragging = true
        armed = true
        dock.beginDrag(panel)
        document.body.style.cursor = 'grabbing'
        document.body.style.userSelect = 'none'
        document.body.classList.add('is-dock-panel-dragging')
    }

    /** Long-press ready: enter drag immediately while still holding (no extra threshold). */
    function armLongPress() {
        if (dragging) return
        armed = true
        startDragging()
    }

    function onKeyDown(event: KeyboardEvent) {
        if (event.key !== 'Escape' || (!dragging && !armed)) return
        event.preventDefault()
        restoreFloatOrigin()
        if (dragging) dock.cancelDrag()
        cleanupListeners()
        endSessionChrome()
        pointerId = null
        dragging = false
        armed = false
    }

    function onPointerDown(event: PointerEvent) {
        if (event.button !== 0) return
        const target = event.target as HTMLElement | null
        // Always let real controls win — `data-dock-grip` on a header must not
        // swallow the explorer database/files switch (or any other button).
        if (target?.closest('button, a, input, select, textarea, [role="button"]')) {
            return
        }

        event.preventDefault()
        pointerId = event.pointerId
        startX = event.clientX
        startY = event.clientY
        dragging = false
        armed = activation !== 'longpress'
        movingFloat = dock.isPanelFloating(panel)
        if (movingFloat) readFloatOrigin()
        clearLongPressTimer()

        captureEl = (event.currentTarget as HTMLElement | null) ?? target
        try {
            captureEl?.setPointerCapture(event.pointerId)
        } catch {
            captureEl = null
        }

        if (activation === 'longpress') {
            document.body.style.cursor = 'grab'
            longPressTimer = setTimeout(armLongPress, longPressMs)
        } else {
            document.body.style.cursor = 'grab'
        }

        window.addEventListener('pointermove', onPointerMove)
        window.addEventListener('pointerup', onPointerUp)
        window.addEventListener('pointercancel', onPointerUp)
        window.addEventListener('keydown', onKeyDown)
    }

    function onPointerMove(event: PointerEvent) {
        if (pointerId !== event.pointerId) return
        const dx = event.clientX - startX
        const dy = event.clientY - startY
        const dist = Math.hypot(dx, dy)

        if (activation === 'longpress' && !armed) {
            if (dist > LONG_PRESS_CANCEL_PX) {
                clearLongPressTimer()
                cleanupListeners()
                endSessionChrome()
                pointerId = null
            }
            return
        }

        if (!dragging) {
            if (dist < DRAG_THRESHOLD_PX) return
            startDragging()
        }

        if (movingFloat) writeFloatPosition(dx, dy)

        // Drop only when the pointer is over a minimap thumbnail slot.
        const el = document.elementFromPoint(event.clientX, event.clientY)
        const zone = el?.closest('[data-dock-drop]') as HTMLElement | null
        if (!zone) {
            dock.setHoverTarget(null)
            return
        }
        const side = zone.dataset.dockDrop
        const forPanel = zone.dataset.dockFor as DockDragPanel | undefined
        const target = side && forPanel === panel ? toDockDropTarget(panel, side) : null
        dock.setHoverTarget(target)
    }

    function onDoubleClick() {
        if (dock.isPanelFloating(panel)) {
            if (dock.toggleFloatMaximize(panel)) appConfig.persistDockLayout()
            return
        }
        dock.prepareEnterFloat(panel)
        appConfig.setDockPlacement({...dock.placement, [panel]: 'float'})
    }

    function onPointerUp(event: PointerEvent) {
        if (pointerId !== null && event.pointerId !== pointerId) return
        clearLongPressTimer()
        releaseCapture()
        cleanupListeners()
        endSessionChrome()

        if (!dragging) {
            const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
            const dist = Math.hypot(event.clientX - lastClickX, event.clientY - lastClickY)
            if (now - lastClickAt < 400 && dist < 8) {
                lastClickAt = 0
                onDoubleClick()
            } else {
                lastClickAt = now
                lastClickX = event.clientX
                lastClickY = event.clientY
            }
            pointerId = null
            armed = false
            return
        }

        const target = dock.hoverTarget
        const matched = target && target.panel === panel ? target : null
        if (movingFloat && !matched) {
            const dx = event.clientX - startX
            const dy = event.clientY - startY
            commitFloatPosition(dx, dy)
        } else {
            clearDockFloatLivePreview(panel)
        }
        dock.commitDrop(matched, {x: event.clientX, y: event.clientY})
        if (matched) {
            appConfig.setDockPlacement({...dock.placement})
        } else if (movingFloat) {
            appConfig.persistDockLayout()
        }
        pointerId = null
        dragging = false
        armed = false
    }

    function cleanupListeners() {
        clearLongPressTimer()
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerup', onPointerUp)
        window.removeEventListener('pointercancel', onPointerUp)
        window.removeEventListener('keydown', onKeyDown)
    }

    onBeforeUnmount(() => {
        cleanupListeners()
        releaseCapture()
        endSessionChrome()
        clearDockFloatLivePreview(panel)
        if (dragging) dock.cancelDrag()
    })

    return {onPointerDown}
}
