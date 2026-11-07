import {parseRelationColumnList} from '@/features/workspace/services/table-relation-graph-columns.service'
import {resolveRelationTableName} from '@/features/workspace/services/table-relations.service'
import type {SchemaRelationsResult, TableRelationEdge} from '@/shared/api/types'
import type {
    RelationGraphPoint,
    TableRelationGraph,
    TableRelationGraphEdge,
    TableRelationGraphNode,
} from '@/features/workspace/services/table-relation-graph.service'
import {
    relationGraphEdgePath,
    relationGraphNodeHeight,
    RELATION_GRAPH_HEADER_HEIGHT,
    RELATION_GRAPH_NODE_PADDING,
    RELATION_GRAPH_NODE_WIDTH,
    RELATION_GRAPH_ROW_HEIGHT,
} from '@/features/workspace/services/table-relation-graph.service'

export const SCHEMA_ER_NODE_WIDTH = RELATION_GRAPH_NODE_WIDTH
export const SCHEMA_ER_MAX_ROWS = 32

export function schemaErNodeHeight(node: Pick<TableRelationGraphNode, 'columns'>): number {
    const rows = Math.min(node.columns.length || 1, SCHEMA_ER_MAX_ROWS)
    const extra = node.columns.length > SCHEMA_ER_MAX_ROWS ? RELATION_GRAPH_ROW_HEIGHT : 0
    return RELATION_GRAPH_HEADER_HEIGHT + rows * RELATION_GRAPH_ROW_HEIGHT + RELATION_GRAPH_NODE_PADDING + extra
}

function nodeIdForTable(tableName: string): string {
    return `table:${tableName}`
}

function upsertNode(
    nodes: Map<string, TableRelationGraphNode>,
    tableName: string,
    qualifiedName: string,
    role: TableRelationGraphNode['role'],
) {
    const bare = resolveRelationTableName(tableName)
    if (!bare) return
    const id = nodeIdForTable(bare)
    const existing = nodes.get(id)
    if (!existing) {
        nodes.set(id, {id, tableName: bare, qualifiedName, role, columns: []})
        return
    }
    if (existing.role === 'center') return
    if (role === 'center') {
        nodes.set(id, {...existing, role: 'center', qualifiedName})
    }
}

/** 由 schema 外键结果构建全库 ER 图。 */
export function buildSchemaRelationGraph(
    schema: SchemaRelationsResult,
    focusTableName?: string,
): TableRelationGraph {
    const focus = resolveRelationTableName(focusTableName || '')
    const nodeMap = new Map<string, TableRelationGraphNode>()
    const edges: TableRelationGraphEdge[] = []

    for (const table of schema.tables) {
        const bare = resolveRelationTableName(table)
        if (!bare) continue
        upsertNode(nodeMap, bare, table, bare === focus ? 'center' : 'reference')
    }

    for (const edge of schema.edges) {
        const source = resolveRelationTableName(edge.sourceTable)
        const target = resolveRelationTableName(edge.targetTable)
        if (!source || !target) continue
        upsertNode(nodeMap, source, edge.sourceTable, source === focus ? 'center' : 'referrer')
        upsertNode(nodeMap, target, edge.targetTable, target === focus ? 'center' : 'reference')
        edges.push(mapSchemaEdge(edge, source, target))
    }

    return {
        centerTableName: focus,
        nodes: [...nodeMap.values()],
        edges,
    }
}

function mapSchemaEdge(
    edge: TableRelationEdge,
    source: string,
    target: string,
): TableRelationGraphEdge {
    return {
        id: `fk:${edge.constraintName}:${source}:${target}:${edge.sourceColumns}`,
        fromNodeId: nodeIdForTable(source),
        toNodeId: nodeIdForTable(target),
        sourceColumn: parseRelationColumnList(edge.sourceColumns)[0] ?? '',
        targetColumn: parseRelationColumnList(edge.targetColumns)[0] ?? '',
        constraintName: edge.constraintName,
        label: `${edge.sourceColumns} → ${edge.targetColumns || '?'}`,
        direction: 'outgoing',
    }
}

function nodeBlockHeight(node: TableRelationGraphNode): number {
    return node.columns.length ? schemaErNodeHeight(node) : relationGraphNodeHeight(node)
}

