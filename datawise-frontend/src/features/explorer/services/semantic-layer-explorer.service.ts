import type {ExplorerInfoListItem, TreeNode} from '@/core/types'
import {findAncestorByType} from '@/core/utils/tree'
import type {SemanticMetric} from '@/features/platform/types/platform.types'

export interface SemanticExplorerIndex {
    byTable: Map<string, SemanticMetric[]>
    byColumn: Map<string, SemanticMetric[]>
    all: SemanticMetric[]
}

export function semanticScopeKey(connectionId: string, database: string): string {
    return `${connectionId}:${database}`
}

function parseColumnRef(name: string): {table?: string; column?: string} {
    const trimmed = name.trim()
    const dot = trimmed.lastIndexOf('.')
    if (dot <= 0 || dot >= trimmed.length - 1) return {}
    return {table: trimmed.slice(0, dot), column: trimmed.slice(dot + 1)}
}

function pushMetric(map: Map<string, SemanticMetric[]>, key: string, metric: SemanticMetric) {
    const normalized = key.toLowerCase()
    const bucket = map.get(normalized)
    if (bucket) {
        bucket.push(metric)
    } else {
        map.set(normalized, [metric])
    }
}

/** 将语义层指标索引为表 / 列维度，供 Explorer 树与 Info 面板查询 */
export function buildSemanticExplorerIndex(metrics: SemanticMetric[]): SemanticExplorerIndex {
    const byTable = new Map<string, SemanticMetric[]>()
    const byColumn = new Map<string, SemanticMetric[]>()

    for (const metric of metrics) {
        for (const table of metric.relatedTables ?? []) {
            if (table.trim()) pushMetric(byTable, table.trim(), metric)
        }
        const ref = parseColumnRef(metric.name)
        if (ref.table && ref.column) {
            pushMetric(byColumn, `${ref.table}.${ref.column}`, metric)
        }
    }

    return {byTable, byColumn, all: metrics}
}

function truncateHint(text: string, max = 48): string {
    const trimmed = text.trim()
    if (trimmed.length <= max) return trimmed
    return `${trimmed.slice(0, max - 1)}…`
}

function metricHint(metric: SemanticMetric): string {
    if (metric.description?.trim()) return truncateHint(metric.description)
    if (metric.expression?.trim()) return truncateHint(metric.expression)
    return truncateHint(metric.name)
}

function tableMetrics(index: SemanticExplorerIndex, tableName: string): SemanticMetric[] {
    return index.byTable.get(tableName.toLowerCase()) ?? []
}

function columnMetrics(index: SemanticExplorerIndex, tableName: string, columnName: string): SemanticMetric[] {
    return index.byColumn.get(`${tableName}.${columnName}`.toLowerCase()) ?? []
}

function mapMetricItems(metrics: SemanticMetric[]): ExplorerInfoListItem[] {
    return metrics.map((metric) => ({
        name: metric.name,
        meta: [metric.unit, metric.expression].filter(Boolean).join(' · ') || undefined,
        comment: metric.description ?? undefined,
    }))
}

/** 连接树节点旁的语义 hint（短描述） */
export function resolveSemanticHintForNode(
    node: TreeNode,
    tree: TreeNode[],
    index: SemanticExplorerIndex | null | undefined,
): string | null {
    if (!index?.all.length) return null

    if (node.type === 'table' || node.type === 'view') {
        const metrics = tableMetrics(index, node.label)
        const tableLevel = metrics.find((m) => m.name.includes('表') || m.name.toLowerCase() === node.label.toLowerCase())
        const primary = tableLevel ?? metrics[0]
        return primary ? metricHint(primary) : null
    }

    if (node.type === 'column' || node.type === 'primary_key') {
        const table = findAncestorByType(tree, node.id, 'table')
        if (!table) return null
        const metrics = columnMetrics(index, table.label, node.label)
        return metrics[0] ? metricHint(metrics[0]) : null
    }

    return null
}

/** Info 面板语义层区块 */
export function resolveSemanticItemsForNode(
    node: TreeNode,
    tree: TreeNode[],
    index: SemanticExplorerIndex | null | undefined,
): ExplorerInfoListItem[] {
    if (!index?.all.length) return []

    if (node.type === 'database') {
        return mapMetricItems(index.all.slice(0, 50))
    }

    if (node.type === 'table' || node.type === 'view') {
        return mapMetricItems(tableMetrics(index, node.label))
    }

    if (node.type === 'column' || node.type === 'primary_key') {
        const table = findAncestorByType(tree, node.id, 'table')
        if (!table) return []
        return mapMetricItems(columnMetrics(index, table.label, node.label))
    }

    return []
}
