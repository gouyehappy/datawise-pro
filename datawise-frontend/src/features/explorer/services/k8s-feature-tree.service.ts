import type {TreeNode} from '@/core/types'
import {findExplorerUiFeature} from '@/features/explorer/services/explorer-ui-catalog.service'

export type K8sFeatureId =
    | 'pods'
    | 'deployments'
    | 'services'
    | 'events'
    | 'configmaps'
    | 'secrets'
    | 'apply'
    | 'crds'
    | 'helm'

const KNOWN: ReadonlySet<string> = new Set([
    'pods',
    'deployments',
    'services',
    'events',
    'configmaps',
    'secrets',
    'apply',
    'crds',
    'helm',
])

/** Resolve Kubernetes feature id from tree node; prefers catalog when present. */
export function parseK8sFeatureId(node: Pick<TreeNode, 'type' | 'meta' | 'dbType'>): K8sFeatureId | null {
    if (node.type !== 'k8s-feature') return null
    const meta = typeof node.meta === 'string' ? node.meta : null
    if (!meta) return null
    const fromCatalog = findExplorerUiFeature('kubernetes', meta)
    if (fromCatalog) return fromCatalog.id as K8sFeatureId
    if (KNOWN.has(meta)) return meta as K8sFeatureId
    return null
}
