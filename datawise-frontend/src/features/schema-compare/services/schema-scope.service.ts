import type {TreeNode} from '@/core/types'
import {findAncestorByType} from '@/core/utils/tree'
import {resolveConnectionId} from '@/core/utils/tree'
import type {SchemaScope} from '@/features/schema-compare/types/schema-compare.types'

export function resolveSchemaScopeFromDatabaseNode(
    tree: TreeNode[],
    node: TreeNode,
): SchemaScope | null {
    if (node.type !== 'database') return null
    const connectionNode = findAncestorByType(tree, node.id, 'connection')
    const connectionId = resolveConnectionId(tree, node.id)
    if (!connectionNode || !connectionId) return null
    return {
        connectionId,
        database: node.label,
        connectionLabel: connectionNode.label,
        dbType: connectionNode.dbType ?? 'mysql',
    }
}

export function scopeKey(scope: SchemaScope | null | undefined): string {
    if (!scope) return ''
    return `${scope.connectionId}:${scope.database}`
}

export function scopesEqual(a: SchemaScope | null | undefined, b: SchemaScope | null | undefined): boolean {
    return scopeKey(a) === scopeKey(b) && scopeKey(a) !== ''
}
