export const EXPLORER_FAVORITES_GROUP_ID = '__datawise-favorites__'
export const EXPLORER_FAVORITES_VIEW_ALL_ID = '__datawise-favorites-view-all__'
export const EXPLORER_FAVORITES_PREVIEW_MAX = 8

export function isExplorerFavoritesGroupId(nodeId: string): boolean {
    return nodeId === EXPLORER_FAVORITES_GROUP_ID
}

export function isExplorerFavoritesViewAllId(nodeId: string): boolean {
    return nodeId === EXPLORER_FAVORITES_VIEW_ALL_ID
}

export function isExplorerVirtualNodeId(nodeId: string): boolean {
    return isExplorerFavoritesGroupId(nodeId)
        || isExplorerFavoritesViewAllId(nodeId)
}

