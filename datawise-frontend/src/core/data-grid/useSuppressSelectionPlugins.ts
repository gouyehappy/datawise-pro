import {onBeforeUnmount, watch, type Ref} from 'vue'

const OVERLAY_TEXT_RE = /解释|翻译|朗读|搜一搜|Ask\s*AI|Translate|Explain|Copy\s*as/i

/** Heuristic: floating selection toolbars injected by browser content scripts. */
function looksLikeSelectionPluginOverlay(el: HTMLElement): boolean {
  if (el.closest?.('.data-grid, .dw-data-grid-table, [data-dw-grid]')) return false
  const style = window.getComputedStyle(el)
  const pos = style.position
  if (pos !== 'fixed' && pos !== 'absolute') return false
  const z = Number.parseInt(style.zIndex || '0', 10)
  if (Number.isFinite(z) && z < 1000) {
    if (z < 100) return false
  }
  const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim()
  if (!text || text.length > 80) return false
  if (!OVERLAY_TEXT_RE.test(text)) return false
  const rect = el.getBoundingClientRect()
  if (rect.width < 40 || rect.height < 20) return false
  if (rect.width > 640 || rect.height > 120) return false
  return true
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement
      || target instanceof HTMLTextAreaElement
      || (target instanceof HTMLElement && target.isContentEditable)
}

function isEditingInside(root: HTMLElement | null): boolean {
  if (!root) return false
  const active = document.activeElement
  if (!active || !root.contains(active)) return false
  return isEditableTarget(active)
}

function clearSelectionIfInside(root: HTMLElement | null) {
  if (!root || isEditingInside(root)) return
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return
  const anchor = sel.anchorNode
  if (!anchor) return
  const node = anchor.nodeType === Node.TEXT_NODE ? anchor.parentElement : (anchor as Node)
  if (node && root.contains(node)) {
    sel.removeAllRanges()
  }
}

function isEventInsideRoot(event: Event, root: HTMLElement): boolean {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : []
  if (path.some((n) => n === root)) return true
  const target = event.target
  return target instanceof Node && root.contains(target)
}

/**
 * Best-effort suppression of browser "划词" / AI selection toolbars inside a root.
 * Cannot disable Chrome extensions themselves; blocks common injection patterns.
 * Must not interfere with inline cell editing (input focus / text select).
 */
export function useSuppressSelectionPlugins(rootRef: Ref<HTMLElement | null>) {
  let observer: MutationObserver | null = null
  let sweepTimer: number | null = null
  let active = false

  function sweepOverlays() {
    if (isEditingInside(rootRef.value)) return
    const candidates = document.body?.querySelectorAll<HTMLElement>('body > div, body > section, body > aside')
    if (!candidates) return
    for (const el of candidates) {
      try {
        if (looksLikeSelectionPluginOverlay(el)) {
          el.remove()
        }
      } catch {
        // ignore cross-origin / detached
      }
    }
  }

  function scheduleSweep() {
    if (sweepTimer != null) window.clearTimeout(sweepTimer)
    sweepTimer = window.setTimeout(() => {
      sweepTimer = null
      sweepOverlays()
      window.setTimeout(sweepOverlays, 50)
      window.setTimeout(sweepOverlays, 150)
    }, 0)
  }

  function onSelectStart(event: Event) {
    const root = rootRef.value
    if (!root || !isEventInsideRoot(event, root)) return
    if (isEditableTarget(event.target)) return
    // Only block selection; do not stopPropagation (breaks unrelated listeners).
    event.preventDefault()
  }

  function onPointerUp(event: Event) {
    const root = rootRef.value
    if (!root || !isEventInsideRoot(event, root)) return
    if (isEditableTarget(event.target) || isEditingInside(root)) return
    clearSelectionIfInside(root)
    scheduleSweep()
  }

  function attach(root: HTMLElement) {
    if (active) return
    active = true
    root.setAttribute('data-dw-grid', '1')
    document.addEventListener('selectstart', onSelectStart, true)
    document.addEventListener('mouseup', onPointerUp, true)
    document.addEventListener('pointerup', onPointerUp, true)
    // Observe only direct body children — avoid reacting to every grid virtual-scroll patch.
    observer = new MutationObserver((records) => {
      if (isEditingInside(rootRef.value)) return
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof HTMLElement)) continue
          if (looksLikeSelectionPluginOverlay(node)) {
            node.remove()
            continue
          }
          for (const child of node.children) {
            if (child instanceof HTMLElement && looksLikeSelectionPluginOverlay(child)) {
              child.remove()
            }
          }
        }
      }
    })
    observer.observe(document.body, {childList: true, subtree: false})
  }

  function detach() {
    if (!active) return
    active = false
    document.removeEventListener('selectstart', onSelectStart, true)
    document.removeEventListener('mouseup', onPointerUp, true)
    document.removeEventListener('pointerup', onPointerUp, true)
    observer?.disconnect()
    observer = null
    if (sweepTimer != null) {
      window.clearTimeout(sweepTimer)
      sweepTimer = null
    }
  }

  watch(
      rootRef,
      (el, _prev, onCleanup) => {
        detach()
        if (el) {
          attach(el)
          onCleanup(detach)
        }
      },
      {immediate: true},
  )

  onBeforeUnmount(detach)

  return {sweepOverlays}
}
