import type {DbType, TreeNode} from '@/core/types'

/**
 * Fallback platform / namespace explorers whose children are not JDBC schema caches.
 * Keep in sync with `FALLBACK_EXPLORER_UI_PROFILES` + namespace trees; runtime catalog
 * can still refine via `hasUiTreeFeatures`.
 */
const FALLBACK_FLAT_DB_TYPES = new Set([
    'nacos',
    'polaris',
    'kubernetes',
    'redis',
    'elasticsearch',
    'kafka',
    'yarn',
    'jenkins',
    'ssh',
])

/**
 * True when connection explorer uses a non-schema flat catalog (namespace trees
 * or host-supplied UI feature trees). Pass `hasUiTreeFeatures` from the explorer
 * UI catalog when available; otherwise falls back to known platform dbTypes.
 */
export function isFlatConnectionCatalog(
    dbType: DbType | string | undefined | null,
    hasUiTreeFeatures?: (dbType: string | undefined | null) => boolean,
): boolean {
    if (!dbType) return false
    if (hasUiTreeFeatures?.(dbType)) return true
    return FALLBACK_FLAT_DB_TYPES.has(String(dbType))
}

/** 过滤不应出现在连接树中的缓存子节点（历史 Topic / Key 等）。 */
export function filterConnectionSchemaChildren(
    dbType: DbType | string | undefined,
    children: TreeNode[],
    hasUiTreeFeatures?: (dbType: string | undefined | null) => boolean,
): TreeNode[] {
    if (isFlatConnectionCatalog(dbType, hasUiTreeFeatures)) {
        return []
    }
    return children
}
