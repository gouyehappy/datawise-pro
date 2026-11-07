import type {TreeNode} from '@/core/types'
import {isExplorerFavoritesGroupId} from '@/features/explorer/services/explorer-favorites.constants'

export type CatalogReorderPosition = 'before' | 'after' | 'inside'

export type CatalogReorderDrop = {
    targetId: string
    position: CatalogReorderPosition
}

export function isCatalogReorderDraggable(node: TreeNode): boolean {
    if (node.type === 'connection') return true
    if (node.type === 'group' && !isExplorerFavoritesGroupId(node.id)) return true
    return false
}

export function isCatalogReorderDropTarget(node: TreeNode): boolean {
    return isCatalogReorderDraggable(node)
}

/**
 * Resolve drop zone from pointer Y within a row.
 * Top third → before, bottom third → after, middle → inside (groups only).
 */
export function resolveCatalogReorderPosition(
    clientY: number,
    rowTop: number,
    rowHeight: number,
    targetType: TreeNode['type'],
): CatalogReorderPosition {
    const height = Math.max(rowHeight, 1)
    const ratio = (clientY - rowTop) / height
    if (targetType === 'group') {
        if (ratio < 0.28) return 'before'
        if (ratio > 0.72) return 'after'
        return 'inside'
    }
    return ratio < 0.5 ? 'before' : 'after'
}

export function resolveCatalogReorderDrop(
    dragged: TreeNode,
    target: TreeNode,
    clientY: number,
    rowTop: number,
    rowHeight: number,
): CatalogReorderDrop | null {
    if (!isCatalogReorderDraggable(dragged) || !isCatalogReorderDropTarget(target)) {
        return null
    }
    if (dragged.id === target.id) return null
    if (isExplorerFavoritesGroupId(target.id)) return null

    const position = resolveCatalogReorderPosition(clientY, rowTop, rowHeight, target.type)
    // Connection cannot nest into another connection
    if (position === 'inside' && target.type !== 'group') {
        return null
    }
    // Nesting a group into itself is rejected server-side; skip no-op self-inside
    if (position === 'inside' && dragged.id === target.id) {
        return null
    }
    return {targetId: target.id, position}
}
