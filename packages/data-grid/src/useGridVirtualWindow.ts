import {computed, shallowRef, watch, type ComputedRef, type Ref} from 'vue'

export const GRID_ROW_HEIGHT = 30
/**
 * Grid bodies are already page-sliced (≤1000). Spacer row-virtualization inside a
 * page hurts vertical fling feel; keep it off for normal page sizes. Page-flip
 * cost is handled by reusing row VNodes (page-relative keys), not by spacers.
 */
export const GRID_VIRTUAL_THRESHOLD = 1001
/** Extra rows kept mounted beyond the viewport (both sides). */
export const GRID_ROW_OVERSCAN = 24
/**
 * Keep the current row window until the viewport approaches this many rows from
 * either edge — avoids remount churn while flinging the scrollbar.
 */
export const GRID_ROW_HYSTERESIS = 8

export type VisibleGridRow<T> = {
  item: T
  /** 在完整行列表中的索引（0-based） */
  index: number
}

export type RowVirtualWindow = {
  useVirtual: boolean
  start: number
  end: number
  paddingTop: number
  paddingBottom: number
}

export function resolveRowVirtualWindow(options: {
  total: number
  scrollTop: number
  viewportHeight: number
  rowHeight?: number
  threshold?: number
  overscan?: number
}): RowVirtualWindow {
  const rowHeight = options.rowHeight ?? GRID_ROW_HEIGHT
  const threshold = options.threshold ?? GRID_VIRTUAL_THRESHOLD
  const overscan = options.overscan ?? GRID_ROW_OVERSCAN
  const total = Math.max(0, options.total)
  if (total < threshold) {
    return {useVirtual: false, start: 0, end: total, paddingTop: 0, paddingBottom: 0}
  }
  const scrollTop = Math.max(0, options.scrollTop)
  const viewportHeight = Math.max(0, options.viewportHeight)
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
  const visibleCount = Math.ceil(viewportHeight / rowHeight) + overscan * 2
  const end = Math.min(total, start + visibleCount)
  return {
    useVirtual: true,
    start,
    end,
    paddingTop: start * rowHeight,
    paddingBottom: Math.max(0, (total - end) * rowHeight),
  }
}

export function isRowWindowComfortable(options: {
  committed: RowVirtualWindow
  scrollTop: number
  viewportHeight: number
  rowHeight?: number
  hysteresis?: number
}): boolean {
  const {committed} = options
  if (!committed.useVirtual) return false
  const rowHeight = options.rowHeight ?? GRID_ROW_HEIGHT
  const hysteresis = options.hysteresis ?? GRID_ROW_HYSTERESIS
  const scrollTop = Math.max(0, options.scrollTop)
  const viewportHeight = Math.max(0, options.viewportHeight)
  const coveredStart = committed.paddingTop
  const coveredEnd = committed.paddingTop + (committed.end - committed.start) * rowHeight
  return (
      scrollTop >= coveredStart + hysteresis * rowHeight
      && scrollTop + viewportHeight <= coveredEnd - hysteresis * rowHeight
  )
}

/**
 * 固定行高表格虚拟窗口。scrollContainer 为 overflow:auto 的滚动根元素。
 * wrapCells / 可变行高场景应关闭 enabled。
 */
