type LocalShortcutHandler = () => void

export interface PageLocalShortcutState {
  actionHandlers: Partial<Record<string, LocalShortcutHandler>>
  /** 固定组合键（不经设置项），如 SSH 脚本页 Ctrl+S */
  keyHandlers: Map<string, LocalShortcutHandler>
}

let activeOwnerId: string | null = null
let activeState: PageLocalShortcutState = {
  actionHandlers: {},
  keyHandlers: new Map(),
}

function emptyState(): PageLocalShortcutState {
  return {actionHandlers: {}, keyHandlers: new Map()}
}

export function setPageLocalShortcuts(ownerId: string, state: PageLocalShortcutState) {
  activeOwnerId = ownerId
  activeState = state
}

export function clearPageLocalShortcuts(ownerId: string) {
  if (activeOwnerId !== ownerId) return
  activeOwnerId = null
  activeState = emptyState()
}

export function getActivePageLocalShortcutOwner(): string | null {
  return activeOwnerId
}

export function getPageLocalShortcutState(): PageLocalShortcutState {
  return activeState
}

export function invokeLocalShortcut(actionId: string): boolean {
  if (!activeOwnerId) return false
  const handler = activeState.actionHandlers[actionId]
  if (!handler) return false
  handler()
  return true
}

/** @deprecated use getPageLocalShortcutState */
export function getLocalShortcutHandlers() {
  return activeState.actionHandlers
}

/** @deprecated use setPageLocalShortcuts */
export function setLocalShortcutHandlers(
  handlers: Partial<Record<string, LocalShortcutHandler | undefined>>,
) {
  const next: Partial<Record<string, LocalShortcutHandler>> = {}
  for (const [id, handler] of Object.entries(handlers)) {
    if (handler) next[id] = handler
  }
  activeState = {...activeState, actionHandlers: next}
}

/** @deprecated use clearPageLocalShortcuts */
export function clearLocalShortcutHandlers() {
  activeOwnerId = null
  activeState = emptyState()
}