export function layoutSchemaRelationGraphPositions(
    graph: TableRelationGraph,
): {positions: Record<string, RelationGraphPoint>; width: number; height: number} {
    const layerGapX = 280
    const nodeGapY = 28
    const padding = 56
    const isolatedGapX = 24
    const isolatedGapY = 24
    const positions: Record<string, RelationGraphPoint> = {}

    const connectedIds = new Set<string>()
    for (const edge of graph.edges) {
        connectedIds.add(edge.fromNodeId)
        connectedIds.add(edge.toNodeId)
    }

    const connectedNodes = graph.nodes.filter((node) => connectedIds.has(node.id))
    const isolatedNodes = graph.nodes
        .filter((node) => !connectedIds.has(node.id))
        .sort((a, b) => a.tableName.localeCompare(b.tableName, undefined, {sensitivity: 'base'}))

    const layerById = assignSchemaErLayers(connectedNodes, graph.edges)
    const layers = new Map<number, TableRelationGraphNode[]>()
    for (const node of connectedNodes) {
        const layer = layerById.get(node.id) ?? 0
        const bucket = layers.get(layer) ?? []
        bucket.push(node)
        layers.set(layer, bucket)
    }

    for (const bucket of layers.values()) {
        bucket.sort((a, b) => a.tableName.localeCompare(b.tableName, undefined, {sensitivity: 'base'}))
    }

    const layerIndexes = [...layers.keys()].sort((a, b) => a - b)
    let maxLayerHeight = padding

    for (const layerIndex of layerIndexes) {
        const nodes = layers.get(layerIndex) ?? []
        let y = padding
        for (const node of nodes) {
            positions[node.id] = {
                x: padding + layerIndex * (SCHEMA_ER_NODE_WIDTH + layerGapX),
                y,
            }
            y += nodeBlockHeight(node) + nodeGapY
        }
        maxLayerHeight = Math.max(maxLayerHeight, y)
    }

    const connectedWidth = layerIndexes.length
        ? padding * 2
            + layerIndexes.length * SCHEMA_ER_NODE_WIDTH
            + Math.max(0, layerIndexes.length - 1) * layerGapX
        : padding * 2

    const isolatedTop = maxLayerHeight + (connectedNodes.length && isolatedNodes.length ? 72 : 0)
    if (isolatedNodes.length) {
        const isolatedCols = Math.max(1, Math.min(6, Math.ceil(Math.sqrt(isolatedNodes.length))))
        const colHeights = new Array(isolatedCols).fill(isolatedTop)
        isolatedNodes.forEach((node, index) => {
            const col = index % isolatedCols
            positions[node.id] = {
                x: padding + col * (SCHEMA_ER_NODE_WIDTH + isolatedGapX),
                y: colHeights[col],
            }
            colHeights[col] += nodeBlockHeight(node) + isolatedGapY
        })
    }

    const maxBottom = graph.nodes.reduce((max, node) => {
        const pos = positions[node.id]
        if (!pos) return max
        return Math.max(max, pos.y + nodeBlockHeight(node))
    }, padding)

    return {
        positions,
        width: Math.max(connectedWidth, padding * 2 + SCHEMA_ER_NODE_WIDTH, 1200),
        height: Math.max(maxBottom + padding, 720),
    }
}

function assignSchemaErLayers(
    nodes: TableRelationGraphNode[],
    edges: TableRelationGraphEdge[],
): Map<string, number> {
    const layers = new Map<string, number>()
    for (const node of nodes) {
        layers.set(node.id, 0)
    }
    if (!nodes.length || !edges.length) {
        return layers
    }

    for (let pass = 0; pass < nodes.length; pass++) {
        for (const edge of edges) {
            const next = (layers.get(edge.fromNodeId) ?? 0) + 1
            if (next > (layers.get(edge.toNodeId) ?? 0)) {
                layers.set(edge.toNodeId, next)
            }
        }
    }
    return layers
}

export function schemaErEdgePath(start: RelationGraphPoint, end: RelationGraphPoint): string {
    return relationGraphEdgePath(start, end)
}

export function hasSchemaErGraphContent(graph: TableRelationGraph): boolean {
    return graph.nodes.length > 0
}

export function schemaErHiddenColumnCount(node: TableRelationGraphNode): number {
    return Math.max(0, node.columns.length - SCHEMA_ER_MAX_ROWS)
}

export function schemaErVisibleColumns(node: TableRelationGraphNode) {
    if (!node.columns.length) {
        return [{name: '—', dataType: '', keyType: null, highlighted: false}]
    }
    return node.columns.slice(0, SCHEMA_ER_MAX_ROWS)
}

export function schemaErNodeTitle(node: TableRelationGraphNode): string {
    const comment = node.comment?.trim()
    if (!comment) return node.tableName
    const short = comment.length > 18 ? `${comment.slice(0, 18)}…` : comment
    return `${node.tableName} (${short})`
}

/** @deprecated use schemaErNodeHeight */
export const SCHEMA_ER_NODE_HEIGHT = RELATION_GRAPH_HEADER_HEIGHT + RELATION_GRAPH_NODE_PADDING
