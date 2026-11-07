import type {TreeNode} from '@/core/types'
import {
    ensureCatalogFeatureChildren,
    isExplorerUiFeatureNodeType,
} from '@/features/explorer/services/explorer-ui-catalog.service'
import {
    ensureNacosNamespaceChildren,
    isNacosNamespaceNode,
    usesNacosNamespaceTree,
} from '@/features/explorer/services/nacos-namespace-tree.service'
import {
    ensurePolarisNamespaceChildren,
    isPolarisNamespaceNode,
    usesPolarisNamespaceTree,
} from '@/features/explorer/services/polaris-namespace-tree.service'
import {
    ensureK8sNamespaceChildren,
    isK8sNamespaceNode,
    usesK8sNamespaceTree,
} from '@/features/explorer/services/k8s-namespace-tree.service'

/**
 * Inject SPI explorer-ui feature children for platform connections.
 * Nacos / Polaris / Kubernetes use live namespace nodes (DBX-style) instead of static feature rows.
 * JDBC / Mongo / Kudu / three-tier DB connections have no catalog profile → no virtual features.
 */
export async function ensureFlatConnectionFeatureChildren(node: TreeNode): Promise<void> {
    if (node.type !== 'connection') return
    if (usesNacosNamespaceTree(node.dbType)) {
        await ensureNacosNamespaceChildren(node)
        return
    }
    if (usesPolarisNamespaceTree(node.dbType)) {
        await ensurePolarisNamespaceChildren(node)
        return
    }
    if (usesK8sNamespaceTree(node.dbType)) {
        await ensureK8sNamespaceChildren(node)
        return
    }
    ensureCatalogFeatureChildren(node)
}

export function isConnectionFeatureNode(node: Pick<TreeNode, 'type'>): boolean {
    // Nested SSH script records are loaded dynamically (not declared as connection features).
    if (node.type === 'ssh-script-record') return true
    if (isNacosNamespaceNode(node)) return true
    if (isPolarisNamespaceNode(node)) return true
    if (isK8sNamespaceNode(node)) return true
    return isExplorerUiFeatureNodeType(node.type)
}
