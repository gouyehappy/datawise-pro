import type {TreeNode} from '@/core/types'
import type {K8sNamespaceSummary} from '@/features/explorer/services/k8s-workloads.service'
import {explorerApi} from '@/api'

export const K8S_NAMESPACE_NODE_TYPE = 'k8s-namespace' as const

export function isK8sNamespaceNode(node: Pick<TreeNode, 'type'>): boolean {
    return node.type === K8S_NAMESPACE_NODE_TYPE
}

/** Namespace name for API calls. */
export function parseK8sNamespaceNodeId(node: Pick<TreeNode, 'type' | 'meta'>): string | null {
    if (!isK8sNamespaceNode(node)) return null
    const name = (node.meta ?? '').trim()
    return name || null
}

export function k8sNamespaceTreeNodeId(connectionId: string, namespace: string): string {
    return `${connectionId}:k8s-namespace:${namespace.trim()}`
}

export function buildK8sNamespaceTreeNodes(
    connectionId: string,
    namespaces: K8sNamespaceSummary[],
): TreeNode[] {
    const items: TreeNode[] = []
    const seen = new Set<string>()
    for (const item of namespaces) {
        const name = (item.name ?? '').trim()
        if (!name || seen.has(name)) continue
        seen.add(name)
        items.push({
            id: k8sNamespaceTreeNodeId(connectionId, name),
            label: name,
            type: K8S_NAMESPACE_NODE_TYPE,
            dbType: 'kubernetes',
            meta: name,
            comment: item.status?.trim() || undefined,
        })
    }
    return items
}

/** Replace connection children with live namespace nodes (DBX-style sidebar). */
export async function ensureK8sNamespaceChildren(node: TreeNode): Promise<boolean> {
    if (node.type !== 'connection' || node.dbType !== 'kubernetes') return false
    try {
        const result = await explorerApi.fetchK8sNamespaces(node.id)
        node.children = buildK8sNamespaceTreeNodes(node.id, result.namespaces ?? [])
        return true
    } catch {
        if (!node.children?.length) {
            node.children = []
        }
        return false
    }
}

export function usesK8sNamespaceTree(dbType: string | undefined | null): boolean {
    return dbType === 'kubernetes'
}
