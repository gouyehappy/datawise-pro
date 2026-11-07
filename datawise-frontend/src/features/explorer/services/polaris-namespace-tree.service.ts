import type {TreeNode} from '@/core/types'
import type {PolarisNamespaceSummary} from '@/features/explorer/services/polaris-services.service'
import {explorerApi} from '@/api'

export const POLARIS_NAMESPACE_NODE_TYPE = 'polaris-namespace' as const

export function isPolarisNamespaceNode(node: Pick<TreeNode, 'type'>): boolean {
    return node.type === POLARIS_NAMESPACE_NODE_TYPE
}

/** Namespace name for API calls. */
export function parsePolarisNamespaceNodeId(node: Pick<TreeNode, 'type' | 'meta'>): string | null {
    if (!isPolarisNamespaceNode(node)) return null
    const name = (node.meta ?? '').trim()
    return name || null
}

export function polarisNamespaceTreeNodeId(connectionId: string, namespace: string): string {
    return `${connectionId}:polaris-namespace:${namespace.trim()}`
}

export function buildPolarisNamespaceTreeNodes(
    connectionId: string,
    namespaces: PolarisNamespaceSummary[],
): TreeNode[] {
    const items: TreeNode[] = []
    const seen = new Set<string>()
    for (const item of namespaces) {
        const name = (item.name ?? '').trim()
        if (!name || seen.has(name)) continue
        seen.add(name)
        const comment = (item.comment ?? '').trim()
        items.push({
            id: polarisNamespaceTreeNodeId(connectionId, name),
            label: name,
            type: POLARIS_NAMESPACE_NODE_TYPE,
            dbType: 'polaris',
            meta: name,
            comment: comment && comment !== name ? comment : undefined,
        })
    }
    return items
}

/** Replace connection children with live namespace nodes (DBX-style sidebar). */
export async function ensurePolarisNamespaceChildren(node: TreeNode): Promise<boolean> {
    if (node.type !== 'connection' || node.dbType !== 'polaris') return false
    try {
        const result = await explorerApi.fetchPolarisNamespaces(node.id)
        node.children = buildPolarisNamespaceTreeNodes(node.id, result.namespaces ?? [])
        return true
    } catch {
        if (!node.children?.length) {
            node.children = []
        }
        return false
    }
}

export function usesPolarisNamespaceTree(dbType: string | undefined | null): boolean {
    return dbType === 'polaris'
}
