import {formatCellFullValue, type TableCellValue} from '@/core/utils/cell-value-format'
import type {TableColumn, TableRow} from '@/core/types'
import {columnRowKey, readRowCell, readRowCellScalar} from '@/core/utils/query-result-column'
import {serializeGridToXlsxBuffer} from '@/core/data-grid/services/grid-xlsx.service'
import {
    applyExportMasking,
    type GridExportMaskConfig,
} from '@/core/data-grid/services/data-masking.service'
import {saveExportBlob, type ExportSaveResult} from '@/shared/utils/export-save'

export type GridExportFormat = 'csv' | 'json' | 'tsv' | 'sql' | 'xlsx'

export interface GridExportOptions {
    mask?: GridExportMaskConfig
    /** When true, text exports include an incomplete-result marker (federated / row-cap truncation). */
    incomplete?: boolean
    /** Commercial trial / site watermark footer (text formats). */
    watermarkFooter?: string | null
}

/** Leading marker for incomplete CSV/TSV exports. */
export const GRID_EXPORT_INCOMPLETE_CSV_MARKER = '# INCOMPLETE: result truncated at row cap'

/** Leading marker for incomplete SQL exports. */
export const GRID_EXPORT_INCOMPLETE_SQL_MARKER = '-- INCOMPLETE: result truncated at row cap'

export function appendExportWatermark(content: string, format: GridExportFormat, footer?: string | null): string {
    if (!footer || !footer.trim()) return content
    if (format === 'xlsx') return content
    const mark = footer.trim()
    if (format === 'json') {
        return content // keep JSON valid; watermark is for human-readable exports
    }
    const prefix = format === 'sql' ? '-- ' : '# '
    const sep = content.endsWith('\n') ? '' : '\n'
    return `${content}${sep}${prefix}${mark}\n`
}

const FORMAT_EXT: Record<GridExportFormat, string> = {
    csv: 'csv',
    json: 'json',
    tsv: 'tsv',
    sql: 'sql',
    xlsx: 'xlsx',
}

