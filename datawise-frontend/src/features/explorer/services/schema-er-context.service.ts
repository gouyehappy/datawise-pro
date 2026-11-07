import type {TreeNode} from '@/core/types'
import {findAncestorByType, findDatabaseLabel} from '@/core/utils/tree'
import {isCatalogSchemaDbType} from '@/shared/db-type-families'

export interface ExplorerSchemaErContext {
    connectionId: string
    database: string
    instanceId?: string
    explorerNodeId: string
}

export function resolveExplorerSchemaErContext(
    tree: TreeNode[],
    node: TreeNode,
): ExplorerSchemaErContext | null {
    if (node.type !== 'folder' || node.label !== 'tables') return null

    const connection = findAncestorByType(tree, node.id, 'connection')
    const connectionId = connection?.id
    if (!connectionId) return null

    const catalogNode = findAncestorByType(tree, node.id, 'database')
    const schemaNode = findAncestorByType(tree, node.id, 'schema')
    const dbType = connection.dbType

    let database = catalogNode?.label ?? findDatabaseLabel(tree, node.id)
    if (isCatalogSchemaDbType(dbType) && catalogNode && schemaNode) {
        database = `${catalogNode.label}.${schemaNode.label}`
    }
    if (!database?.trim()) return null

    return {
        connectionId,
        database: database.trim(),
        instanceId: catalogNode?.id ?? schemaNode?.id,
        explorerNodeId: node.id,
    }
}
