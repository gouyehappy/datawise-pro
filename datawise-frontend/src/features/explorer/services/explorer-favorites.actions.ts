import {findAncestorByType} from '@/core/utils/tree'
import type {TreeNode} from '@/core/types'
import {
    isExplorerFavoritesViewAllId,
    isExplorerVirtualNodeId,
} from '@/features/explorer/services/explorer-favorites.constants'
import type {PinnedTableFavorite} from '@/features/explorer/services/pinned-table-favorites.service'
import {readPinnedTableFavorites} from '@/features/explorer/services/pinned-table-favorites.service'
import {useExplorerStore} from '@/features/explorer/stores/explorer'
import {useWorkspaceStore} from '@/features/workspace/stores/workspace'

export function findPinnedTableFavorite(nodeId: string): PinnedTableFavorite | null {
    return readPinnedTableFavorites().find((item) => item.nodeId === nodeId) ?? null
}

export async function openPinnedTableFavorite(favorite: PinnedTableFavorite): Promise<void> {
    const explorer = useExplorerStore()
    const workspace = useWorkspaceStore()

    const located = await explorer.locateNode(favorite.nodeId)
    if (located) {
        const databaseNode = findAncestorByType(explorer.tree, favorite.nodeId, 'database')
        workspace.openTable(
            favorite.tableName,
            favorite.connectionId,
            databaseNode?.id,
            favorite.database,
            favorite.nodeId,
            'data',
        )
        return
    }

    workspace.openTable(
        favorite.tableName,
        favorite.connectionId,
        undefined,
        favorite.database,
        favorite.nodeId,
        'data',
    )
}

export function isExplorerFavoritesTreeNode(node: Pick<TreeNode, 'id'>): boolean {
    return isExplorerVirtualNodeId(node.id)
}

export function shouldOpenFavoriteTable(node: TreeNode): PinnedTableFavorite | null {
    if (node.type !== 'table') return null
    return findPinnedTableFavorite(node.id)
}

export function isExplorerFavoritesViewAllNode(node: Pick<TreeNode, 'id'>): boolean {
    return isExplorerFavoritesViewAllId(node.id)
}
