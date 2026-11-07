import type {TableRelationEdge} from '@/shared/api/types'

/** 从 JDBC 元数据表名解析裸表名（去 schema/catalog 前缀）。 */
export function resolveRelationTableName(qualifiedName: string): string {
    const trimmed = qualifiedName.trim()
    if (!trimmed) return trimmed
    const segments = trimmed.split('.')
    return segments[segments.length - 1] ?? trimmed
}

export function resolveRelatedTableName(
    edge: TableRelationEdge,
    direction: 'references' | 'referencedBy',
): string {
    const qualified = direction === 'references' ? edge.targetTable : edge.sourceTable
    return resolveRelationTableName(qualified)
}
