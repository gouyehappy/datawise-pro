/**
 * In-place painted-rail controller (same visual language as DwOverlayScroll).
 * Shares overlay-scrollbar-metrics with the Vue component.
 */
import '../styles/overlay-scrollbar.css'
import {
  OVERLAY_SB_HIDE_MS,
  OVERLAY_SB_RAIL_PX,
  computeHorizontalThumb,
  computeVerticalThumb,
  overflowCanScroll,
  overlayArmed,
  overlayNeedH,
  overlayNeedV,
  readOverlayScrollBox,
  type OverlayScrollBox,
} from './overlay-scrollbar-metrics'

type Axis = 'v' | 'h'

export type OverlayScrollbarController = {
  dispose: () => void
  sync: () => void
}

const ATTACHED = new WeakMap<HTMLElement, OverlayScrollbarController>()

export function getAttachedOverlayScrollbar(el: HTMLElement) {
  return ATTACHED.get(el) ?? null
}

export function isOverlayScrollbarAttached(el: HTMLElement) {
  return ATTACHED.has(el)
}

export function detachOverlayScrollbar(el: HTMLElement) {
  ATTACHED.get(el)?.dispose()
}

function shouldSkipHost(el: HTMLElement) {
  if (ATTACHED.has(el)) return true
  if (el.classList.contains('dw-overlay-scroll__viewport')) return true
  if (el.classList.contains('dw-overlay-scroll')) return true
  if (el.closest('.dw-overlay-scroll__viewport')) return true
  if (el.closest('.monaco-editor, .xterm')) return true
  if (el.classList.contains('dw-overlay-scroll__rail')) return true
  if (el.classList.contains('dw-overlay-scroll__slider')) return true
  // Virtual grid scroll roots: do not attach in-place rails
  if (el.classList.contains('grid-body') || el.classList.contains('dw-data-grid__body')) return true
  const ancestor = el.parentElement?.closest('.dw-overlay-scroll-target')
  if (ancestor && ancestor !== el) return true
  return false
}

