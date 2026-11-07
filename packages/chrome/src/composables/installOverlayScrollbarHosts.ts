/**
 * Upgrade matching scroll roots to painted overlay scrollbars.
 *
 * Skips: data-grid scroll roots, DwOverlayScroll viewports, Monaco, xterm,
 * nested children under an already-attached ancestor.
 *
 * Host apps can opt in with `data-overlay-scroll`, `.dw-scrollbar-autohide`,
 * or pass extra CSS selectors via `options.selectors`.
 */
import {
  attachOverlayScrollbar,
  detachOverlayScrollbar,
  isOverlayScrollbarAttached,
} from './attachOverlayScrollbar'

/** Framework-neutral defaults (no product-domain host selectors). */
export const OVERLAY_SCROLLBAR_HOST_SELECTOR = [
  '.dw-scrollbar-autohide',
  '[data-overlay-scroll]',
].join(',')

let installed = false
let activeSelector = OVERLAY_SCROLLBAR_HOST_SELECTOR

/** Grid roots keep native thin bars (virtual rows + sticky headers). */
const GRID_SCROLL_ROOT_SELECTOR = '.grid-body, .dw-data-grid__body'

function detachGridOverlayHosts(root: ParentNode = document) {
  root.querySelectorAll?.(GRID_SCROLL_ROOT_SELECTOR).forEach((el) => {
    if (el instanceof HTMLElement && isOverlayScrollbarAttached(el)) {
      detachOverlayScrollbar(el)
    }
  })
}

function tryAttach(node: Element | null) {
  if (!(node instanceof HTMLElement)) return
  if (node.matches(GRID_SCROLL_ROOT_SELECTOR)) {
    if (isOverlayScrollbarAttached(node)) detachOverlayScrollbar(node)
    return
  }
  if (!node.matches(activeSelector)) return
  attachOverlayScrollbar(node)
}

function tryDetachTree(node: Node) {
  if (!(node instanceof Element)) return
  if (node instanceof HTMLElement && isOverlayScrollbarAttached(node)) {
    detachOverlayScrollbar(node)
  }
  node.querySelectorAll?.('.dw-overlay-scroll-target').forEach((el) => {
    if (el instanceof HTMLElement) detachOverlayScrollbar(el)
  })
}

function scan(root: ParentNode = document) {
  detachGridOverlayHosts(root)
  root.querySelectorAll?.(activeSelector).forEach((el) => tryAttach(el))
}

export type InstallOverlayScrollbarHostsOptions = {
  /** Extra CSS selectors merged with framework defaults. */
  selectors?: string[]
}

export function installOverlayScrollbarHosts(options?: InstallOverlayScrollbarHostsOptions) {
  if (typeof document === 'undefined') return

  const extras = (options?.selectors ?? []).filter(Boolean)
  activeSelector = extras.length
    ? [OVERLAY_SCROLLBAR_HOST_SELECTOR, ...extras].join(',')
    : OVERLAY_SCROLLBAR_HOST_SELECTOR

  detachGridOverlayHosts(document)
  if (installed) {
    scan(document)
    return
  }
  installed = true

  const boot = () => scan(document)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, {once: true})
  } else {
    boot()
  }
  requestAnimationFrame(() => requestAnimationFrame(boot))

  const mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'childList') {
        m.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return
          tryAttach(node)
          scan(node)
        })
        m.removedNodes.forEach((node) => tryDetachTree(node))
      } else if (m.type === 'attributes' && m.target instanceof Element) {
        tryAttach(m.target)
      }
    }
  })

  mo.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  })

  document.addEventListener(
    'scroll',
    (event) => {
      const target = event.target
      if (target instanceof HTMLElement) tryAttach(target)
    },
    {capture: true, passive: true},
  )
}

if (typeof document !== 'undefined') {
  detachGridOverlayHosts(document)
}
