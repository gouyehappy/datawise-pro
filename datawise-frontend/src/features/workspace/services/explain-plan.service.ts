import type {DbType, TableColumn, TableRow} from '@/core/types'
import type {ExplainMetricPair, ExplainPlanNode} from '@/features/workspace/types/explain-plan'

const EXPLAIN_PREFIX_RE = /^\s*EXPLAIN(\s+ANALYZE|\s+QUERY\s+PLAN|\s+\([^)]*\)|\s+PLAN\s+FOR)?\b/i
const EXPLAIN_ANALYZE_PREFIX_RE = /^\s*EXPLAIN\s+(?:ANALYZE|\([^)]*\bANALYZE\b[^)]*\))/i

export function isExplainStatement(sql: string | undefined | null): boolean {
    return EXPLAIN_PREFIX_RE.test(sql?.trim() ?? '')
}

export function isExplainAnalyzeStatement(sql: string | undefined | null): boolean {
    return EXPLAIN_ANALYZE_PREFIX_RE.test(sql?.trim() ?? '')
}

export function supportsExplainAnalyze(dbType: DbType | undefined): boolean {
    switch (dbType) {
        case 'postgresql':
        case 'kingbase':
        case 'greenplum':
        case 'opengauss':
        case 'mysql':
        case 'mariadb':
            return true
        default:
            return false
    }
}

export function wrapExplainSql(
    sql: string,
    dbType: DbType | undefined,
    analyze = false,
): string {
    const trimmed = sql.trim()
    if (isExplainStatement(trimmed)) return trimmed

    switch (dbType) {
        case 'postgresql':
        case 'kingbase':
        case 'greenplum':
        case 'opengauss':
            return analyze
                ? `EXPLAIN (FORMAT JSON, ANALYZE) ${trimmed}`
                : `EXPLAIN (FORMAT JSON) ${trimmed}`
        case 'sqlite':
            return `EXPLAIN QUERY PLAN ${trimmed}`
        case 'mysql':
        case 'mariadb':
            return analyze ? `EXPLAIN ANALYZE ${trimmed}` : `EXPLAIN ${trimmed}`
        case 'sqlserver':
            return `SET SHOWPLAN_ALL ON;\n${trimmed}`
        default:
            return `EXPLAIN ${trimmed}`
    }
}

function columnKey(column: TableColumn): string {
    return columnLogicalKey(column)
}

const GENERIC_COLUMN_KEY_RE = /^c\d+$/i

function columnLogicalKey(column: TableColumn): string {
    const key = (column.key ?? '').trim()
    const name = (column.name ?? '').trim()
    if (GENERIC_COLUMN_KEY_RE.test(key) && name) {
        return name.toLowerCase()
    }
    return (key || name).toLowerCase()
}

function findColumnFieldKey(columns: TableColumn[], logicalName: string): string {
    const target = logicalName.toLowerCase()
    const column = columns.find((item) => columnLogicalKey(item) === target)
    return column?.key ?? column?.name ?? logicalName
}

function rowValue(row: TableRow, ...keys: string[]): string {
    for (const key of keys) {
        const value = row[key]
        if (value != null && String(value).trim()) return String(value)
    }
    return ''
}

function rowMetricsByColumns(
    columns: TableColumn[],
    row: TableRow,
    skipLogical: Set<string>,
): Record<string, string | number> {
    const metrics: Record<string, string | number> = {}
    for (const column of columns) {
        const logical = columnLogicalKey(column)
        if (skipLogical.has(logical)) continue
        const fieldKey = column.key ?? column.name
        const value = row[fieldKey]
        if (value == null || value === '') continue
        metrics[logical] = typeof value === 'number' ? value : String(value)
    }
    return metrics
}

function nodeMetrics(row: TableRow, skipKeys: Set<string>): Record<string, string | number> {
    const metrics: Record<string, string | number> = {}
    for (const [key, value] of Object.entries(row)) {
        if (skipKeys.has(key.toLowerCase()) || value == null || value === '') continue
        metrics[key] = typeof value === 'number' ? value : String(value)
    }
    return metrics
}

