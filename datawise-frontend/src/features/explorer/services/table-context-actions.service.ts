import type {DbType, TreeNode} from '@/core/types'
import {findAncestorByType, findDatabaseLabel} from '@/core/utils/tree'
import type {TableColumn, TableRow} from '@/core/types'
import {
    buildQualifiedTableName as buildDialectQualifiedTableName,
    quoteSqlIdentifier,
} from '@/features/connection/services/sql-dialect.service'
import {downloadGridExport} from '@/features/workspace/services/grid-export.service'
import {isXlsxFileName, parseXlsxBuffer} from '@/features/workspace/services/grid-xlsx.service'
import {isCatalogSchemaDbType} from '@/shared/db-type-families'

export interface TableContext {
    connectionId: string
    database: string
    tableName: string
    nodeId: string
    dbType?: DbType
}

export function resolveTableContext(tree: TreeNode[], node: TreeNode): TableContext | null {
    if (node.type !== 'table' && node.type !== 'view') return null
    const connection = findAncestorByType(tree, node.id, 'connection')
    const connectionId = connection?.id
    const catalogNode = findAncestorByType(tree, node.id, 'database')
    const schemaNode = findAncestorByType(tree, node.id, 'schema')
    const dbType = connection?.dbType ?? node.dbType
    let database =
        catalogNode?.label ??
        findDatabaseLabel(tree, node.id)
    if (isCatalogSchemaDbType(dbType) && catalogNode && schemaNode) {
        database = `${catalogNode.label}.${schemaNode.label}`
    }
    if (!connectionId || !database) return null
    return {
        connectionId,
        database,
        tableName: node.label,
        nodeId: node.id,
        dbType,
    }
}

export type OpenTableWorkspaceArgs = {
    tableName: string
    connectionId: string
    catalogNodeId?: string
    database: string
    nodeId: string
    tableView?: 'properties' | 'data' | 'ddl'
    objectType: 'view' | 'table'
}

/** Pure args for workspace.openTable from an explorer table/view node. */
export function resolveOpenTableWorkspaceArgs(
    tree: TreeNode[],
    node: TreeNode,
    tableView?: 'properties' | 'data' | 'ddl',
): OpenTableWorkspaceArgs | null {
    const ctx = resolveTableContext(tree, node)
    if (!ctx) return null
    const catalogNode = findAncestorByType(tree, node.id, 'database')
    return {
        tableName: ctx.tableName,
        connectionId: ctx.connectionId,
        catalogNodeId: catalogNode?.id,
        database: ctx.database,
        nodeId: ctx.nodeId,
        tableView,
        objectType: node.type === 'view' ? 'view' : 'table',
    }
}

export type TableDataIoMessageKind =
    | 'contextMissing'
    | 'exportEmpty'
    | 'exportSuccess'
    | 'exportFailed'
    | 'importCancelled'
    | 'importEmpty'
    | 'importSuccess'
    | 'importFailed'

/** i18n keys for table CSV/XLSX export & import toasts. */
export function resolveTableDataIoMessageKey(kind: TableDataIoMessageKind): string {
    if (kind === 'contextMissing') return 'explorer.tableActionContextMissing'
    if (kind === 'exportEmpty') return 'explorer.exportDataEmpty'
    if (kind === 'exportSuccess') return 'explorer.exportDataSuccess'
    if (kind === 'exportFailed') return 'explorer.exportDataFailed'
    if (kind === 'importCancelled') return 'explorer.importDataCancelled'
    if (kind === 'importEmpty') return 'explorer.importDataEmpty'
    if (kind === 'importSuccess') return 'explorer.importDataSuccess'
    return 'explorer.importDataFailed'
}

export function buildQualifiedTableName(
    ctx: Pick<TableContext, 'database' | 'tableName' | 'dbType'>,
): string {
    return buildDialectQualifiedTableName(ctx.dbType, ctx.database, ctx.tableName)
}