export function useGridVirtualWindow<T>(
    scrollContainer: Ref<HTMLElement | null>,
    rows: Ref<readonly T[]>,
    options?: {
      rowHeight?: number
      threshold?: number
      overscan?: number
      hysteresis?: number
      enabled?: Ref<boolean> | ComputedRef<boolean>
    },
) {
  const rowHeight = options?.rowHeight ?? GRID_ROW_HEIGHT
  const threshold = options?.threshold ?? GRID_VIRTUAL_THRESHOLD
  const overscan = options?.overscan ?? GRID_ROW_OVERSCAN
  const hysteresis = options?.hysteresis ?? GRID_ROW_HYSTERESIS
  const enabled = options?.enabled ?? computed(() => true)

  const committed = shallowRef<RowVirtualWindow>({
    useVirtual: false,
    start: 0,
    end: 0,
    paddingTop: 0,
    paddingBottom: 0,
  })

  let pendingScrollTop = 0
  let pendingViewportHeight = 0
  let lastScrollTop = -1

  function applyWindow(force = false) {
    const total = rows.value.length
    if (!enabled.value) {
      committed.value = {
        useVirtual: false,
        start: 0,
        end: total,
        paddingTop: 0,
        paddingBottom: 0,
      }
      return
    }

    const next = resolveRowVirtualWindow({
      total,
      scrollTop: pendingScrollTop,
      viewportHeight: pendingViewportHeight,
      rowHeight,
      threshold,
      overscan,
    })

    const prev = committed.value
    if (
        !force
        && prev.useVirtual
        && next.useVirtual
        && isRowWindowComfortable({
          committed: prev,
          scrollTop: pendingScrollTop,
          viewportHeight: pendingViewportHeight,
          rowHeight,
          hysteresis,
        })
    ) {
      return
    }

    if (
        prev.useVirtual === next.useVirtual
        && prev.start === next.start
        && prev.end === next.end
        && prev.paddingTop === next.paddingTop
        && prev.paddingBottom === next.paddingBottom
    ) {
      return
    }
    committed.value = next
  }

  function syncViewport(force = false) {
    const el = scrollContainer.value
    if (!el) return
    pendingScrollTop = el.scrollTop
    pendingViewportHeight = el.clientHeight
    // Vertical-only: ignore pure horizontal pans.
    if (!force && pendingScrollTop === lastScrollTop) {
      return
    }
    lastScrollTop = pendingScrollTop

    // Fast fling: if the viewport left the mounted band, paint synchronously.
    // Deferring to rAF leaves a blank spacer gap for one or more frames.
    const covered = !committed.value.useVirtual || isRowWindowComfortable({
      committed: committed.value,
      scrollTop: pendingScrollTop,
      viewportHeight: pendingViewportHeight,
      rowHeight,
      hysteresis,
    })
    if (force || !covered) {
      applyWindow(true)
      return
    }
    // Still inside overscan — keep the committed window (no DOM churn).
  }

  const useVirtual = computed(() => committed.value.useVirtual)
  const paddingTop = computed(() => committed.value.paddingTop)
  const paddingBottom = computed(() => committed.value.paddingBottom)

  const visibleRows = computed((): VisibleGridRow<T>[] => {
    const {start, end} = committed.value
    return rows.value.slice(start, end).map((item, offset) => ({
      item,
      index: start + offset,
    }))
  })

  function scrollToRowIndex(index: number, behavior: ScrollBehavior = 'smooth') {
    const el = scrollContainer.value
    if (!el || index < 0) return
    const target = Math.max(0, index * rowHeight - el.clientHeight / 3)
    el.scrollTo({top: target, behavior})
    syncViewport(true)
  }

  watch(
      scrollContainer,
      (el, _, onCleanup) => {
        if (!el) return
        syncViewport(true)
        const onScroll = () => syncViewport(false)
        el.addEventListener('scroll', onScroll, {passive: true})
        let resizeObserver: ResizeObserver | null = null
        if (typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(() => syncViewport(true))
          resizeObserver.observe(el)
        }
        onCleanup(() => {
          el.removeEventListener('scroll', onScroll)
          resizeObserver?.disconnect()
        })
      },
      {immediate: true},
  )

  watch(
      [rows, enabled],
      () => {
        // Page flips replace `rows` while scrollTop may still be mid-page. Syncing
        // against the stale offset slices the new page at the old position and can
        // look like duplicated / wrong rows until a later scroll event.
        pendingScrollTop = 0
        lastScrollTop = -1
        const el = scrollContainer.value
        if (el && el.scrollTop !== 0) {
          el.scrollTop = 0
        }
        if (!el) {
          const total = rows.value.length
          committed.value = {
            useVirtual: false,
            start: 0,
            end: total,
            paddingTop: 0,
            paddingBottom: 0,
          }
          return
        }
        pendingViewportHeight = el.clientHeight
        applyWindow(true)
      },
      {immediate: true},
  )

  return {
    useVirtual,
    visibleRows,
    paddingTop,
    paddingBottom,
    scrollToRowIndex,
    syncViewport: () => syncViewport(true),
  }
}
