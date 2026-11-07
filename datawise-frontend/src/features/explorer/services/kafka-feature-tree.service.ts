import type {TreeNode} from '@/core/types'
import {findExplorerUiFeature} from '@/features/explorer/services/explorer-ui-catalog.service'

export type KafkaFeatureId = 'workbench' | 'topics' | 'consumer-groups' | 'table-publish'

/** Resolve Kafka feature id from tree node; prefers catalog when present. */
export function parseKafkaFeatureId(node: Pick<TreeNode, 'type' | 'meta' | 'dbType'>): KafkaFeatureId | null {
    if (node.type !== 'kafka-feature') return null
    const meta = typeof node.meta === 'string' ? node.meta : null
    if (!meta) return null
    const fromCatalog = findExplorerUiFeature('kafka', meta)
    if (fromCatalog) return fromCatalog.id as KafkaFeatureId
    if (meta === 'workbench' || meta === 'topics' || meta === 'consumer-groups' || meta === 'table-publish') return meta
    return null
}
