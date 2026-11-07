/**
 * Overlay scrollbar pure metrics (component rails / in-place attach share this).
 */

/** Align with --dw-scrollbar-size (thin rail). */
export const OVERLAY_SB_RAIL_PX = 4
export const OVERLAY_SB_MIN_THUMB_PX = 16
export const OVERLAY_SB_HIDE_MS = 900

export type OverlayScrollBox = {
  scrollTop: number
  scrollLeft: number
  clientH: number
  clientW: number
  scrollH: number
  scrollW: number
}

export function overlayNeedV(m: OverlayScrollBox): boolean {
  return m.clientH > 0 && m.scrollH > m.clientH + 1
}

export function overlayNeedH(m: OverlayScrollBox): boolean {
  return m.clientW > 0 && m.scrollW > m.clientW + 1
}

/** Hide native bars only after scrollability is confirmed. */
export function overlayArmed(m: OverlayScrollBox): boolean {
  return (overlayNeedV(m) || overlayNeedH(m)) && m.clientH > 0 && m.clientW > 0
}

export function computeVerticalThumb(m: OverlayScrollBox) {
  if (!overlayNeedV(m)) {
    return {top: 0, height: 0, maxTop: 0, maxScroll: 0}
  }
  const track = m.clientH
  const height = Math.max(OVERLAY_SB_MIN_THUMB_PX, track * (m.clientH / m.scrollH))
  const maxTop = Math.max(0, track - height)
  const maxScroll = Math.max(0, m.scrollH - m.clientH)
  const top = maxScroll > 0 ? (m.scrollTop / maxScroll) * maxTop : 0
  return {top, height, maxTop, maxScroll}
}

export function computeHorizontalThumb(m: OverlayScrollBox) {
  if (!overlayNeedH(m)) {
    return {left: 0, width: 0, track: 0, maxLeft: 0, maxScroll: 0}
  }
  const track = overlayNeedV(m) ? Math.max(0, m.clientW - OVERLAY_SB_RAIL_PX) : m.clientW
  const width = Math.max(OVERLAY_SB_MIN_THUMB_PX, track * (m.clientW / m.scrollW))
  const maxLeft = Math.max(0, track - width)
  const maxScroll = Math.max(0, m.scrollW - m.clientW)
  const left = maxScroll > 0 ? (m.scrollLeft / maxScroll) * maxLeft : 0
  return {left, width, track, maxLeft, maxScroll}
}

export function readOverlayScrollBox(el: HTMLElement): OverlayScrollBox {
  return {
    scrollTop: el.scrollTop,
    scrollLeft: el.scrollLeft,
    clientH: el.clientHeight,
    clientW: el.clientWidth,
    scrollH: el.scrollHeight,
    scrollW: el.scrollWidth,
  }
}

export function overflowCanScroll(el: HTMLElement): boolean {
  const s = getComputedStyle(el)
  const ok = (v: string) => v === 'auto' || v === 'scroll' || v === 'overlay'
  return ok(s.overflowX) || ok(s.overflowY)
}
