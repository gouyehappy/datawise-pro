import type {TreeNode} from '@/core/types'
import {resolveExplorerCatalogLabelKey} from '@/features/explorer/services/explorer-catalog-label.service'
import {hasExplorerUiTreeFeatures} from '@/features/explorer/services/explorer-ui-catalog.service'
import {isExplorerFolderLoaded} from '@/features/explorer/services/explorer-lazy-load'

const COUNTABLE_CHILD_TYPES = new Set([
    'table',
    'view',
    'function',
    'procedure',
    'trigger',
    'view_model',
    'sql_file',
    'column',
    'primary_key',
    'index',
    'key',
    'platform_feature',
    'redis-feature',
    'kafka-feature',
])

/** Loaded vs total for tree badges (`60 of 60`, tables with Load more, etc.). */
export interface FolderItemCountParts {
    loaded: number
    total: number
}

export function shouldShowFolderItemCount(node: TreeNode): boolean {
    if (node.type === 'connection') {
        // JDBC / document catalogs: show database count after connect.
        // Platform flat trees (Redis/Kafka/…) have feature nodes, not databases.
        return !hasExplorerUiTreeFeatures(node.dbType)
    }
    if (node.type === 'folder') {
        return resolveExplorerCatalogLabelKey(node) != null
    }
    return node.type === 'columns' || node.type === 'keys' || node.type === 'indexes'
}

function countFolderChildren(node: TreeNode): number {
    return (node.children ?? []).filter((child) => {
        if (child.type === 'load_more') return false
        if (node.type === 'connection') {
            return child.type === 'database'
        }
        if (node.type === 'folder') {
            return COUNTABLE_CHILD_TYPES.has(child.type)
        }
        return true
    }).length
}

function hasCountableChildren(node: TreeNode): boolean {
    return (node.children ?? []).some((child) => child.type !== 'load_more')
}

function hasLoadMoreChild(node: TreeNode): boolean {
    return (node.children ?? []).some((child) => child.type === 'load_more')
}

/** Connection (databases) and tables folder use `loaded of total`; everything else is a single number. */
function usesLoadedOfTotalFormat(node: TreeNode): boolean {
    if (node.type === 'connection') return true
    return node.type === 'folder' && node.label.trim().toLowerCase() === 'tables'
}

function resolveStoredTotal(node: TreeNode, loaded: number): number {
    if (typeof node.childCount === 'number' && Number.isFinite(node.childCount)) {
        return Math.max(0, Math.round(node.childCount), loaded)
    }
    return loaded
}

/**
 * Returns loaded/total for display (`{loaded} of {total}`).
 * - Connection: databases currently in the tree vs known total
 * - Catalog folders: loaded children vs total (preserves total while Load more remains)
 */
export function resolveFolderItemCountParts(node: TreeNode): FolderItemCountParts | null {
    if (!shouldShowFolderItemCount(node)) return null

    if (node.type === 'connection') {
        if (!hasCountableChildren(node)) return null
        const loaded = countFolderChildren(node)
        return {loaded, total: resolveStoredTotal(node, loaded)}
    }

    if (node.type === 'folder') {
        if (!hasCountableChildren(node) && !isExplorerFolderLoaded(node)) {
            return null
        }
        const loaded = countFolderChildren(node)
        const total = resolveStoredTotal(node, loaded)
        if (loaded === 0 && total === 0 && !isExplorerFolderLoaded(node) && !hasLoadMoreChild(node)) {
            return null
        }
        return {loaded, total}
    }

    // columns / keys / indexes
    const loaded = countFolderChildren(node)
    if (typeof node.childCount === 'number' && Number.isFinite(node.childCount)) {
        return {loaded, total: Math.max(node.childCount, loaded)}
    }
    if (loaded > 0) return {loaded, total: loaded}
    return {loaded: 0, total: 0}
}

/** Total only (backward-compatible helpers / tests). */
export function resolveFolderItemCount(node: TreeNode): number | null {
    const parts = resolveFolderItemCountParts(node)
    return parts ? parts.total : null
}

export function formatFolderItemCount(
    parts: FolderItemCountParts,
    options: {hasMore?: boolean; loadedOfTotal?: boolean} = {},
): string {
    if (!options.loadedOfTotal) {
        return String(parts.total)
    }
    // Paginated tables without a known grand total yet (Load more still present).
    if (options.hasMore && parts.total <= parts.loaded) {
        return `${parts.loaded}+`
    }
    return `${parts.loaded} of ${parts.total}`
}

export function resolveFolderItemCountLabel(node: TreeNode): string | null {
    const parts = resolveFolderItemCountParts(node)
    if (!parts) return null
    return formatFolderItemCount(parts, {
        hasMore: hasLoadMoreChild(node),
        loadedOfTotal: usesLoadedOfTotalFormat(node),
    })
}

export function syncFolderChildCount(node: TreeNode): void {
    if (!shouldShowFolderItemCount(node)) return
    const children = node.children ?? []
    const hasLoadMore = children.some((child) => child.type === 'load_more')
    const countable = countFolderChildren(node)
    const hasLoadedChildren = hasCountableChildren(node)
    if (!hasLoadedChildren && !isExplorerFolderLoaded(node) && (node.type === 'folder' || node.type === 'connection')) {
        return
    }
    if (hasLoadMore && typeof node.childCount === 'number' && Number.isFinite(node.childCount)) {
        node.childCount = Math.max(node.childCount, countable)
        return
    }
    node.childCount = countable
}
