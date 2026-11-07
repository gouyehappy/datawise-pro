export type ExplorerDatabaseShortcutAction = 'open' | 'recent' | 'new' | 'console'

type Handler = (action: ExplorerDatabaseShortcutAction) => void

let handler: Handler | null = null

export function registerExplorerDatabaseShortcutHandler(next: Handler | null) {
    handler = next
}

export function runExplorerDatabaseShortcut(action: ExplorerDatabaseShortcutAction) {
    handler?.(action)
}

export function clearExplorerDatabaseShortcutHandler() {
    handler = null
}
