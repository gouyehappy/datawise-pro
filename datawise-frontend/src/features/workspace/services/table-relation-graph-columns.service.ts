import type {TableColumnDetail, TableRelationsResult} from '@/shared/api/types'
import type {
    TableRelationGraph,
    TableRelationGraphColumn,
    TableRelationGraphNode,
} from '@/features/workspace/services/table-relation-graph.service'
import {resolveRelationTableName} from '@/features/workspace/services/table-relations.service'

export function parseRelationColumnList(raw: string | null | undefined): string[] {
    if (!raw?.trim()) return []
    return raw
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
}

function columnKey(name: string): string {
    return name.trim().toLowerCase()
}

function highlightedColumnNamesForNode(
    node: TableRelationGraphNode,
    centerTableName: string,
    relations: TableRelationsResult,
): string[] {
    const seen = new Set<string>()
    const names: string[] = []
    const tableName = node.tableName

    const addNames = (raw: string | null | undefined) => {
        for (const name of parseRelationColumnList(raw)) {
            const key = columnKey(name)
            if (seen.has(key)) continue
            seen.add(key)
            names.push(name)
        }
    }

    for (const edge of relations.references) {
        if (tableName === centerTableName) {
            addNames(edge.sourceColumns)
        }
        if (tableName === resolveRelationTableName(edge.targetTable)) {
            addNames(edge.targetColumns)
        }
    }

    for (const edge of relations.referencedBy) {
        if (tableName === centerTableName) {
            addNames(edge.targetColumns)
        }
        if (tableName === resolveRelationTableName(edge.sourceTable)) {
            addNames(edge.sourceColumns)
        }
    }

    return names
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

function fallbackColumnsFromHighlights(
    highlightedNames: string[],
    sourceColumns: TableColumnDetail[],
): TableRelationGraphColumn[] {
    const highlightedKeys = new Set(highlightedNames.map((name) => columnKey(name)))
    const fromProperties = sourceColumns
        .filter((column) => highlightedKeys.has(columnKey(column.name)))
        .map((column) => toGraphColumn(column, highlightedKeys))
    if (fromProperties.length) return fromProperties

    return highlightedNames.map((name) => ({
        name,
        dataType: '',
        keyType: null,
        highlighted: true,
    }))
}

export function buildGraphNodeColumns(
    node: TableRelationGraphNode,
    relations: TableRelationsResult,
    propertiesColumns: TableColumnDetail[] | undefined,
): TableRelationGraphColumn[] {
    const centerTableName = resolveRelationTableName(relations.tableName || '')
    const highlightedNames = highlightedColumnNamesForNode(node, centerTableName, relations)
    const highlightedKeys = new Set(highlightedNames.map((name) => columnKey(name)))

    if (propertiesColumns?.length) {
        const columns = propertiesColumns.map((column) => toGraphColumn(column, highlightedKeys))
        if (highlightedKeys.size === 0) return columns
        return columns.sort((left, right) => {
            if (left.highlighted !== right.highlighted) {
                return left.highlighted ? -1 : 1
            }
            return left.name.localeCompare(right.name)
        })
    }

    return fallbackColumnsFromHighlights(highlightedNames, [])
}

export function enrichRelationGraphWithColumns(
    graph: TableRelationGraph,
    relations: TableRelationsResult,
    columnsByTable: ReadonlyMap<string, TableColumnDetail[]>,
): TableRelationGraph {
    return {
        ...graph,
        nodes: graph.nodes.map((node) => ({
            ...node,
            columns: buildGraphNodeColumns(node, relations, columnsByTable.get(node.tableName)),
        })),
    }
}
