import type {TreeNode, WorkspaceTab} from '@/core/types'
import {resolveConnectionId} from '@/core/utils/tree'
import {
    isProductionEnvironment,
    normalizeConnectionEnvironment,
} from '@/features/connection/services/connection-environment.service'

/** Collect connection ids referenced by a workspace tab. */
export function resolveWorkspaceTabConnectionIds(tab: WorkspaceTab, tree: TreeNode[]): string[] {
    const ids = new Set<string>()
    if (tab.connectionId) ids.add(tab.connectionId)
    if (tab.explorerNodeId) {
        const resolved = resolveConnectionId(tree, tab.explorerNodeId)
        if (resolved) ids.add(resolved)
    }
    if (tab.schemaCompareLeft?.connectionId) ids.add(tab.schemaCompareLeft.connectionId)
    if (tab.schemaCompareRight?.connectionId) ids.add(tab.schemaCompareRight.connectionId)
    if (tab.crossEnvCompareLeft?.connectionId) ids.add(tab.crossEnvCompareLeft.connectionId)
    if (tab.crossEnvCompareRight?.connectionId) ids.add(tab.crossEnvCompareRight.connectionId)
    if (tab.migrationSource?.connectionId) ids.add(tab.migrationSource.connectionId)
    return [...ids]
}

export function findProductionConnectionsForTab(
    tab: WorkspaceTab | null | undefined,
    tree: TreeNode[],
    findNode: (nodeId: string) => TreeNode | null,
): TreeNode[] {
    if (!tab) return []
    const prodConnections: TreeNode[] = []
    for (const connectionId of resolveWorkspaceTabConnectionIds(tab, tree)) {
        const node = findNode(connectionId)
        if (node?.type === 'connection' && isProductionEnvironment(node.env, node.envCustom)) {
            prodConnections.push(node)
        }
    }
    return prodConnections
}

export function isWorkspaceTabProduction(
    tab: WorkspaceTab | null | undefined,
    tree: TreeNode[],
    findNode: (nodeId: string) => TreeNode | null,
): boolean {
    return findProductionConnectionsForTab(tab, tree, findNode).length > 0
}

export function resolveProductionConnectionLabel(
    node: TreeNode,
    translate?: (key: string) => string,
): string {
    const normalized = normalizeConnectionEnvironment(node.env, node.envCustom)
    if (normalized.env === 'custom' && normalized.envCustom) {
        return `${node.label} (${normalized.envCustom})`
    }
    const envLabel = translate
        ? translate(`connection.envOptions.${normalized.env}`)
        : normalized.env
    return `${node.label} (${envLabel})`
}
