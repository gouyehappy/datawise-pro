import type {TreeNode} from '@/core/types'
import {findNodeById} from '@/core/utils/tree'
import {
    EXPLORER_FAVORITES_GROUP_ID,
    EXPLORER_FAVORITES_PREVIEW_MAX,
    EXPLORER_FAVORITES_VIEW_ALL_ID,
} from '@/features/explorer/services/explorer-favorites.constants'
import type {PinnedTableFavorite} from '@/features/explorer/services/pinned-table-favorites.service'

export interface ExplorerFavoritesGroupLabels {
    group: string
    viewAll: (count: number) => string
    tableSubtitle: (favorite: PinnedTableFavorite) => string
}

function toFavoriteTreeNode(
    favorite: PinnedTableFavorite,
    tree: readonly TreeNode[],
    subtitle: string,
): TreeNode {
    const live = findNodeById([...tree], favorite.nodeId)
    if (live?.type === 'table') {
        return {
            ...live,
            meta: subtitle,
        }
    }
    return {
        id: favorite.nodeId,
        label: favorite.tableName,
        type: 'table',
        dbType: favorite.dbType,
        meta: subtitle,
    }
}

/** 树顶收藏分组：默认最多展示 8 项 +「查看全部」 */
export function buildExplorerFavoritesGroup(
    tree: readonly TreeNode[],
    favorites: readonly PinnedTableFavorite[],
    labels: ExplorerFavoritesGroupLabels,
    options: {
        expanded: boolean
        showAll: boolean
    },
): TreeNode | null {
    if (!favorites.length) return null

    const subtitle = (favorite: PinnedTableFavorite) => labels.tableSubtitle(favorite)
    const tableNodes = favorites.map((favorite) => toFavoriteTreeNode(favorite, tree, subtitle(favorite)))

    const needsViewAll = !options.showAll && tableNodes.length > EXPLORER_FAVORITES_PREVIEW_MAX
    const visibleTables = needsViewAll
        ? tableNodes.slice(0, EXPLORER_FAVORITES_PREVIEW_MAX)
        : tableNodes

    const children: TreeNode[] = [...visibleTables]
    if (needsViewAll) {
        children.push({
            id: EXPLORER_FAVORITES_VIEW_ALL_ID,
            label: labels.viewAll(favorites.length),
            type: 'folder',
        })
    }

    return {
        id: EXPLORER_FAVORITES_GROUP_ID,
        label: labels.group,
        type: 'group',
        expanded: options.expanded,
        children,
    }
}