function parseSqliteExplainPlan(columns: TableColumn[], rows: TableRow[]): ExplainPlanNode[] {
    const detailKey = findColumnFieldKey(columns, 'detail')
    const idKey = findColumnFieldKey(columns, 'id')
    const parentKey = findColumnFieldKey(columns, 'parent')

    const nodes = new Map<number, ExplainPlanNode>()
    const roots: ExplainPlanNode[] = []

    rows.forEach((row, index) => {
        const id = Number(row[idKey] ?? index + 1)
        const label = rowValue(row, detailKey) || `Step ${id}`
        const node: ExplainPlanNode = {
            id: `sqlite-${id}`,
            label,
            metrics: nodeMetrics(row, new Set([detailKey, idKey, parentKey, 'notused'])),
        }
        nodes.set(id, node)
    })

    rows.forEach((row, index) => {
        const id = Number(row[idKey] ?? index + 1)
        const parentId = Number(row[parentKey] ?? 0)
        const node = nodes.get(id)
        if (!node) return
        if (!parentId || !nodes.has(parentId)) {
            roots.push(node)
            return
        }
        const parent = nodes.get(parentId)!
        parent.children = parent.children ?? []
        parent.children.push(node)
    })

    return roots.length ? roots : [...nodes.values()]
}

function parseMysqlExplainPlan(columns: TableColumn[], rows: TableRow[]): ExplainPlanNode[] {
    const tableKey = findColumnFieldKey(columns, 'table')
    const typeKey = findColumnFieldKey(columns, 'type')
    const extraKey = findColumnFieldKey(columns, 'extra')

    return rows.map((row, index) => {
        const table = rowValue(row, tableKey) || `#${index + 1}`
        const accessType = rowValue(row, typeKey)
        const extra = rowValue(row, extraKey)
        return {
            id: `mysql-${index}`,
            label: table,
            detail: [accessType, extra].filter(Boolean).join(' · ') || undefined,
            metrics: rowMetricsByColumns(columns, row, new Set()),
        }
    })
}

function parsePostgresJsonPlan(raw: string): ExplainPlanNode[] {
    try {
        const parsed = JSON.parse(raw) as Array<{ Plan?: PostgresPlanNode }>
        const plan = parsed[0]?.Plan
        if (!plan) return []
        return [convertPostgresPlanNode(plan, 'pg-0')]
    } catch {
        return []
    }
}

interface PostgresPlanNode {
    'Node Type'?: string
    'Relation Name'?: string
    'Alias'?: string
    'Startup Cost'?: number
    'Total Cost'?: number
    'Plan Rows'?: number
    'Actual Total Time'?: number
    'Actual Rows'?: number
    Plans?: PostgresPlanNode[]
}

function convertPostgresPlanNode(plan: PostgresPlanNode, id: string): ExplainPlanNode {
    const relation = plan['Relation Name']
    const alias = plan['Alias']
    const nodeType = plan['Node Type'] ?? 'Plan'
    const label = relation ? `${nodeType} · ${alias ?? relation}` : nodeType
    const metrics: Record<string, string | number> = {}
    for (const [key, value] of Object.entries(plan)) {
        if (key === 'Plans' || key === 'Node Type' || key === 'Relation Name' || key === 'Alias') continue
        if (typeof value === 'number' || typeof value === 'string') {
            metrics[key] = value
        }
    }
    const node: ExplainPlanNode = {
        id,
        label,
        metrics,
        metricPairs: buildExplainMetricPairs(metrics),
        children: plan.Plans?.map((child, index) =>
            convertPostgresPlanNode(child, `${id}-${index}`),
        ),
    }
    return node
}

const METRIC_PAIR_SPECS: Array<{
    id: ExplainMetricPair['id']
    estimateKey: string
    actualKey: string
}> = [
    {id: 'rows', estimateKey: 'Plan Rows', actualKey: 'Actual Rows'},
    {id: 'startup', estimateKey: 'Startup Cost', actualKey: 'Actual Startup Time'},
    {id: 'totalTime', estimateKey: 'Total Cost', actualKey: 'Actual Total Time'},
]

