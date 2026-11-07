import type {TreeNode} from '@/core/types'
import {findExplorerUiFeature} from '@/features/explorer/services/explorer-ui-catalog.service'

export type RedisFeatureId = 'workbench' | 'keys' | 'command'

/** Resolve Redis feature id from tree node; prefers catalog when present. */
export function parseRedisFeatureId(node: Pick<TreeNode, 'type' | 'meta' | 'dbType'>): RedisFeatureId | null {
    if (node.type !== 'redis-feature') return null
    const meta = typeof node.meta === 'string' ? node.meta : null
    if (!meta) return null
    const fromCatalog = findExplorerUiFeature('redis', meta)
    if (fromCatalog) return fromCatalog.id as RedisFeatureId
    if (meta === 'workbench' || meta === 'keys' || meta === 'command') return meta
    return null
}