export function createOverlayScrollbarController(
  viewport: HTMLElement,
  options?: {hideAfterMs?: number},
): OverlayScrollbarController | null {
  if (typeof document === 'undefined') return null
  if (shouldSkipHost(viewport)) return null
  if (!overflowCanScroll(viewport)) return null

  const hideAfterMs = options?.hideAfterMs ?? OVERLAY_SB_HIDE_MS
  viewport.classList.add('dw-overlay-scroll-target')

  const railV = document.createElement('div')
  railV.className =
    'dw-overlay-scroll__rail dw-overlay-scroll__rail--v dw-overlay-scroll__rail--attached'
  railV.setAttribute('aria-hidden', 'true')
  const sliderV = document.createElement('div')
  sliderV.className = 'dw-overlay-scroll__slider'
  railV.appendChild(sliderV)

  const railH = document.createElement('div')
  railH.className =
    'dw-overlay-scroll__rail dw-overlay-scroll__rail--h dw-overlay-scroll__rail--attached'
  railH.setAttribute('aria-hidden', 'true')
  const sliderH = document.createElement('div')
  sliderH.className = 'dw-overlay-scroll__slider'
  railH.appendChild(sliderH)

  viewport.appendChild(railV)
  viewport.appendChild(railH)

  let revealed = false
  let dragging: Axis | null = null
  let hideTimer: ReturnType<typeof setTimeout> | null = null
  let drag: {axis: Axis; startPointer: number; startScroll: number} | null = null
  let sizeRo: ResizeObserver | null = null
  let contentRo: ResizeObserver | null = null
  let treeMo: MutationObserver | null = null
  let box: OverlayScrollBox = readOverlayScrollBox(viewport)
  let scrollIdleTimer: ReturnType<typeof setTimeout> | null = null
  let observersPaused = false
  let syncQueued = false

  function clearHide() {
    if (hideTimer) {
      clearTimeout(hideTimer)
      hideTimer = null
    }
  }

  function applyVisibility() {
    const needV = overlayNeedV(box)
    const needH = overlayNeedH(box)
    const show = revealed || dragging != null
    railV.classList.toggle('is-needed', needV)
    railH.classList.toggle('is-needed', needH)
    railV.classList.toggle('is-visible', show && needV)
    railH.classList.toggle('is-visible', show && needH)
    railV.classList.toggle('is-active', dragging === 'v')
    railH.classList.toggle('is-active', dragging === 'h')
    railH.classList.toggle('is-corner', needV && needH)
    railV.hidden = !needV
    railH.hidden = !needH
    viewport.classList.toggle('dw-overlay-scroll-target--armed', overlayArmed(box))
  }

  function reveal() {
    revealed = true
    applyVisibility()
    clearHide()
    if (dragging) return
    hideTimer = setTimeout(() => {
      revealed = false
      applyVisibility()
    }, hideAfterMs)
  }

  function scheduleHide() {
    if (dragging) return
    clearHide()
    hideTimer = setTimeout(() => {
      revealed = false
      applyVisibility()
    }, hideAfterMs)
  }

  function pinRails() {
    const needV = overlayNeedV(box)
    const needH = overlayNeedH(box)
    railV.style.height = `${box.clientH}px`
    railV.style.transform = `translate3d(0, ${box.scrollTop}px, 0)`
    const hTrack = needV ? Math.max(0, box.clientW - OVERLAY_SB_RAIL_PX) : box.clientW
    railH.style.width = `${hTrack}px`
    railH.style.transform = `translate3d(${box.scrollLeft}px, ${box.scrollTop + box.clientH - OVERLAY_SB_RAIL_PX}px, 0)`

    if (needV) {
      const t = computeVerticalThumb(box)
      sliderV.style.top = `${t.top}px`
      sliderV.style.height = `${t.height}px`
    }
    if (needH) {
      const t = computeHorizontalThumb(box)
      sliderH.style.left = `${t.left}px`
      sliderH.style.width = `${t.width}px`
    }
  }

  function sync() {
    box = readOverlayScrollBox(viewport)
    pinRails()
    applyVisibility()
  }

  function queueSync() {
    if (observersPaused || syncQueued) return
    syncQueued = true
    requestAnimationFrame(() => {
      syncQueued = false
      if (!observersPaused) sync()
    })
  }

  function pauseContentObservers() {
    if (observersPaused) return
    observersPaused = true
    treeMo?.disconnect()
    contentRo?.disconnect()
    contentRo = null
  }

  function resumeContentObservers() {
    observersPaused = false
    bindContentObservers()
    startTreeObserver()
    sync()
  }

  function onScroll() {
    pauseContentObservers()
    box.scrollTop = viewport.scrollTop
    box.scrollLeft = viewport.scrollLeft
    box.clientH = viewport.clientHeight
    box.clientW = viewport.clientWidth
    box.scrollH = viewport.scrollHeight
    box.scrollW = viewport.scrollWidth
    pinRails()
    if (!revealed) {
      reveal()
    } else {
      clearHide()
      if (!dragging) {
        hideTimer = setTimeout(() => {
          revealed = false
          applyVisibility()
        }, hideAfterMs)
      }
    }
    if (scrollIdleTimer) clearTimeout(scrollIdleTimer)
    scrollIdleTimer = setTimeout(() => {
      scrollIdleTimer = null
      resumeContentObservers()
    }, 140)
  }

  function scrollToAxis(axis: Axis, next: number) {
    if (axis === 'v') viewport.scrollTop = next
    else viewport.scrollLeft = next
    sync()
  }

  function startDrag(axis: Axis, event: PointerEvent) {
    event.preventDefault()
    event.stopPropagation()
    dragging = axis
    revealed = true
    clearHide()
    applyVisibility()
    drag = {
      axis,
      startPointer: axis === 'v' ? event.clientY : event.clientX,
      startScroll: axis === 'v' ? viewport.scrollTop : viewport.scrollLeft,
    }

    const onMove = (e: PointerEvent) => {
      if (!drag) return
      const delta = (drag.axis === 'v' ? e.clientY : e.clientX) - drag.startPointer
      box = readOverlayScrollBox(viewport)
      if (drag.axis === 'v') {
        const t = computeVerticalThumb(box)
        const span = Math.max(1, t.maxTop)
        scrollToAxis('v', drag.startScroll + delta * (t.maxScroll / span))
      } else {
        const t = computeHorizontalThumb(box)
        const span = Math.max(1, t.maxLeft)
        scrollToAxis('h', drag.startScroll + delta * (t.maxScroll / span))
      }
    }

    const onUp = () => {
      dragging = null
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

  function onRailDown(axis: Axis, event: PointerEvent) {
    if ((event.target as HTMLElement | null)?.closest('.dw-overlay-scroll__slider')) {
      startDrag(axis, event)
      return
    }
    if (axis === 'v') {
      const rect = railV.getBoundingClientRect()
      const t = computeVerticalThumb(box)
      const y = event.clientY - rect.top - t.height / 2
      const ratio = t.maxTop > 0 ? Math.min(Math.max(y, 0), t.maxTop) / t.maxTop : 0
      scrollToAxis('v', ratio * t.maxScroll)
    } else {
      const rect = railH.getBoundingClientRect()
      const t = computeHorizontalThumb(box)
      const x = event.clientX - rect.left - t.width / 2
      const ratio = t.maxLeft > 0 ? Math.min(Math.max(x, 0), t.maxLeft) / t.maxLeft : 0
      scrollToAxis('h', ratio * t.maxScroll)
    }
    startDrag(axis, event)
  }

  const onPointerV = (e: PointerEvent) => onRailDown('v', e)
  const onPointerH = (e: PointerEvent) => onRailDown('h', e)
  const onEnter = () => reveal()
  const onLeave = () => scheduleHide()

  function bindContentObservers() {
    contentRo?.disconnect()
    contentRo = null
    if (typeof ResizeObserver === 'undefined') return
    contentRo = new ResizeObserver(() => queueSync())
    for (const child of Array.from(viewport.children)) {
      if (child === railV || child === railH) continue
      if (child instanceof Element) contentRo.observe(child)
    }
  }

  function startTreeObserver() {
    if (typeof MutationObserver === 'undefined') return
    treeMo?.disconnect()
    if (!treeMo) {
      treeMo = new MutationObserver(() => {
        if (observersPaused) return
        bindContentObservers()
        queueSync()
      })
    }
    treeMo.observe(viewport, {childList: true})
  }

  railV.style.top = '0'
  railV.style.left = 'auto'
  railV.style.right = '0'
  railH.style.top = '0'
  railH.style.left = '0'
  railH.style.right = 'auto'
  railH.style.bottom = 'auto'

  railV.addEventListener('pointerdown', onPointerV)
  railH.addEventListener('pointerdown', onPointerH)
  viewport.addEventListener('scroll', onScroll, {passive: true})
  viewport.addEventListener('mouseenter', onEnter)
  viewport.addEventListener('mouseleave', onLeave)

  if (typeof ResizeObserver !== 'undefined') {
    sizeRo = new ResizeObserver(() => queueSync())
    sizeRo.observe(viewport)
  }
  bindContentObservers()
  startTreeObserver()

  requestAnimationFrame(() => sync())

  const controller: OverlayScrollbarController = {
    sync,
    dispose() {
      clearHide()
      if (scrollIdleTimer) clearTimeout(scrollIdleTimer)
      sizeRo?.disconnect()
      contentRo?.disconnect()
      treeMo?.disconnect()
      viewport.removeEventListener('scroll', onScroll)
      viewport.removeEventListener('mouseenter', onEnter)
      viewport.removeEventListener('mouseleave', onLeave)
      railV.removeEventListener('pointerdown', onPointerV)
      railH.removeEventListener('pointerdown', onPointerH)
      railV.remove()
      railH.remove()
      viewport.classList.remove('dw-overlay-scroll-target', 'dw-overlay-scroll-target--armed')
      ATTACHED.delete(viewport)
    },
  }

  ATTACHED.set(viewport, controller)
  return controller
}
