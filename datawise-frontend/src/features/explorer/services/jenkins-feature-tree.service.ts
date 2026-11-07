import type {TreeNode} from '@/core/types'
import {findExplorerUiFeature} from '@/features/explorer/services/explorer-ui-catalog.service'

export type JenkinsFeatureId = 'workbench' | 'jobs' | 'nodes'

/** Resolve Jenkins feature id from tree node; prefers catalog when present. */
export function parseJenkinsFeatureId(node: Pick<TreeNode, 'type' | 'meta' | 'dbType'>): JenkinsFeatureId | null {
    if (node.type !== 'jenkins-feature') return null
    const meta = typeof node.meta === 'string' ? node.meta : null
    if (!meta) return null
    const fromCatalog = findExplorerUiFeature('jenkins', meta)
    if (fromCatalog) return fromCatalog.id as JenkinsFeatureId
    if (meta === 'workbench' || meta === 'jobs' || meta === 'nodes') return meta
    return null
}
