import type {TreeNode} from '@/core/types'
import {findAncestorByType, findParentConnectionId, findParentNode} from '@/core/utils/tree'
import {
    formatExplorerDatabaseScope,
} from '@/features/explorer/services/explorer-database-scope'
import {isTablesFolderNode} from '@/features/explorer/services/explorer-menu-intents.service'
import {resolveTableContext} from '@/features/explorer/services/table-context-actions.service'

export type ExplorerTablesRefreshScope = {
    connectionId: string
    scopeLabel: string
    scopeNodeId: string
}

/**
 * Resolve connection + schema/database scope for refreshing a table or tables folder.
 * Returns null when the tree context is incomplete (caller shows context-missing toast).
 */
export function resolveTablesRefreshScope(
    tree: TreeNode[],
    node: TreeNode,
): ExplorerTablesRefreshScope | null {
    const connectionId = findParentConnectionId(tree, node.id) ?? undefined
    if (!connectionId) return null

    if (node.type === 'table') {
        const ctx = resolveTableContext(tree, node)
        const schemaNode = findAncestorByType(tree, node.id, 'schema')
        const databaseNode = findAncestorByType(tree, node.id, 'database')
        const scopeLabel = ctx?.database
        const scopeNodeId = schemaNode?.id ?? databaseNode?.id
        if (!scopeLabel || !scopeNodeId) return null
        return {connectionId, scopeLabel, scopeNodeId}
    }

    if (isTablesFolderNode(node)) {
        const parent = findParentNode(tree, node.id)
        if (parent?.type === 'schema') {
            const catalogNode = findAncestorByType(tree, parent.id, 'database')
            const connection = findAncestorByType(tree, node.id, 'connection')
            const scopeLabel = catalogNode
                ? formatExplorerDatabaseScope(connection?.dbType, catalogNode.label, parent.label)
                : parent.label
            return {
                connectionId,
                scopeLabel,
                scopeNodeId: parent.id,
            }
        }
        if (parent?.type === 'database') {
            return {
                connectionId,
                scopeLabel: parent.label,
                scopeNodeId: parent.id,
            }
        }
    }

    return null
}
