let focusExplorerSearch: (() => void) | null = null
let scrollExplorerToNode: ((nodeId: string) => void) | null = null

export function registerExplorerSearchFocus(handler: () => void) {
    focusExplorerSearch = handler
}

export function clearExplorerSearchFocus() {
    focusExplorerSearch = null
}

export function focusExplorerSearchInput() {
    focusExplorerSearch?.()
}

export function registerExplorerNodeScroll(handler: (nodeId: string) => void) {
    scrollExplorerToNode = handler
}

export function clearExplorerNodeScroll() {
    scrollExplorerToNode = null
}

export function scrollExplorerNodeIntoView(nodeId: string) {
    scrollExplorerToNode?.(nodeId)
}
