/**
 * T-GRID-1：将 GridPendingBatch 渲染为可读 SQL 预览（方言近似）。
 * 真实执行仍走后端 connector build* + executeUpdate。
 */
import type {TableColumn, TableRow} from '@/core/types'
import type {GridPendingBatch} from '@/core/composables/useGridPendingEdit'
import {columnRowKey, readRowCellScalar} from '@/core/utils/query-result-column'

function escapeSqlString(value: string): string {
    return `'${value.replace(/'/g, "''")}'`
}

function sqlLiteral(value: string | number | boolean | null): string {
    if (value == null) return 'NULL'
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
    return escapeSqlString(String(value))
}

function safeIdent(name: string): string {
    const trimmed = name.trim()
    if (!trimmed) return 'table'
    if (/^[A-Za-z_][\w$]*$/.test(trimmed)) return trimmed
    return `\`${trimmed.replace(/`/g, '``')}\``
}

function resolvePkColumns(columns: TableColumn[], pkColumns: string[]): TableColumn[] {
    const resolved: TableColumn[] = []
    for (const pk of pkColumns) {
        const col =
            columns.find((c) => c.name === pk)
            ?? columns.find((c) => c.name.toLowerCase() === pk.toLowerCase())
            ?? columns.find((c) => columnRowKey(c).toLowerCase() === pk.toLowerCase())
        if (col) resolved.push(col)
    }
    return resolved
}

function whereByPk(
    row: TableRow,
    pkCols: TableColumn[],
    keyValues?: Record<string, string | number | boolean | null>,
): string {
    return pkCols
        .map((col) => {
            const value = keyValues && col.name in keyValues
                ? keyValues[col.name]
                : readRowCellScalar(row, col)
            return `${safeIdent(col.name)} = ${sqlLiteral(value)}`
        })
        .join(' AND ')
}

export type GridPendingSqlPreview = {
    sql: string
    deleteCount: number
    updateCount: number
    insertCount: number
    statementCount: number
}

export function summarizeGridPendingBatch(batch: GridPendingBatch): {
    deleteCount: number
    updateCount: number
    insertCount: number
    total: number
} {
    const deleteCount = batch.deletes.length
    const updateCount = batch.updates.length
    const insertCount = batch.inserts.length
    return {
        deleteCount,
        updateCount,
        insertCount,
        total: deleteCount + updateCount + insertCount,
    }
}

/** 顺序与 useTableDataView.submitChanges 一致：deletes → updates → inserts */
export function buildGridPendingSqlPreview(options: {
    batch: GridPendingBatch
    tableName: string
    columns: TableColumn[]
    pkColumns: string[]
}): GridPendingSqlPreview {
    const table = safeIdent(options.tableName)
    const pkCols = resolvePkColumns(options.columns, options.pkColumns)
    const lines: string[] = []

    for (const row of options.batch.deletes) {
        if (!pkCols.length) {
            lines.push(`-- DELETE skipped: primary key required`)
            continue
        }
        const where = whereByPk(row, pkCols)
        if (!where) {
            lines.push(`-- DELETE skipped: empty primary key`)
            continue
        }
        lines.push(`DELETE FROM ${table} WHERE ${where};`)
    }

    for (const update of options.batch.updates) {
        if (!pkCols.length) {
            lines.push(`-- UPDATE skipped: primary key required`)
            continue
        }
        const assignments = Object.entries(update.values).map(
            ([name, value]) => `${safeIdent(name)} = ${sqlLiteral(value)}`,
        )
        const where = whereByPk(update.originalRow, pkCols, update.keyValues)
        if (!assignments.length || !where) {
            lines.push(`-- UPDATE skipped: no changes or empty key`)
            continue
        }
        lines.push(`UPDATE ${table} SET ${assignments.join(', ')} WHERE ${where};`)
    }

    for (const insert of options.batch.inserts) {
        const entries = Object.entries(insert)
        if (!entries.length) {
            lines.push(`-- INSERT skipped: empty row`)
            continue
        }
        const cols = entries.map(([name]) => safeIdent(name)).join(', ')
        const vals = entries.map(([, value]) => sqlLiteral(value)).join(', ')
        lines.push(`INSERT INTO ${table} (${cols}) VALUES (${vals});`)
    }

    const summary = summarizeGridPendingBatch(options.batch)
    return {
        sql: lines.length ? `${lines.join('\n')}\n` : '-- no statements\n',
        deleteCount: summary.deleteCount,
        updateCount: summary.updateCount,
        insertCount: summary.insertCount,
        statementCount: lines.filter((line) => !line.startsWith('--')).length,
    }
}
