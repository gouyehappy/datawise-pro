import type {TreeNode} from '@/core/types'
import {findExplorerUiFeature} from '@/features/explorer/services/explorer-ui-catalog.service'

export type PolarisFeatureId = 'services' | 'configs'

/** Resolve Polaris feature id from tree node; prefers catalog when present. */
export function parsePolarisFeatureId(node: Pick<TreeNode, 'type' | 'meta' | 'dbType'>): PolarisFeatureId | null {
    if (node.type !== 'polaris-feature') return null
    const meta = typeof node.meta === 'string' ? node.meta : null
    if (!meta) return null
    const fromCatalog = findExplorerUiFeature('polaris', meta)
    if (fromCatalog) return fromCatalog.id as PolarisFeatureId
    if (meta === 'services' || meta === 'configs') return meta
    return null
}
