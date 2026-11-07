import type {DbType, TableColumn, TableRow} from '@/core/types'
import type {TableColumnDetail, TablePropertiesResult} from '@/shared/api/types'
import {buildQualifiedTableName, quoteSqlIdentifier} from '@/features/connection/services/db-type-quotes'

export const FAKE_DATA_PREVIEW_ROWS = 5
export const FAKE_DATA_DEFAULT_ROWS = 10
export const FAKE_DATA_MAX_ROWS = 500

export type FakeDataCellValue = string | number | boolean | null
export type FakeDataRow = Record<string, FakeDataCellValue>

function escapeSqlString(value: string): string {
    return `'${value.replace(/'/g, "''")}'`
}

function sqlLiteral(value: FakeDataCellValue): string {
    if (value == null) return 'NULL'
    if (typeof value === 'number') return String(value)
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
    return escapeSqlString(String(value))
}

export function columnsForFakeInsert(columns: TableColumnDetail[]): TableColumnDetail[] {
    return columns.filter((column) => !(column.autoIncrement && column.keyType === 'PRI'))
}

export function clampFakeDataRowCount(value: number): number {
    if (!Number.isFinite(value)) return FAKE_DATA_DEFAULT_ROWS
    return Math.min(FAKE_DATA_MAX_ROWS, Math.max(1, Math.round(value)))
}

function pseudoUuid(seed: number): string {
    const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0')
    return `${hex(seed + 1).slice(0, 8)}-${hex(seed + 2).slice(0, 4)}-4${hex(seed + 3).slice(1, 4)}-a${hex(seed + 4).slice(1, 4)}-${hex(seed + 5).slice(0, 12)}`
}

export function generateFakeCellValue(column: TableColumnDetail, rowIndex: number): FakeDataCellValue {
    const type = column.dataType.toLowerCase()
    const name = column.name.toLowerCase()
    const seq = rowIndex + 1

    if (name.includes('email')) return `user${seq}@example.com`
    if (name.includes('phone') || name.includes('mobile')) return `138000${String(10000 + seq).slice(-5)}`
    if (name.includes('password') || name.includes('passwd')) return `Passw0rd!${seq}`
    if (name.includes('status')) return seq % 3 === 0 ? 'inactive' : 'active'
    if (name.includes('code') || name.endsWith('_no') || name.endsWith('_num')) return `CODE-${String(1000 + seq)}`
    if (name.includes('sku')) return `SKU-${String(10000 + seq)}`
    if (name.includes('ip')) return `192.168.${(seq % 250) + 1}.${(seq % 200) + 10}`
    if (name.includes('address') || name.includes('street')) return `${seq} Example Street`
    if (name.includes('city')) return ['Shanghai', 'Beijing', 'Shenzhen', 'Hangzhou'][seq % 4]
    if (name.includes('country')) return seq % 2 === 0 ? 'CN' : 'US'
    if (name.includes('title') && !name.includes('job')) return `Sample title ${seq}`
    if (name.includes('description') || name.includes('remark') || name.includes('comment')) {
        return `Auto-generated note ${seq}`
    }
    if (name.includes('amount') || name.includes('price') || name.includes('salary')) {
        return Number((seq * 9.99).toFixed(2))
    }
    if (name.includes('name') && !name.includes('table') && !name.includes('schema')) return `User ${seq}`
    if (name.includes('url') || name.includes('link')) return `https://example.com/item/${seq}`
    if (name.includes('uuid') || type.includes('uuid')) return pseudoUuid(rowIndex)
    if (name.includes('created') || name.includes('updated') || name.includes('modified')) {
        return `2024-01-15 ${String(10 + (seq % 10)).padStart(2, '0')}:${String(seq % 60).padStart(2, '0')}:00`
    }

    if (type.includes('bool') || type === 'bit(1)' || type === 'bit') return rowIndex % 2 === 0
    if (type.includes('bigint') || type.includes('int') || type.includes('serial')) return 1000 + rowIndex
    if (type.includes('decimal') || type.includes('numeric') || type.includes('float') || type.includes('double')) {
        return Number((seq * 1.23).toFixed(2))
    }
    if (type.includes('date') && !type.includes('time')) {
        return `2024-01-${String((seq % 28) + 1).padStart(2, '0')}`
    }
    if (type.includes('datetime') || type.includes('timestamp')) {
        return `2024-01-15 ${String(10 + (seq % 10)).padStart(2, '0')}:${String(seq % 60).padStart(2, '0')}:00`
    }
    if (type.includes('time')) return `10:${String(seq % 60).padStart(2, '0')}:00`
    if (type.includes('json')) return JSON.stringify({id: seq, label: `item-${seq}`})
    if (type.includes('blob') || type.includes('binary') || type.includes('bytea')) return null
    if (type.includes('char') || type.includes('text') || type.includes('clob') || type.includes('varchar')) {
        return `${column.name}_${seq}`
    }

    return `${column.name}_${seq}`
}

export function buildFakeDataRows(properties: TablePropertiesResult, rowCount: number): FakeDataRow[] {
    const columns = columnsForFakeInsert(properties.columns)
    const count = clampFakeDataRowCount(rowCount)
    const rows: FakeDataRow[] = []
    for (let index = 0; index < count; index += 1) {
        const row: FakeDataRow = {}
        for (const column of columns) {
            row[column.name] = generateFakeCellValue(column, index)
        }
        rows.push(row)
    }
    return rows
}

export function fakeDataRowsToGrid(
    columns: TableColumnDetail[],
    rows: FakeDataRow[],
): {columns: TableColumn[]; rows: TableRow[]} {
    const gridColumns: TableColumn[] = columns.map((column) => ({
        name: column.name,
        key: column.name,
    }))
    const gridRows: TableRow[] = rows.map((row) => ({...row}))
    return {columns: gridColumns, rows: gridRows}
}

export function buildFakeDataInsertSql(options: {
    properties: TablePropertiesResult
    rows: FakeDataRow[]
    dbType?: DbType
    database?: string
}): string {
    const columns = columnsForFakeInsert(options.properties.columns)
    if (!columns.length || !options.rows.length) return '-- no insertable columns\n'

    const table = buildQualifiedTableName(
        options.dbType,
        options.database?.trim() ?? '',
        options.properties.tableName,
    )
    const colNames = columns.map((column) => quoteSqlIdentifier(options.dbType, column.name)).join(', ')
    const values = options.rows
        .map((row) => {
            const cells = columns.map((column) => sqlLiteral(row[column.name] ?? null)).join(', ')
            return `(${cells})`
        })
        .join(',\n')

    return `INSERT INTO ${table} (${colNames}) VALUES\n${values};\n`
}
