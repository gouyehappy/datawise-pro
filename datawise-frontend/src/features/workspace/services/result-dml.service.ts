import type {TableColumn, TableRow} from '@/core/types'
import {columnRowKey, readRowCellScalar} from '@/core/utils/query-result-column'
import {serializeGridToSql} from '@/features/workspace/services/grid-export.service'

export type ResultDmlKind = 'insert' | 'update' | 'delete'

function escapeSqlString(value: string): string {
    return `'${value.replace(/'/g, "''")}'`
}

function sqlLiteral(value: string | number | boolean | null): string {
    if (value == null) return 'NULL'
    if (typeof value === 'number') return String(value)
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
    return escapeSqlString(String(value))
}

function safeTableName(tableName: string): string {
    const trimmed = tableName.trim()
    if (!trimmed) return 'query_result'
    return trimmed.replace(/[^\w.]/g, '_')
}

function findColumnByKeyOrName(columns: TableColumn[], keyOrName: string): TableColumn | undefined {
    const normalized = keyOrName.trim().toLowerCase()
    if (!normalized) return undefined
    return columns.find(
        (col) =>
            columnRowKey(col).toLowerCase() === normalized
            || col.name.toLowerCase() === normalized,
    )
}

function resolvePkColumnDefs(columns: TableColumn[], pkColumns?: string[]): TableColumn[] {
    if (pkColumns?.length) {
        const resolved: TableColumn[] = []
        for (const pk of pkColumns) {
            const col = findColumnByKeyOrName(columns, pk)
            if (col) resolved.push(col)
        }
        return resolved
    }
    return columns.length ? [columns[0]] : []
}

function isPkColumn(col: TableColumn, pkCols: TableColumn[]): boolean {
    const key = columnRowKey(col)
    return pkCols.some((pk) => columnRowKey(pk) === key || pk.name === col.name)
}

export function buildResultInsertSql(
    columns: TableColumn[],
    rows: TableRow[],
    tableName: string,
): string {
    return serializeGridToSql(columns, rows, safeTableName(tableName))
}

export function buildResultUpdateSql(
    columns: TableColumn[],
    rows: TableRow[],
    tableName: string,
    pkColumns?: string[],
): string {
    if (!rows.length) return '-- empty result\n'
    const table = safeTableName(tableName)
    const pkCols = resolvePkColumnDefs(columns, pkColumns)
    if (!pkCols.length) return '-- primary key columns required for UPDATE\n'

    const lines: string[] = []
    for (const row of rows) {
        const assignments = columns
            .filter((col) => !isPkColumn(col, pkCols))
            .map((col) => `${col.name} = ${sqlLiteral(readRowCellScalar(row, col))}`)
        const predicates = pkCols.map(
            (col) => `${col.name} = ${sqlLiteral(readRowCellScalar(row, col))}`,
        )
        if (!predicates.length) continue
        if (!assignments.length) {
            lines.push(`-- UPDATE ${table}: no non-PK columns to set for row ${predicates.join(' AND ')}\n`)
            continue
        }
        lines.push(`UPDATE ${table} SET ${assignments.join(', ')} WHERE ${predicates.join(' AND ')};`)
    }
    return lines.join('\n') + (lines.length ? '\n' : '')
}

export function buildResultDeleteSql(
    columns: TableColumn[],
    rows: TableRow[],
    tableName: string,
    pkColumns?: string[],
): string {
    if (!rows.length) return '-- empty result\n'
    const table = safeTableName(tableName)
    const pkCols = resolvePkColumnDefs(columns, pkColumns)
    if (!pkCols.length) return '-- primary key columns required for DELETE\n'

    const lines: string[] = []
    for (const row of rows) {
        const predicates = pkCols.map(
            (col) => `${col.name} = ${sqlLiteral(readRowCellScalar(row, col))}`,
        )
        if (!predicates.length) continue
        lines.push(`DELETE FROM ${table} WHERE ${predicates.join(' AND ')};`)
    }
    return lines.join('\n') + (lines.length ? '\n' : '')
}

export function buildResultDmlSql(
    kind: ResultDmlKind,
    columns: TableColumn[],
    rows: TableRow[],
    tableName: string,
    pkColumns?: string[],
): string {
    switch (kind) {
        case 'insert':
            return buildResultInsertSql(columns, rows, tableName)
        case 'update':
            return buildResultUpdateSql(columns, rows, tableName, pkColumns)
        case 'delete':
            return buildResultDeleteSql(columns, rows, tableName, pkColumns)
    }
}
