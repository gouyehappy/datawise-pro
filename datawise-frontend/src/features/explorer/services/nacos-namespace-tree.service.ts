import type {TreeNode} from '@/core/types'
import type {NacosNamespaceSummary} from '@/features/explorer/services/nacos-configs.service'
import {explorerApi} from '@/api'
import {fetchConnectionConfig} from '@/shared/config/connections-catalog.service'
import {readVisibleNacosNamespaces} from '@/features/connection/utils/nacos-endpoint'

export const NACOS_NAMESPACE_NODE_TYPE = 'nacos-namespace' as const

export function isNacosNamespaceNode(node: Pick<TreeNode, 'type'>): boolean {
    return node.type === NACOS_NAMESPACE_NODE_TYPE
}

/** Namespace id for API calls; empty string is public. */
export function parseNacosNamespaceNodeId(node: Pick<TreeNode, 'type' | 'meta'>): string | null {
    if (!isNacosNamespaceNode(node)) return null
    if (node.meta === 'public' || node.meta == null) return ''
    return node.meta
}

export function nacosNamespaceTreeNodeId(connectionId: string, namespaceId: string): string {
    const token = namespaceId.trim() || 'public'
    return `${connectionId}:nacos-namespace:${token}`
}

export function buildNacosNamespaceTreeNodes(
    connectionId: string,
    namespaces: NacosNamespaceSummary[],
    allowed: string[] | null,
): TreeNode[] {
    const items: TreeNode[] = []
    const allowPublic = allowed == null || allowed.includes('')
    if (allowPublic) {
        items.push({
            id: nacosNamespaceTreeNodeId(connectionId, ''),
            label: 'public',
            type: NACOS_NAMESPACE_NODE_TYPE,
            dbType: 'nacos',
            meta: 'public',
        })
    }
    const seen = new Set<string>(allowPublic ? [''] : [])
    for (const item of namespaces) {
        const id = (item.namespace ?? '').trim()
        if (!id || seen.has(id)) continue
        if (allowed && !allowed.includes(id)) continue
        seen.add(id)
        const label = (item.namespaceShowName ?? '').trim() || id
        items.push({
            id: nacosNamespaceTreeNodeId(connectionId, id),
            label,
            type: NACOS_NAMESPACE_NODE_TYPE,
            dbType: 'nacos',
            meta: id,
            comment: id !== label ? id : undefined,
        })
    }
    return items
}

/** Replace connection children with live namespace nodes (DBX-style sidebar). */
export async function ensureNacosNamespaceChildren(node: TreeNode): Promise<boolean> {
    if (node.type !== 'connection' || node.dbType !== 'nacos') return false
    try {
        const [result, config] = await Promise.all([
            explorerApi.fetchNacosNamespaces(node.id),
            fetchConnectionConfig(node.id),
        ])
        const allowed = readVisibleNacosNamespaces(config?.advancedConfig)
        node.children = buildNacosNamespaceTreeNodes(node.id, result.namespaces ?? [], allowed)
        return true
    } catch {
        if (!node.children?.length) {
            node.children = buildNacosNamespaceTreeNodes(node.id, [], null)
        }
        return false
    }
}

export function usesNacosNamespaceTree(dbType: string | undefined | null): boolean {
    return dbType === 'nacos'
}
