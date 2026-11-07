import type {TreeNode} from '@/core/types'
import {findExplorerUiFeature} from '@/features/explorer/services/explorer-ui-catalog.service'

export type NacosFeatureId = 'configs' | 'services'

/** Resolve Nacos feature id from tree node; prefers catalog when present. */
export function parseNacosFeatureId(node: Pick<TreeNode, 'type' | 'meta' | 'dbType'>): NacosFeatureId | null {
    if (node.type !== 'nacos-feature') return null
    const meta = typeof node.meta === 'string' ? node.meta : null
    if (!meta) return null
    const fromCatalog = findExplorerUiFeature('nacos', meta)
    if (fromCatalog) return fromCatalog.id as NacosFeatureId
    if (meta === 'configs' || meta === 'services') return meta
    return null
}
