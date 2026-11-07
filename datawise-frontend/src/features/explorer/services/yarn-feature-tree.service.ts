import type {TreeNode} from '@/core/types'
import {findExplorerUiFeature} from '@/features/explorer/services/explorer-ui-catalog.service'

export type YarnFeatureId = 'workbench' | 'applications' | 'nodes' | 'queues'

/** Resolve YARN feature id from tree node; prefers catalog when present. */
export function parseYarnFeatureId(node: Pick<TreeNode, 'type' | 'meta' | 'dbType'>): YarnFeatureId | null {
    if (node.type !== 'yarn-feature') return null
    const meta = typeof node.meta === 'string' ? node.meta : null
    if (!meta) return null
    const fromCatalog = findExplorerUiFeature('yarn', meta)
    if (fromCatalog) return fromCatalog.id as YarnFeatureId
    if (meta === 'workbench' || meta === 'applications' || meta === 'nodes' || meta === 'queues') return meta
    return null
}