export function buildExplainMetricPairs(
    metrics?: Record<string, string | number>,
): ExplainMetricPair[] {
    if (!metrics) return []
    const pairs: ExplainMetricPair[] = []
    for (const spec of METRIC_PAIR_SPECS) {
        const estimate = metrics[spec.estimateKey]
        const actual = metrics[spec.actualKey]
        if (estimate == null || actual == null) continue
        pairs.push({
            id: spec.id,
            estimate,
            actual,
        })
    }
    return pairs
}

function attachMetricPairs(nodes: ExplainPlanNode[]): ExplainPlanNode[] {
    return nodes.map((node) => ({
        ...node,
        metricPairs: node.metricPairs?.length
            ? node.metricPairs
            : buildExplainMetricPairs(node.metrics),
        children: node.children?.length ? attachMetricPairs(node.children) : node.children,
    }))
}

function parsePostgresTextPlan(lines: string[]): ExplainPlanNode[] {
    const roots: ExplainPlanNode[] = []
    const stack: { indent: number; node: ExplainPlanNode }[] = []

    lines.forEach((line, index) => {
        const trimmed = line.replace(/\r/g, '')
        if (!trimmed.trim()) return
        const indent = trimmed.length - trimmed.trimStart().length
        const node: ExplainPlanNode = {
            id: `pg-text-${index}`,
            label: trimmed.trim(),
        }
        while (stack.length && stack[stack.length - 1].indent >= indent) {
            stack.pop()
        }
        if (!stack.length) {
            roots.push(node)
        } else {
            const parent = stack[stack.length - 1].node
            parent.children = parent.children ?? []
            parent.children.push(node)
        }
        stack.push({indent, node})
    })

    return roots
}

function parseGenericExplainPlan(columns: TableColumn[], rows: TableRow[]): ExplainPlanNode[] {
    const primaryLogical = columns[0] ? columnLogicalKey(columns[0]) : 'col0'
    const primaryKey = columns[0] ? findColumnFieldKey(columns, primaryLogical) : 'col0'
    return rows.map((row, index) => ({
        id: `generic-${index}`,
        label: rowValue(row, primaryKey) || `Row ${index + 1}`,
        metrics: rowMetricsByColumns(columns, row, new Set([primaryLogical])),
    }))
}

export function parseExplainPlanResult(
    columns: TableColumn[],
    rows: TableRow[],
    dbType?: DbType,
): ExplainPlanNode[] {
    if (!rows.length) return []

    const normalizedColumns = columns.map((column) => columnKey(column))
    if (normalizedColumns.includes('detail') && normalizedColumns.includes('parent')) {
        return finalizeExplainPlan(parseSqliteExplainPlan(columns, rows))
    }
    if (normalizedColumns.includes('table') && (normalizedColumns.includes('select_type') || normalizedColumns.includes('type'))) {
        return finalizeExplainPlan(parseMysqlExplainPlan(columns, rows))
    }

    const planColumn = columns.find((column) => {
        const key = columnKey(column)
        return key === 'query plan' || key === 'plan'
    })
    if (planColumn) {
        const key = planColumn.key ?? planColumn.name
        const first = rows[0]?.[key]
        const text = rows
            .map((row) => row[key])
            .filter((value) => value != null && String(value).trim())
            .map((value) => String(value))
            .join('\n')

        if (dbType === 'postgresql' || dbType === 'kingbase' || dbType === 'greenplum' || dbType === 'opengauss' || text.trimStart().startsWith('[')) {
            const jsonPlan = parsePostgresJsonPlan(text)
            if (jsonPlan.length) return finalizeExplainPlan(jsonPlan)
        }
        const textLines = text.split('\n').filter((line) => line.trim())
        if (textLines.length) return finalizeExplainPlan(parsePostgresTextPlan(textLines))
        if (first != null) {
            return finalizeExplainPlan([{id: 'plan-0', label: String(first)}])
        }
    }

    return finalizeExplainPlan(parseGenericExplainPlan(columns, rows))
}

function finalizeExplainPlan(nodes: ExplainPlanNode[]): ExplainPlanNode[] {
    return attachMetricPairs(nodes)
}
