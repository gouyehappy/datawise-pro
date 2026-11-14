/**
 * UX-01: live float geometry while dragging/resizing dock panels.
 * Keeps intermediate frames out of Pinia; FloatingPanelHost merges this into :style.
 */
import {computed, shallowRef, triggerRef, type ComputedRef} from 'vue'
import type {DockDragPanel, DockFloatRect} from '@/features/dock/types/dock.types'

const liveByPanel = shallowRef(new Map<DockDragPanel, Partial<DockFloatRect>>())

export function setDockFloatLivePreview(
    panel: DockDragPanel,
    rect: Partial<DockFloatRect> | null,
): void {
    const map = liveByPanel.value
    if (rect == null) {
        if (!map.has(panel)) return
        map.delete(panel)
        triggerRef(liveByPanel)
        return
    }
    map.set(panel, {...map.get(panel), ...rect})
    triggerRef(liveByPanel)
}

export function clearDockFloatLivePreview(panel: DockDragPanel): void {
    setDockFloatLivePreview(panel, null)
}

export function useDockFloatLivePreview(
    panel: DockDragPanel,
): ComputedRef<Partial<DockFloatRect> | null> {
    return computed(() => liveByPanel.value.get(panel) ?? null)
}

/** Test helper */
export function resetDockFloatLivePreviewForTests(): void {
    liveByPanel.value = new Map()
    triggerRef(liveByPanel)
}
