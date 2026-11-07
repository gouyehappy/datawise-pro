import type {TableRelationsResult} from '@/shared/api/types'
import {parseRelationColumnList} from '@/features/workspace/services/table-relation-graph-columns.service'
import {resolveRelationTableName} from '@/features/workspace/services/table-relations.service'

export type TableRelationGraphNodeRole = 'center' | 'reference' | 'referrer'

export interface TableRelationGraphColumn {
    name: string
    dataType: string
    keyType: string | null
    highlighted: boolean
    comment?: string
}

export interface TableRelationGraphNode {
    id: string
    tableName: string
    qualifiedName: string
    role: TableRelationGraphNodeRole
    columns: TableRelationGraphColumn[]
    comment?: string
}

export interface TableRelationGraphEdge {
    id: string
    fromNodeId: string
    toNodeId: string
    sourceColumn: string
    targetColumn: string
    constraintName: string
    label: string
    direction: 'outgoing' | 'incoming'
}

export interface TableRelationGraph {
    centerTableName: string
    nodes: TableRelationGraphNode[]
    edges: TableRelationGraphEdge[]
}

export const RELATION_GRAPH_NODE_WIDTH = 208
export const RELATION_GRAPH_HEADER_HEIGHT = 32
export const RELATION_GRAPH_ROW_HEIGHT = 20
export const RELATION_GRAPH_MAX_ROWS = 14
export const RELATION_GRAPH_NODE_PADDING = 4

/** @deprecated use relationGraphNodeHeight */
export const RELATION_GRAPH_NODE_HEIGHT = 48

export interface RelationGraphPoint {
    x: number
    y: number
}

function nodeIdForTable(tableName: string): string {
    return `table:${tableName}`
}