export function buildTruncateTableSql(ctx: Pick<TableContext, 'database' | 'tableName' | 'dbType'>): string {
    return `TRUNCATE TABLE ${buildQualifiedTableName(ctx)}`
}

export function buildDropTableSql(ctx: Pick<TableContext, 'database' | 'tableName' | 'dbType'>): string {
    return `DROP TABLE IF EXISTS ${buildQualifiedTableName(ctx)}`
}

export async function exportTableDataFile(
    tableName: string,
    columns: TableColumn[],
    rows: TableRow[],
    format: 'csv' | 'xlsx' = 'csv',
): Promise<string> {
    const result = await downloadGridExport(columns, rows, format, tableName, tableName)
    return result.fileName
}

export async function exportTableDataCsv(
    tableName: string,
    columns: TableColumn[],
    rows: TableRow[],
): Promise<string> {
    return exportTableDataFile(tableName, columns, rows, 'csv')
}

/** 简易 CSV 解析（支持引号字段） */
export function parseCsvText(text: string): { headers: string[]; rows: string[][] } {
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim().length)
    if (!lines.length) return {headers: [], rows: []}

    const parsedLines = lines.map(parseCsvLine)
    const headers = parsedLines[0] ?? []
    return {headers, rows: parsedLines.slice(1)}
}

function parseCsvLine(line: string): string[] {
    const cells: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i += 1) {
        const ch = line[i]
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"'
                i += 1
            } else {
                inQuotes = !inQuotes
            }
            continue
        }
        if (ch === ',' && !inQuotes) {
            cells.push(current)
            current = ''
            continue
        }
        current += ch
    }
    cells.push(current)
    return cells.map((cell) => cell.trim())
}

function sqlLiteral(value: string): string {
    const trimmed = value.trim()
    if (!trimmed || trimmed.toUpperCase() === 'NULL') return 'NULL'
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return trimmed
    return `'${trimmed.replace(/'/g, "''")}'`
}

export function buildInsertStatementsFromCsv(
    ctx: Pick<TableContext, 'database' | 'tableName' | 'dbType'>,
    headers: string[],
    rows: string[][],
    batchSize = 50,
): string[] {
    if (!headers.length || !rows.length) return []
    const qualified = buildQualifiedTableName(ctx)
    const columnList = headers.map((header) => quoteSqlIdentifier(ctx.dbType, header)).join(', ')
    const statements: string[] = []

    const effectiveBatchSize = ctx.dbType === 'oracle' ? 1 : batchSize
    for (let offset = 0; offset < rows.length; offset += effectiveBatchSize) {
        const chunk = rows.slice(offset, offset + effectiveBatchSize)
        const values = chunk
            .map((row) => {
                const cells = headers.map((_, index) => sqlLiteral(row[index] ?? ''))
                return `(${cells.join(', ')})`
            })
            .join(',\n')
        statements.push(`INSERT INTO ${qualified} (${columnList}) VALUES\n${values}`)
    }
    return statements
}

export function pickSpreadsheetFile(): Promise<File | null> {
    return new Promise((resolve) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        input.style.display = 'none'
        document.body.appendChild(input)

        let settled = false
        const finish = (file: File | null) => {
            if (settled) return
            settled = true
            input.remove()
            window.removeEventListener('focus', onWindowFocus)
            resolve(file)
        }

        input.onchange = () => finish(input.files?.[0] ?? null)

        const onWindowFocus = () => {
            window.setTimeout(() => {
                if (!input.files?.length) finish(null)
            }, 400)
        }
        window.addEventListener('focus', onWindowFocus)
        input.click()
    })
}

export async function parseSpreadsheetFile(file: File): Promise<{ headers: string[]; rows: string[][] }> {
    if (isXlsxFileName(file.name)) {
        return parseXlsxBuffer(await file.arrayBuffer())
    }
    return parseCsvText(await file.text())
}
