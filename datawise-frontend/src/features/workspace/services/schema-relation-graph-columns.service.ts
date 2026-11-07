import type {SchemaRelationsResult, TableColumnDetail} from '@/shared/api/types'
import {parseRelationColumnList} from '@/features/workspace/services/table-relation-graph-columns.service'
import type {
    TableRelationGraph,
    TableRelationGraphColumn,
    TableRelationGraphNode,
} from '@/features/workspace/services/table-relation-graph.service'
import {resolveRelationTableName} from '@/features/workspace/services/table-relations.service'

function columnKey(name: string): string {
    return name.trim().toLowerCase()
}

function highlightedColumnKeysForSchemaNode(
    node: TableRelationGraphNode,
    schema: SchemaRelationsResult,
): Set<string> {
    const keys = new Set<string>()
    for (const edge of schema.edges) {
        if (resolveRelationTableName(edge.sourceTable) === node.tableName) {
            for (const name of parseRelationColumnList(edge.sourceColumns)) {
                keys.add(columnKey(name))
            }
        }
        if (resolveRelationTableName(edge.targetTable) === node.tableName) {
            for (const name of parseRelationColumnList(edge.targetColumns)) {
                keys.add(columnKey(name))
            }
        }
    }
    return keys
}

function toGraphColumn(
    column: TableColumnDetail,
    highlightedKeys: Set<string>,
): TableRelationGraphColumn {
    const keyType = column.keyType?.trim().toUpperCase() || null
    return {
        name: column.name,
        dataType: column.dataType,
        keyType,
        highlighted: highlightedKeys.has(columnKey(column.name)) || keyType === 'PRI',
        comment: column.comment?.trim() || undefined,
    }
}

export function buildSchemaErNodeColumns(
    node: TableRelationGraphNode,
    schema: SchemaRelationsResult,
    propertiesColumns: TableColumnDetail[] | undefined,
): TableRelationGraphColumn[] {
    const highlightedKeys = highlightedColumnKeysForSchemaNode(node, schema)
    if (!propertiesColumns?.length) return []
    return propertiesColumns.map((column) => toGraphColumn(column, highlightedKeys))
}

export function enrichSchemaErGraphWithColumns(
    graph: TableRelationGraph,
    schema: SchemaRelationsResult,
    columnsByTable: ReadonlyMap<string, TableColumnDetail[]>,
    commentsByTable: ReadonlyMap<string, string>,
): TableRelationGraph {
    return {
        ...graph,
        nodes: graph.nodes.map((node) => ({
            ...node,
            comment: commentsByTable.get(node.tableName),
            columns: buildSchemaErNodeColumns(node, schema, columnsByTable.get(node.tableName)),
        })),
    }
}