const FORMAT_MIME: Record<GridExportFormat, string> = {
    csv: 'text/csv;charset=utf-8',
    json: 'application/json;charset=utf-8',
    tsv: 'text/tab-separated-values;charset=utf-8',
    sql: 'text/plain;charset=utf-8',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

export function buildExportFileName(baseName: string, format: GridExportFormat): string {
    const stem = baseName.replace(/\.[^.]+$/, '').trim() || 'export'
    return `${stem}.${FORMAT_EXT[format]}`
}

function resolveXlsxSheetName(fileName: string): string {
    return fileName.replace(/\.[^.]+$/, '').trim() || 'Report'
}

function cellToString(value: unknown): string {
    return formatCellFullValue(value)
}

/** Excel/Sheets CSV injection triggers (OWASP); aligned with dbx `needs_formula_guard`. */
const FORMULA_TRIGGER = new Set(['=', '+', '-', '@', '\t', '\r'])
const EXCEL_SIGNIFICANT_DIGIT_LIMIT = 15

function isExcelExactDecimalLiteral(value: string): boolean {
    const bytes = value
    const digits = bytes.startsWith('+') || bytes.startsWith('-') ? bytes.slice(1) : bytes
    const validDigits = (part: string) => part.length > 0 && /^[0-9]+$/.test(part)
    const dot = digits.indexOf('.')
    const valid =
        dot >= 0
            ? validDigits(digits.slice(0, dot)) && validDigits(digits.slice(dot + 1))
            : validDigits(digits)
    if (!valid) return false
    const significant = [...digits]
        .filter((ch) => ch !== '.')
        .join('')
        .replace(/^0+/, '')
    return significant.length <= EXCEL_SIGNIFICANT_DIGIT_LIMIT
}

function atSignBeginsExcelFormula(rest: string): boolean {
    const first = rest.codePointAt(0)
    return first != null && first <= 0x7f
}

/** Exported for unit tests. */
export function needsFormulaGuard(value: string): boolean {
    const rest = value.replace(/^ +/, '')
    const first = rest[0]
    if (!first || !FORMULA_TRIGGER.has(first)) return false
    if (first === '-' && isExcelExactDecimalLiteral(rest.slice(1))) return false
    if (first === '@' && !atSignBeginsExcelFormula(rest.slice(1))) return false
    return true
}

/** Prefix `'` so spreadsheet apps treat the cell as text, not a formula. */
export function applyFormulaGuard(value: string): string {
    if (value.startsWith("'")) {
        if (value[1] === "'" || needsFormulaGuard(value.slice(1))) return `'${value}`
        return value
    }
    if (needsFormulaGuard(value)) return `'${value}`
    return value
}

function escapeCsvCell(value: string): string {
    const guarded = applyFormulaGuard(value)
    if (/[",\n\r]/.test(guarded)) return `"${guarded.replace(/"/g, '""')}"`
    return guarded
}

function escapeTsvCell(value: string): string {
    const guarded = applyFormulaGuard(value)
    return guarded.replace(/\t/g, ' ').replace(/\r?\n/g, ' ')
}

function escapeSqlString(value: string): string {
    return `'${value.replace(/'/g, "''")}'`
}

function sqlLiteral(value: string | number | boolean | null): string {
    if (value == null) return 'NULL'
    if (typeof value === 'number') return String(value)
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
    return escapeSqlString(String(value))
}

export function serializeGridToCsv(columns: TableColumn[], rows: TableRow[]): string {
    const header = columns.map((col) => escapeCsvCell(col.name)).join(',')
    const lines = rows.map((row) =>
        columns.map((col) => escapeCsvCell(cellToString(readRowCell(row, col)))).join(','),
    )
    return [header, ...lines].join('\n')
}

export function serializeGridToTsv(columns: TableColumn[], rows: TableRow[]): string {
    const header = columns.map((col) => escapeTsvCell(col.name)).join('\t')
    const lines = rows.map((row) =>
        columns.map((col) => escapeTsvCell(cellToString(readRowCell(row, col)))).join('\t'),
    )
    return [header, ...lines].join('\n')
}

export function serializeGridToJson(columns: TableColumn[], rows: TableRow[]): string {
    const data = rows.map((row) => {
        const item: Record<string, TableCellValue> = {}
        for (const col of columns) {
            item[col.name] = readRowCell(row, col)
        }
        return item
    })
    return JSON.stringify(data, null, 2)
}

export function serializeGridToSql(
    columns: TableColumn[],
    rows: TableRow[],
    tableName = 'query_result',
): string {
    if (!columns.length) return '-- empty result\n'
    if (!rows.length) return `-- empty result\n`

    const safeTable = tableName.replace(/[^\w.]/g, '_') || 'query_result'
    const colNames = columns.map((col) => col.name).join(', ')
    const values = rows
        .map((row) => {
            const cells = columns.map((col) => sqlLiteral(readRowCellScalar(row, col))).join(', ')
            return `(${cells})`
        })
        .join(',\n')

    return `INSERT INTO ${safeTable} (${colNames}) VALUES\n${values};\n`
}

export function serializeGridData(
    columns: TableColumn[],
    rows: TableRow[],
    format: GridExportFormat,
    tableName?: string,
    options?: Pick<GridExportOptions, 'incomplete'>,
): string {
    let content: string
    switch (format) {
        case 'csv':
            content = serializeGridToCsv(columns, rows)
            break
        case 'tsv':
            content = serializeGridToTsv(columns, rows)
            break
        case 'json':
            content = serializeGridToJson(columns, rows)
            break
        case 'sql':
            content = serializeGridToSql(columns, rows, tableName)
            break
        default:
            content = serializeGridToCsv(columns, rows)
    }
    if (!options?.incomplete) {
        return content
    }
    if (format === 'json') {
        const parsed = JSON.parse(content) as unknown
        return JSON.stringify({incomplete: true, rows: parsed}, null, 2)
    }
    if (format === 'sql') {
        return `${GRID_EXPORT_INCOMPLETE_SQL_MARKER}\n${content}`
    }
    return `${GRID_EXPORT_INCOMPLETE_CSV_MARKER}\n${content}`
}

export async function createGridExportBlob(
    columns: TableColumn[],
    rows: TableRow[],
    format: GridExportFormat,
    tableName?: string,
    fileName?: string,
    options?: GridExportOptions,
): Promise<Blob> {
    const exportRows = options?.mask ? applyExportMasking(columns, rows, options.mask) : rows
    if (format === 'xlsx') {
        const buffer = await serializeGridToXlsxBuffer(columns, exportRows, {
            sheetName: resolveXlsxSheetName(fileName ?? tableName ?? 'Report'),
        })
        return new Blob([buffer], {type: FORMAT_MIME.xlsx})
    }
    const content = serializeGridData(columns, exportRows, format, tableName, {
        incomplete: options?.incomplete,
    })
    const withMark = appendExportWatermark(content, format, options?.watermarkFooter)
    const body = format === 'csv' ? `\uFEFF${withMark}` : withMark
    return new Blob([body], {type: FORMAT_MIME[format]})
}

export async function downloadGridExport(
    columns: TableColumn[],
    rows: TableRow[],
    format: GridExportFormat,
    fileName: string,
    tableName?: string,
    options?: GridExportOptions,
): Promise<ExportSaveResult> {
    const resolvedName = buildExportFileName(fileName, format)
    const blob = await createGridExportBlob(columns, rows, format, tableName, resolvedName, options)
    return saveExportBlob(blob, resolvedName)
}

/** 供测试校验列 key 映射 */
export function rowKeysForColumns(columns: TableColumn[]): string[] {
    return columns.map((col) => columnRowKey(col))
}
