import {computed, shallowRef, watch, type ComputedRef, type Ref} from 'vue'

/** Enable horizontal column windowing once a result has this many scrollable columns. */
export const GRID_COLUMN_VIRTUAL_THRESHOLD = 28

/** Extra horizontal pixels kept mounted beyond the viewport (both sides). */
export const GRID_COLUMN_OVERSCAN_PX = 1200

/**
 * Keep the current window until the viewport approaches this distance from
 * either edge of the mounted range — cuts remount churn while scrolling.
 */
export const GRID_COLUMN_HYSTERESIS_PX = 400

/** After fast horizontal scrolling stops, wait this long before shrinking the window. */
export const GRID_COLUMN_SCROLL_IDLE_MS = 150

export type ColumnVirtualWindow = {
    useVirtual: boolean
    start: number
    end: number
    paddingLeftPx: number
    paddingRightPx: number
}

function sumWidths(widths: readonly number[], from: number, to: number): number {
    let total = 0
    for (let i = from; i < to; i += 1) {
        total += widths[i] ?? 0
    }
    return total
}

/** Pure helper — unit-tested without DOM. */
export function resolveColumnVirtualWindow(options: {
    scrollableWidths: readonly number[]
    scrollLeft: number
    viewportWidth: number
    threshold?: number
    /** @deprecated Prefer overscanPx — kept for tests that pass column buffer counts. */
    buffer?: number
    overscanPx?: number
}): ColumnVirtualWindow {
    const widths = options.scrollableWidths
    const threshold = options.threshold ?? GRID_COLUMN_VIRTUAL_THRESHOLD
    const total = widths.length
    if (total < threshold) {
        return {useVirtual: false, start: 0, end: total, paddingLeftPx: 0, paddingRightPx: 0}
    }

    const scrollLeft = Math.max(0, options.scrollLeft)
    const viewportWidth = Math.max(0, options.viewportWidth)
    const overscanPx = options.overscanPx
        ?? (options.buffer != null ? options.buffer * 120 : GRID_COLUMN_OVERSCAN_PX)

    const windowStartX = Math.max(0, scrollLeft - overscanPx)
    const windowEndX = scrollLeft + viewportWidth + overscanPx

    let offset = 0
    let start = 0
    for (let i = 0; i < total; i += 1) {
        const width = widths[i] ?? 0
        if (offset + width > windowStartX) {
            start = i
            break
        }
        offset += width
        start = i + 1
    }

    let covered = sumWidths(widths, 0, start)
    let end = start
    while (end < total && covered < windowEndX) {
        covered += widths[end] ?? 0
        end += 1
    }

    return {
        useVirtual: true,
        start,
        end,
        paddingLeftPx: sumWidths(widths, 0, start),
        paddingRightPx: sumWidths(widths, end, total),
    }
}

/** Whether the current viewport still sits comfortably inside a committed window. */
export function isColumnWindowComfortable(options: {
    committed: ColumnVirtualWindow
    scrollableWidths: readonly number[]
    scrollLeft: number
    viewportWidth: number
    hysteresisPx?: number
}): boolean {
    const {committed, scrollableWidths} = options
    if (!committed.useVirtual) return false
    const hysteresis = options.hysteresisPx ?? GRID_COLUMN_HYSTERESIS_PX
    const scrollLeft = Math.max(0, options.scrollLeft)
    const viewportWidth = Math.max(0, options.viewportWidth)
    const coveredStart = committed.paddingLeftPx
    const coveredEnd = sumWidths(scrollableWidths, 0, scrollableWidths.length) - committed.paddingRightPx
    if (coveredEnd <= coveredStart) return false
    return (
        scrollLeft >= coveredStart + hysteresis
        && scrollLeft + viewportWidth <= coveredEnd - hysteresis
    )
}

/**
 * Merge next window with previous so fast pans only expand coverage;
 * shrinking waits until scroll is idle (caller passes allowShrink).
 */
export function mergeColumnVirtualWindow(
    previous: ColumnVirtualWindow,
    next: ColumnVirtualWindow,
    allowShrink: boolean,
): ColumnVirtualWindow {
    if (!previous.useVirtual || !next.useVirtual || allowShrink) {
        return next
    }
    const start = Math.min(previous.start, next.start)
    const end = Math.max(previous.end, next.end)
    if (start === previous.start && end === previous.end) {
        return previous
    }
    // Pads must be recomputed by caller with widths — placeholder zeros replaced below.
    return {
        useVirtual: true,
        start,
        end,
        paddingLeftPx: 0,
        paddingRightPx: 0,
    }
}

/**
 * Horizontal column virtual window for wide result grids.
 * Pinned columns stay outside this window and are always rendered by the caller.
 */
