import {reactive} from 'vue'

/**
 * Gates when a community-workbench iframe may become the visible workspace surface.
 * CEF paints a white document while navigating; keep the previous surface (welcome)
 * until the host marks the frame ready, and warm the iframe under visibility:hidden.
 */
const warming = reactive(new Set<string>())
const ready = reactive(new Set<string>())

export function beginCommunityWorkbenchPaint(tabId: string): void {
  const id = tabId.trim()
  if (!id) return
  ready.delete(id)
  warming.add(id)
}

export function completeCommunityWorkbenchPaint(tabId: string): void {
  const id = tabId.trim()
  if (!id) return
  warming.delete(id)
  ready.add(id)
}

export function releaseCommunityWorkbenchPaint(tabId: string): void {
  const id = tabId.trim()
  if (!id) return
  warming.delete(id)
  ready.delete(id)
}

/** True when the tab may be shown as the foreground workspace. */
export function isCommunityWorkbenchPaintReady(tabId: string | null | undefined): boolean {
  if (!tabId) return true
  const id = tabId.trim()
  if (!id) return true
  // Not under this gate (legacy / non-host path) → treat as ready.
  if (!warming.has(id) && !ready.has(id)) return true
  return ready.has(id)
}

export function isCommunityWorkbenchPaintWarming(tabId: string | null | undefined): boolean {
  if (!tabId) return false
  return warming.has(tabId.trim())
}
