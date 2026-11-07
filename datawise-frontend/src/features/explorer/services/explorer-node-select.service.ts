import type {TreeNode} from '@/core/types'
import {
    isExplorerFavoritesGroupId,
    isExplorerFavoritesViewAllId,
} from '@/features/explorer/services/explorer-favorites.constants'

/** Shared favorites preamble for select / open (before regular node routing). */
export type ExplorerFavoritesNavIntent = 'show-all' | 'select-group'

export function resolveExplorerFavoritesNavIntent(
    node: Pick<TreeNode, 'id'>,
): ExplorerFavoritesNavIntent | null {
    if (isExplorerFavoritesViewAllId(node.id)) return 'show-all'
    if (isExplorerFavoritesGroupId(node.id)) return 'select-group'
    return null
}

export type ExplorerNodeSelectIntent =
    | {kind: 'load-more'}
    | {kind: 'favorites-show-all'}
    | {kind: 'favorites-select'}
    | {kind: 'select'; sync: 'view-model' | 'info'}

/** Pure select routing for explorer tree clicks (side effects stay in the composable). */
export function resolveExplorerNodeSelectIntent(
    node: Pick<TreeNode, 'type' | 'id'>,
): ExplorerNodeSelectIntent {
    if (node.type === 'load_more') return {kind: 'load-more'}
    const favorites = resolveExplorerFavoritesNavIntent(node)
    if (favorites === 'show-all') return {kind: 'favorites-show-all'}
    if (favorites === 'select-group') return {kind: 'favorites-select'}
    if (node.type === 'view_model') return {kind: 'select', sync: 'view-model'}
    return {kind: 'select', sync: 'info'}
}