function upsertNode(
    nodes: Map<string, TableRelationGraphNode>,
    tableName: string,
    qualifiedName: string,
    role: TableRelationGraphNodeRole,
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

/** 由关系结果构建当前表邻域图（中心 + 引用/被引用表）。 */
export function buildTableRelationGraph(relations: TableRelationsResult): TableRelationGraph {
    const centerName = resolveRelationTableName(relations.tableName || '')
    const nodeMap = new Map<string, TableRelationGraphNode>()
    const edges: TableRelationGraphEdge[] = []

    if (centerName) {
        upsertNode(nodeMap, centerName, relations.tableName || centerName, 'center')
    }

    for (const edge of relations.references) {
        const target = resolveRelationTableName(edge.targetTable)
        if (!centerName || !target) continue
        upsertNode(nodeMap, target, edge.targetTable, 'reference')
        edges.push({
            id: `out:${edge.constraintName}:${edge.sourceColumns}:${edge.targetTable}`,
            fromNodeId: nodeIdForTable(centerName),
            toNodeId: nodeIdForTable(target),
            sourceColumn: parseRelationColumnList(edge.sourceColumns)[0] ?? '',
            targetColumn: parseRelationColumnList(edge.targetColumns)[0] ?? '',
            constraintName: edge.constraintName,
            label: `${edge.sourceColumns} → ${edge.targetColumns || '?'}`,
            direction: 'outgoing',
        })
    }

    for (const edge of relations.referencedBy) {
        const source = resolveRelationTableName(edge.sourceTable)
        if (!centerName || !source) continue
        upsertNode(nodeMap, source, edge.sourceTable, 'referrer')
        edges.push({
            id: `in:${edge.constraintName}:${edge.sourceTable}:${edge.targetColumns}`,
            fromNodeId: nodeIdForTable(source),
            toNodeId: nodeIdForTable(centerName),
            sourceColumn: parseRelationColumnList(edge.sourceColumns)[0] ?? '',
            targetColumn: parseRelationColumnList(edge.targetColumns)[0] ?? '',
            constraintName: edge.constraintName,
            label: `${edge.sourceColumns} → ${edge.targetColumns || '?'}`,
            direction: 'incoming',
        })
    }

    return {
        centerTableName: centerName,
        nodes: [...nodeMap.values()],
        edges,
    }
}

export function relationGraphVisibleRowCount(columnCount: number): number {
    if (columnCount <= 0) return 1
    return Math.min(columnCount, RELATION_GRAPH_MAX_ROWS)
}

export function relationGraphNodeHeight(node: Pick<TableRelationGraphNode, 'columns'>): number {
    const rows = relationGraphVisibleRowCount(node.columns.length)
    return RELATION_GRAPH_HEADER_HEIGHT + rows * RELATION_GRAPH_ROW_HEIGHT + RELATION_GRAPH_NODE_PADDING
}

function placeOnArc(
    centerX: number,
    centerY: number,
    radius: number,
    angleRad: number,
): RelationGraphPoint {
    return {
        x: centerX + radius * Math.cos(angleRad),
        y: centerY + radius * Math.sin(angleRad),
    }
}

function spreadAngles(count: number, startDeg: number, endDeg: number): number[] {
    if (count <= 0) return []
    if (count === 1) return [(startDeg + endDeg) / 2]
    const step = (endDeg - startDeg) / (count - 1)
    return Array.from({length: count}, (_, index) => startDeg + step * index)
}

/** 初始布局：中心表居中，引用表在上弧、被引用表在下弧。 */
export function layoutInitialRelationGraphPositions(
    graph: TableRelationGraph,
    width: number,
    height: number,
): Record<string, RelationGraphPoint> {
    const centerX = width / 2
    const centerY = height / 2
    const radius = Math.min(width, height) * 0.36
    const positions: Record<string, RelationGraphPoint> = {}

    const references = graph.nodes.filter((node) => node.role === 'reference')
    const referrers = graph.nodes.filter((node) => node.role === 'referrer')

    for (const node of graph.nodes) {
        if (node.role === 'center') {
            const nodeHeight = relationGraphNodeHeight(node)
            positions[node.id] = {
                x: centerX - RELATION_GRAPH_NODE_WIDTH / 2,
                y: centerY - nodeHeight / 2,
            }
        }
    }

    spreadAngles(references.length, -160, -20).forEach((deg, index) => {
        const node = references[index]
        if (!node) return
        const nodeHeight = relationGraphNodeHeight(node)
        const anchor = placeOnArc(centerX, centerY, radius, (deg * Math.PI) / 180)
        positions[node.id] = {
            x: anchor.x - RELATION_GRAPH_NODE_WIDTH / 2,
            y: anchor.y - nodeHeight / 2,
        }
    })

    spreadAngles(referrers.length, 20, 160).forEach((deg, index) => {
        const node = referrers[index]
        if (!node) return
        const nodeHeight = relationGraphNodeHeight(node)
        const anchor = placeOnArc(centerX, centerY, radius, (deg * Math.PI) / 180)
        positions[node.id] = {
            x: anchor.x - RELATION_GRAPH_NODE_WIDTH / 2,
            y: anchor.y - nodeHeight / 2,
        }
    })

    return positions
}

export function relationGraphNodeCenter(
    position: RelationGraphPoint,
    node: Pick<TableRelationGraphNode, 'columns'>,
): RelationGraphPoint {
    return {
        x: position.x + RELATION_GRAPH_NODE_WIDTH / 2,
        y: position.y + relationGraphNodeHeight(node) / 2,
    }
}

export function hasRelationGraphNeighborhood(graph: TableRelationGraph): boolean {
    return graph.edges.length > 0
}

export function relationGraphHiddenColumnCount(node: TableRelationGraphNode): number {
    return Math.max(0, node.columns.length - RELATION_GRAPH_MAX_ROWS)
}

function columnKey(name: string): string {
    return name.trim().toLowerCase()
}

export function relationGraphColumnRowIndex(
    node: Pick<TableRelationGraphNode, 'columns'>,
    columnName: string,
): number {
    if (!columnName.trim()) return 0
    const key = columnKey(columnName)
    const visibleCount = relationGraphVisibleRowCount(node.columns.length)
    const visible = node.columns.slice(0, visibleCount)
    const index = visible.findIndex((column) => columnKey(column.name) === key)
    return index >= 0 ? index : 0
}

/** 字段行锚点（连线起止点，位于节点左/右边缘）。 */
export function relationGraphColumnAnchor(
    position: RelationGraphPoint,
    node: Pick<TableRelationGraphNode, 'columns'>,
    columnName: string,
    side: 'left' | 'right',
): RelationGraphPoint {
    const rowIndex = relationGraphColumnRowIndex(node, columnName)
    const y = position.y
        + RELATION_GRAPH_HEADER_HEIGHT
        + rowIndex * RELATION_GRAPH_ROW_HEIGHT
        + RELATION_GRAPH_ROW_HEIGHT / 2
    return {
        x: side === 'right' ? position.x + RELATION_GRAPH_NODE_WIDTH : position.x,
        y,
    }
}

/** 两列锚点之间的平滑连线路径。 */
export function relationGraphEdgePath(start: RelationGraphPoint, end: RelationGraphPoint): string {
    const dx = end.x - start.x
    const bend = Math.max(48, Math.min(120, Math.abs(dx) * 0.42))
    const c1x = start.x + (dx >= 0 ? bend : -bend)
    const c2x = end.x - (dx >= 0 ? bend : -bend)
    return `M ${start.x} ${start.y} C ${c1x} ${start.y}, ${c2x} ${end.y}, ${end.x} ${end.y}`
}

export function relationGraphEdgeAnchors(
    edge: Pick<TableRelationGraphEdge, 'fromNodeId' | 'toNodeId' | 'sourceColumn' | 'targetColumn'>,
    fromPosition: RelationGraphPoint,
    fromNode: Pick<TableRelationGraphNode, 'columns'>,
    toPosition: RelationGraphPoint,
    toNode: Pick<TableRelationGraphNode, 'columns'>,
): {start: RelationGraphPoint; end: RelationGraphPoint} {
    const fromCenterX = fromPosition.x + RELATION_GRAPH_NODE_WIDTH / 2
    const toCenterX = toPosition.x + RELATION_GRAPH_NODE_WIDTH / 2
    const fromSide: 'left' | 'right' = fromCenterX <= toCenterX ? 'right' : 'left'
    const toSide: 'left' | 'right' = fromCenterX <= toCenterX ? 'left' : 'right'
    return {
        start: relationGraphColumnAnchor(fromPosition, fromNode, edge.sourceColumn, fromSide),
        end: relationGraphColumnAnchor(toPosition, toNode, edge.targetColumn, toSide),
    }
}
