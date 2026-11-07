import type {TreeNode} from '@/core/types'
import {findExplorerUiFeature} from '@/features/explorer/services/explorer-ui-catalog.service'

export type ElasticsearchFeatureId = 'workbench' | 'rest-console' | 'documents'

export function parseElasticsearchFeatureId(
    node: Pick<TreeNode, 'type' | 'meta' | 'dbType'>,
): ElasticsearchFeatureId | null {
    if (node.type !== 'elasticsearch-feature') return null
    const meta = typeof node.meta === 'string' ? node.meta : null
    if (!meta) return null
    const fromCatalog = findExplorerUiFeature('elasticsearch', meta)
    if (fromCatalog) return fromCatalog.id as ElasticsearchFeatureId
    if (meta === 'workbench' || meta === 'rest-console' || meta === 'documents') return meta
    return null
}
