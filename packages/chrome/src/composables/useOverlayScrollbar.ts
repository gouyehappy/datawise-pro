import {computed, onBeforeUnmount, reactive, ref, watch, type Ref} from 'vue'
import {
  OVERLAY_SB_HIDE_MS,
  computeHorizontalThumb,
  computeVerticalThumb,
  overlayNeedH,
  overlayNeedV,
  type OverlayScrollBox,
} from './overlay-scrollbar-metrics'

export type OverlayScrollbarAxis = 'v' | 'h'

type DragState = {
  axis: OverlayScrollbarAxis
  startPointer: number
  startScroll: number
}

/**
 * DwOverlayScroll: metrics + drag + show/hide (rails live in the template).
 */
export function useOverlayScrollbar(
  viewportRef: Ref<HTMLElement | null>,
  options?: {hideAfterMs?: number; contentRef?: Ref<HTMLElement | null>},
) {
  const hideAfterMs = options?.hideAfterMs ?? OVERLAY_SB_HIDE_MS
  const contentRef = options?.contentRef

  const metrics = reactive<OverlayScrollBox>({
    scrollTop: 0,
    scrollLeft: 0,
    clientH: 0,
    clientW: 0,
    scrollH: 0,
    scrollW: 0,
  })

  const revealed = ref(false)
  const dragging = ref<OverlayScrollbarAxis | null>(null)
  let hideTimer: ReturnType<typeof setTimeout> | null = null
  let drag: DragState | null = null
  let ro: ResizeObserver | null = null

  const needV = computed(() => overlayNeedV(metrics))
  const needH = computed(() => overlayNeedH(metrics))

  const vSliderStyle = computed(() => {
    const t = computeVerticalThumb(metrics)
    return {top: `${t.top}px`, height: `${t.height}px`}
  })

  const hSliderStyle = computed(() => {
    const t = computeHorizontalThumb(metrics)
    return {left: `${t.left}px`, width: `${t.width}px`}
  })

  function syncMetrics() {
    const el = viewportRef.value
    if (!el) return
    metrics.scrollTop = el.scrollTop
    metrics.scrollLeft = el.scrollLeft
    metrics.clientH = el.clientHeight
    metrics.clientW = el.clientWidth
    metrics.scrollH = el.scrollHeight
    metrics.scrollW = el.scrollWidth
  }

  function clearHideTimer() {
    if (hideTimer) {
      clearTimeout(hideTimer)
      hideTimer = null
    }
  }

  function reveal() {
    revealed.value = true
    clearHideTimer()
    if (dragging.value) return
    hideTimer = setTimeout(() => {
      revealed.value = false
      hideTimer = null
    }, hideAfterMs)
  }

  function keepRevealed() {
    revealed.value = true
    clearHideTimer()
  }

  function scheduleHide() {
    if (dragging.value) return
    clearHideTimer()
    hideTimer = setTimeout(() => {
      revealed.value = false
      hideTimer = null
    }, hideAfterMs)
  }

  function onScroll() {
    syncMetrics()
    reveal()
  }

  function scrollToAxis(axis: OverlayScrollbarAxis, next: number) {
    const el = viewportRef.value
    if (!el) return
    if (axis === 'v') el.scrollTop = next
    else el.scrollLeft = next
    syncMetrics()
  }

  function onRailPointerDown(axis: OverlayScrollbarAxis, event: PointerEvent) {
    const el = viewportRef.value
    if (!el) return
    const target = event.target as HTMLElement | null
    if (target?.closest('.dw-overlay-scroll__slider')) {
      startDrag(axis, event)
      return
    }

    if (axis === 'v') {
      const rail = event.currentTarget as HTMLElement
      const rect = rail.getBoundingClientRect()
      const t = computeVerticalThumb(metrics)
      const y = event.clientY - rect.top - t.height / 2
      const ratio = t.maxTop > 0 ? Math.min(Math.max(y, 0), t.maxTop) / t.maxTop : 0
      scrollToAxis('v', ratio * t.maxScroll)
    } else {
      const rail = event.currentTarget as HTMLElement
      const rect = rail.getBoundingClientRect()
      const t = computeHorizontalThumb(metrics)
      const x = event.clientX - rect.left - t.width / 2
      const ratio = t.maxLeft > 0 ? Math.min(Math.max(x, 0), t.maxLeft) / t.maxLeft : 0
      scrollToAxis('h', ratio * t.maxScroll)
    }
    startDrag(axis, event)
  }

  function startDrag(axis: OverlayScrollbarAxis, event: PointerEvent) {
    event.preventDefault()
    event.stopPropagation()
    const el = viewportRef.value
    if (!el) return

    dragging.value = axis
    keepRevealed()
    drag = {
      axis,
      startPointer: axis === 'v' ? event.clientY : event.clientX,
      startScroll: axis === 'v' ? el.scrollTop : el.scrollLeft,
    }

    const onMove = (e: PointerEvent) => {
      if (!drag || !viewportRef.value) return
      const delta = (drag.axis === 'v' ? e.clientY : e.clientX) - drag.startPointer
      if (drag.axis === 'v') {
        const t = computeVerticalThumb(metrics)
        const scrollPerPx = t.maxTop > 0 ? t.maxScroll / t.maxTop : 0
        scrollToAxis('v', drag.startScroll + delta * scrollPerPx)
      } else {
        const t = computeHorizontalThumb(metrics)
        const scrollPerPx = t.maxLeft > 0 ? t.maxScroll / t.maxLeft : 0
        scrollToAxis('h', drag.startScroll + delta * scrollPerPx)
      }
    }

    const onUp = () => {
      dragging.value = null
      drag = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      scheduleHide()
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  function bindObservers(viewport: HTMLElement) {
    ro?.disconnect()
    syncMetrics()
    if (typeof ResizeObserver === 'undefined') return
    ro = new ResizeObserver(() => syncMetrics())
    ro.observe(viewport)
    const content = contentRef?.value
    if (content) ro.observe(content)
  }

  watch(
    [viewportRef, () => contentRef?.value ?? null],
    ([viewport]) => {
      if (!viewport) return
      bindObservers(viewport)
    },
    {immediate: true},
  )

  onBeforeUnmount(() => {
    clearHideTimer()
    ro?.disconnect()
  })

  return {
    needV,
    needH,
    revealed,
    dragging,
    vSliderStyle,
    hSliderStyle,
    onScroll,
    reveal,
    scheduleHide,
    keepRevealed,
    onRailPointerDown,
    startDrag,
    syncMetrics,
  }
}
