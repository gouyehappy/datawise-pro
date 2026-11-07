import {computed, onMounted, onUnmounted, ref, toValue, type MaybeRefOrGetter} from 'vue'

export const SIDE_PANEL_RESIZE_MAX_PX = 960
export const SIDE_PANEL_RESIZE_MAX_VIEWPORT_RATIO = 0.55
export const EXPLORER_PANEL_RESIZE_MIN = 180
export const SHORTCUT_PANEL_RESIZE_MIN = 240
/** Keep a usable center workbench even when both side panels are open. */
export const SIDE_PANEL_CENTER_MIN_PX = 360
/**
 * Horizontal chrome outside the two side panels:
 * left nav rail + right tool stripe + shell gaps (~64+64+32).
 */
export const SIDE_PANEL_CHROME_RESERVE_PX = 160

/** Pure max-width resolver — used by the composable and unit tests. */
export function resolveSidePanelResizeMax(options: {
    viewportWidth: number
    peerWidth?: number
    min?: number
    maxPx?: number
    maxViewportRatio?: number
    centerMin?: number
    chromeReserve?: number
}): number {
    const min = options.min ?? EXPLORER_PANEL_RESIZE_MIN
    const maxPx = options.maxPx ?? SIDE_PANEL_RESIZE_MAX_PX
    const maxViewportRatio = options.maxViewportRatio ?? SIDE_PANEL_RESIZE_MAX_VIEWPORT_RATIO
    const centerMin = options.centerMin ?? SIDE_PANEL_CENTER_MIN_PX
    const chromeReserve = options.chromeReserve ?? SIDE_PANEL_CHROME_RESERVE_PX
    const viewportWidth = Math.max(0, options.viewportWidth)
    const peerWidth = Math.max(0, options.peerWidth ?? 0)
    const ratioMax = Math.round(viewportWidth * maxViewportRatio)
    // Never go below the panel's own min, even when the budget is tight.
    const budgetMax = Math.max(min, viewportWidth - chromeReserve - peerWidth - centerMin)
    return Math.max(min, Math.round(Math.min(maxPx, ratioMax, budgetMax)))
}

export function useSidePanelResizeBounds(options: {
    min?: number
    maxPx?: number
    maxViewportRatio?: number
    /** Other docked side panel width currently consuming horizontal space (0 if hidden/floated). */
    peerWidth?: MaybeRefOrGetter<number>
    chromeReserve?: MaybeRefOrGetter<number>
    centerMin?: number
} = {}) {
    const min = options.min ?? EXPLORER_PANEL_RESIZE_MIN
    const maxPx = options.maxPx ?? SIDE_PANEL_RESIZE_MAX_PX
    const maxViewportRatio = options.maxViewportRatio ?? SIDE_PANEL_RESIZE_MAX_VIEWPORT_RATIO
    const centerMin = options.centerMin ?? SIDE_PANEL_CENTER_MIN_PX

    const viewportWidth = ref(
        typeof window !== 'undefined' ? window.innerWidth : 1920,
    )

    function onWindowResize() {
        viewportWidth.value = window.innerWidth
    }

    onMounted(() => window.addEventListener('resize', onWindowResize))
    onUnmounted(() => window.removeEventListener('resize', onWindowResize))

    const max = computed(() =>
        resolveSidePanelResizeMax({
            viewportWidth: viewportWidth.value,
            peerWidth: toValue(options.peerWidth) ?? 0,
            min,
            maxPx,
            maxViewportRatio,
            centerMin,
            chromeReserve: toValue(options.chromeReserve) ?? SIDE_PANEL_CHROME_RESERVE_PX,
        }),
    )

    return {min, max}
}