export function useGridColumnVirtualWindow<T>(
    scrollContainer: Ref<HTMLElement | null>,
    scrollableColumns: Ref<readonly T[]>,
    options: {
        columnWidthPx: (column: T) => number
        threshold?: number
        overscanPx?: number
        hysteresisPx?: number
        idleMs?: number
        enabled?: Ref<boolean> | ComputedRef<boolean>
    },
) {
    const threshold = options.threshold ?? GRID_COLUMN_VIRTUAL_THRESHOLD
    const overscanPx = options.overscanPx ?? GRID_COLUMN_OVERSCAN_PX
    const hysteresisPx = options.hysteresisPx ?? GRID_COLUMN_HYSTERESIS_PX
    const idleMs = options.idleMs ?? GRID_COLUMN_SCROLL_IDLE_MS
    const enabled = options.enabled ?? computed(() => true)

    const committed = shallowRef<ColumnVirtualWindow>({
        useVirtual: false,
        start: 0,
        end: 0,
        paddingLeftPx: 0,
        paddingRightPx: 0,
    })

    let idleTimer: ReturnType<typeof setTimeout> | null = null
    let pendingScrollLeft = 0
    let pendingViewportWidth = 0
    let lastScrollLeft = -1
    let allowShrink = true

    const scrollableWidths = computed(() =>
        scrollableColumns.value.map((column) => options.columnWidthPx(column)),
    )

    function withPads(window: ColumnVirtualWindow, widths: readonly number[]): ColumnVirtualWindow {
        if (!window.useVirtual) {
            return {
                ...window,
                paddingLeftPx: 0,
                paddingRightPx: 0,
            }
        }
        return {
            ...window,
            paddingLeftPx: sumWidths(widths, 0, window.start),
            paddingRightPx: sumWidths(widths, window.end, widths.length),
        }
    }

    function applyWindow(force = false) {
        const widths = scrollableWidths.value
        const total = scrollableColumns.value.length
        if (!enabled.value) {
            committed.value = {
                useVirtual: false,
                start: 0,
                end: total,
                paddingLeftPx: 0,
                paddingRightPx: 0,
            }
            return
        }

        const next = resolveColumnVirtualWindow({
            scrollableWidths: widths,
            scrollLeft: pendingScrollLeft,
            viewportWidth: pendingViewportWidth,
            threshold,
            overscanPx,
        })

        const prev = committed.value
        if (
            !force
            && prev.useVirtual
            && next.useVirtual
            && isColumnWindowComfortable({
                committed: prev,
                scrollableWidths: widths,
                scrollLeft: pendingScrollLeft,
                viewportWidth: pendingViewportWidth,
                hysteresisPx,
            })
        ) {
            return
        }

        let merged = next
        if (!force && prev.useVirtual && next.useVirtual && !allowShrink) {
            const expanded = mergeColumnVirtualWindow(prev, next, false)
            merged = withPads(
                {
                    useVirtual: true,
                    start: expanded.start,
                    end: expanded.end,
                    paddingLeftPx: 0,
                    paddingRightPx: 0,
                },
                widths,
            )
        } else {
            merged = withPads(next, widths)
        }

        if (
            prev.useVirtual === merged.useVirtual
            && prev.start === merged.start
            && prev.end === merged.end
            && prev.paddingLeftPx === merged.paddingLeftPx
            && prev.paddingRightPx === merged.paddingRightPx
        ) {
            return
        }
        committed.value = merged
    }

    function armIdleShrink() {
        allowShrink = false
        if (idleTimer) clearTimeout(idleTimer)
        idleTimer = setTimeout(() => {
            idleTimer = null
            allowShrink = true
            applyWindow(true)
        }, idleMs)
    }

    function syncViewport(force = false) {
        const el = scrollContainer.value
        if (!el) return
        const nextLeft = el.scrollLeft
        const nextWidth = el.clientWidth
        // Ignore pure vertical scrolling — column window must not thrash on Y pans.
        if (!force && nextLeft === lastScrollLeft && nextWidth === pendingViewportWidth) {
            return
        }
        const scrolledHorizontally = nextLeft !== lastScrollLeft
        pendingScrollLeft = nextLeft
        pendingViewportWidth = nextWidth
        lastScrollLeft = nextLeft

        if (force) {
            allowShrink = true
            applyWindow(true)
            return
        }
        if (scrolledHorizontally) {
            armIdleShrink()
        }

        // Fast fling: paint synchronously when the viewport left the mounted band
        // so spacer pads never show as a blank hole for a frame.
        const covered = !committed.value.useVirtual || isColumnWindowComfortable({
            committed: committed.value,
            scrollableWidths: scrollableWidths.value,
            scrollLeft: pendingScrollLeft,
            viewportWidth: pendingViewportWidth,
            hysteresisPx,
        })
        if (!covered) {
            applyWindow(true)
        }
    }

    const useColumnVirtual = computed(() => committed.value.useVirtual)
    const paddingLeftPx = computed(() => committed.value.paddingLeftPx)
    const paddingRightPx = computed(() => committed.value.paddingRightPx)
    const visibleScrollableColumns = computed(() =>
        scrollableColumns.value.slice(committed.value.start, committed.value.end),
    )

    watch(
        scrollContainer,
        (el, _, onCleanup) => {
            if (!el) return
            syncViewport(true)
            const onScroll = () => syncViewport(false)
            el.addEventListener('scroll', onScroll, {passive: true})
            // Prefer native scrollend when available for snappier idle shrink.
            const onScrollEnd = () => {
                allowShrink = true
                applyWindow(true)
            }
            el.addEventListener('scrollend', onScrollEnd as EventListener)
            let resizeObserver: ResizeObserver | null = null
            if (typeof ResizeObserver !== 'undefined') {
                resizeObserver = new ResizeObserver(() => syncViewport(true))
                resizeObserver.observe(el)
            }
            onCleanup(() => {
                el.removeEventListener('scroll', onScroll)
                el.removeEventListener('scrollend', onScrollEnd as EventListener)
                resizeObserver?.disconnect()
                if (idleTimer) {
                    clearTimeout(idleTimer)
                    idleTimer = null
                }
            })
        },
        {immediate: true},
    )

    watch([scrollableColumns, enabled], () => syncViewport(true))

    return {
        useColumnVirtual,
        visibleScrollableColumns,
        paddingLeftPx,
        paddingRightPx,
        syncViewport: () => syncViewport(true),
    }
}
