export type ExplorerNodeShortcutHandlers = {
    openSelected?: () => void
    editSelected?: () => void
    deleteSelected?: () => void
}

let handlers: ExplorerNodeShortcutHandlers = {}

export function registerExplorerNodeShortcutHandlers(next: ExplorerNodeShortcutHandlers) {
    handlers = next
}

export function clearExplorerNodeShortcutHandlers() {
    handlers = {}
}

export function runExplorerOpenSelectedNode() {
    handlers.openSelected?.()
}

export function runExplorerEditSelectedNode() {
    handlers.editSelected?.()
}

export function runExplorerDeleteSelectedNode() {
    handlers.deleteSelected?.()
}
