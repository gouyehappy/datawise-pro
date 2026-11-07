import type {DbType} from '@/core/types'
import type {ExplainPlanNode} from '@/features/workspace/types/explain-plan'

const MYSQL_TABULAR_COLUMN_ORDER = [
    'id',
    'select_type',
    'table',
    'partitions',
    'type',
    'possible_keys',
    'key',
    'key_len',
    'ref',
    'rows',
    'filtered',
    'extra',
] as const

export function isTabularExplainPlan(nodes: ExplainPlanNode[], dbType?: DbType): boolean {
    if (dbType !== 'mysql' && dbType !== 'mariadb') return false
    if (!nodes.length) return false
    return nodes.every((node) => !node.children?.length && Boolean(node.metrics && Object.keys(node.metrics).length))
}

export function buildTabularExplainPlan(nodes: ExplainPlanNode[]): {
    columns: string[]
    rows: Array<Record<string, string | number>>
} {
    const columnSet = new Set<string>()
    for (const node of nodes) {
        for (const key of Object.keys(node.metrics ?? {})) {
            columnSet.add(key)
        }
    }

    const ordered = MYSQL_TABULAR_COLUMN_ORDER.filter((key) => columnSet.has(key))
    const rest = [...columnSet]
        .filter((key) => !MYSQL_TABULAR_COLUMN_ORDER.includes(key as typeof MYSQL_TABULAR_COLUMN_ORDER[number]))
        .sort()

    const candidateColumns = [...ordered, ...rest]
    const rows = nodes.map((node) => ({...(node.metrics ?? {})}))
    const columns = candidateColumns.filter((column) =>
        rows.some((row) => row[column] != null && String(row[column]).trim() !== ''),
    )

    return {columns, rows}
}

export function stripExplainPrefix(sql: string | undefined): string {
    const trimmed = sql?.trim() ?? ''
    if (!trimmed) return ''
    return trimmed.replace(/^\s*EXPLAIN(?:\s+ANALYZE|\s+QUERY\s+PLAN|\s+\([^)]*\)|\s+PLAN\s+FOR)?\s+/i, '')
}
