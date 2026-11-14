/**
 * Spreadsheet I/O for the data grid (exceljs for both export and parse).
 */
import type {TableColumn, TableRow} from '@/core/types'
import {formatCellFullValue, unwrapCellValue} from '@/core/utils/cell-value-format'
import {columnRowKey, readRowCell} from '@/core/utils/query-result-column'

export interface SpreadsheetParseResult {
    headers: string[]
    rows: string[][]
}

export interface GridXlsxExportOptions {
    sheetName?: string
}

const HEADER_FILL = 'FFE8F4FC'
const HEADER_FONT = 'FF1F2937'
const MIN_COL_WIDTH = 8
const MAX_COL_WIDTH = 48
const COL_PADDING = 2
const NUMERIC_SAMPLE_ROWS = 50
const NUMERIC_RATIO_THRESHOLD = 0.8
/** Excel loses precision above 15 significant digits; keep those cells as text. */
const MAX_NUMERIC_SCALE_FORMAT = 15
const EXCEL_SIGNIFICANT_DIGIT_LIMIT = 15

function normalizeSpreadsheetCell(value: unknown): string {
    if (value == null) return ''
    return String(value).trim()
}

/** Leading-zero / oversize / scientific strings must stay text to avoid fidelity loss. */
export function shouldKeepNumericStringAsText(raw: string): boolean {
    const trimmed = raw.trim()
    if (!trimmed) return false
    if (/[eE]/.test(trimmed)) return true
    if (!/^[+-]?\d+(\.\d+)?$/.test(trimmed)) return false
    // 007 / 01.5 — Number() would drop leading zeros
    if (/^[+-]?0\d/.test(trimmed)) return true
    const digits = trimmed.replace(/^[+-]/, '').replace(/\./, '')
    const significant = digits.replace(/^0+/, '')
    return significant.length > EXCEL_SIGNIFICANT_DIGIT_LIMIT
}

export function decimalFractionDigits(value: string): number {
    const trimmed = value.trim()
    if (/[eE]/.test(trimmed)) return 0
    const dot = trimmed.indexOf('.')
    if (dot < 0) return 0
    return [...trimmed.slice(dot + 1)].filter((ch) => ch >= '0' && ch <= '9').length
}

function coerceNumericValue(value: unknown): number | null {
    const unwrapped = unwrapCellValue(value)
    if (typeof unwrapped === 'number' && Number.isFinite(unwrapped)) return unwrapped
    if (typeof unwrapped === 'string') {
        const trimmed = unwrapped.trim()
        if (!trimmed) return null
        if (shouldKeepNumericStringAsText(trimmed)) return null
        if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed)
    }
    return null
}

function estimateColumnWidth(header: string, samples: unknown[]): number {
    const lengths = [
        header.length,
        ...samples.map((value) => formatCellFullValue(value).length),
    ]
    const max = Math.max(...lengths, MIN_COL_WIDTH)
    return Math.min(MAX_COL_WIDTH, max + COL_PADDING)
}

function columnLooksNumeric(rows: TableRow[], col: TableColumn): boolean {
    if (!rows.length) return false
    let numeric = 0
    let nonEmpty = 0
    for (const row of rows.slice(0, NUMERIC_SAMPLE_ROWS)) {
        const value = unwrapCellValue(readRowCell(row, col))
        if (value == null || value === '') continue
        nonEmpty += 1
        if (coerceNumericValue(value) != null) numeric += 1
    }
    return nonEmpty > 0 && numeric / nonEmpty >= NUMERIC_RATIO_THRESHOLD
}

function columnNumericFormat(rows: TableRow[], col: TableColumn): string {
    let maxScale = 0
    for (const row of rows.slice(0, NUMERIC_SAMPLE_ROWS)) {
        const raw = unwrapCellValue(readRowCell(row, col))
        if (typeof raw === 'string') {
            maxScale = Math.max(maxScale, decimalFractionDigits(raw))
            continue
        }
        const numericValue = coerceNumericValue(raw)
        if (numericValue == null || Number.isInteger(numericValue)) continue
        const asText = String(numericValue)
        maxScale = Math.max(maxScale, decimalFractionDigits(asText))
    }
    if (maxScale <= 0) return '#,##0'
    const scale = Math.min(maxScale, MAX_NUMERIC_SCALE_FORMAT)
    // Fixed decimals preserve trailing zeros (e.g. 1.230 → 0.000)
    return `0.${'0'.repeat(scale)}`
}

function sanitizeSheetName(name: string): string {
    const trimmed = name.replace(/[\\/?*[\]:]/g, '_').trim()
    return (trimmed || 'Report').slice(0, 31)
}

function cellToExportValue(value: unknown, numeric: boolean): string | number | boolean {
    const unwrapped = unwrapCellValue(value)
    if (unwrapped == null) return ''
    if (numeric) {
        const numericValue = coerceNumericValue(unwrapped)
        if (numericValue != null) return numericValue
    }
    if (typeof unwrapped === 'boolean') return unwrapped
    if (typeof unwrapped === 'number' && Number.isFinite(unwrapped)) return unwrapped
    return formatCellFullValue(unwrapped)
}

export async function serializeGridToXlsxBuffer(
    columns: TableColumn[],
    rows: TableRow[],
    options: GridXlsxExportOptions = {},
): Promise<ArrayBuffer> {
    const ExcelJS = (await import('exceljs')).default
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'DataWise'
    workbook.created = new Date()

    const sheet = workbook.addWorksheet(sanitizeSheetName(options.sheetName ?? 'Report'))
    const numericColumns = new Set(
        columns.filter((col) => columnLooksNumeric(rows, col)).map((col) => columnRowKey(col)),
    )

    sheet.columns = columns.map((col) => {
        const key = columnRowKey(col)
        return {
            header: col.name,
            key,
            width: estimateColumnWidth(
                col.name,
                rows.slice(0, 100).map((row) => readRowCell(row, col)),
            ),
        }
    })

    for (const row of rows) {
        const record: Record<string, string | number | boolean> = {}
        for (const col of columns) {
            const key = columnRowKey(col)
            record[key] = cellToExportValue(readRowCell(row, col), numericColumns.has(key))
        }
        sheet.addRow(record)
    }

    const headerRow = sheet.getRow(1)
    headerRow.font = {bold: true, color: {argb: HEADER_FONT}}
    headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: {argb: HEADER_FILL},
    }
    headerRow.alignment = {horizontal: 'center', vertical: 'middle'}
    headerRow.height = 22

    for (const col of columns) {
        const key = columnRowKey(col)
        const column = sheet.getColumn(key)
        if (numericColumns.has(key)) {
            column.numFmt = columnNumericFormat(rows, col)
            column.alignment = {horizontal: 'right'}
        }
    }

    sheet.views = [{
        state: 'frozen',
        ySplit: 1,
        xSplit: 0,
        topLeftCell: 'A2',
        activeCell: 'A2',
    }]

    const buffer = await workbook.xlsx.writeBuffer()
    return buffer as ArrayBuffer
}

function cellDisplayText(cell: {text?: string; value?: unknown}): string {
    if (typeof cell.text === 'string' && cell.text.length > 0) {
        return normalizeSpreadsheetCell(cell.text)
    }
    return normalizeSpreadsheetCell(cell.value)
}

export async function parseXlsxBuffer(buffer: ArrayBuffer): Promise<SpreadsheetParseResult> {
    const ExcelJS = (await import('exceljs')).default
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)
    const sheet = workbook.worksheets[0]
    if (!sheet) return {headers: [], rows: []}

    const matrix: string[][] = []
    sheet.eachRow({includeEmpty: false}, (row) => {
        const cells: string[] = []
        row.eachCell({includeEmpty: true}, (cell, colNumber) => {
            while (cells.length < colNumber - 1) cells.push('')
            cells[colNumber - 1] = cellDisplayText(cell)
        })
        matrix.push(cells)
    })
    if (!matrix.length) return {headers: [], rows: []}

    const headers = (matrix[0] ?? []).map(normalizeSpreadsheetCell)
    const rows = matrix
        .slice(1)
        .map((line) => {
            const cells = [...line]
            while (cells.length < headers.length) cells.push('')
            return cells.slice(0, headers.length)
        })
        .filter((line) => line.some((cell) => cell.length > 0))

    return {headers, rows}
}

export function isXlsxFileName(fileName: string): boolean {
    return /\.xlsx$/i.test(fileName)
}

/** 供测试读取报表 xlsx 的结构化属性 */
export async function readReportXlsxMeta(buffer: ArrayBuffer): Promise<{
    sheetName: string
    headers: string[]
    rowCount: number
    frozen: boolean
    headerBold: boolean
    numericColumnFormats: string[]
}> {
    const ExcelJS = (await import('exceljs')).default
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)
    const sheet = workbook.worksheets[0]
    if (!sheet) {
        return {
            sheetName: '',
            headers: [],
            rowCount: 0,
            frozen: false,
            headerBold: false,
            numericColumnFormats: [],
        }
    }

    const headers: string[] = []
    sheet.getRow(1).eachCell((cell, colNumber) => {
        headers[colNumber - 1] = String(cell.value ?? '')
    })

    const numericColumnFormats = sheet.columns
        .map((column) => column.numFmt)
        .filter((format): format is string => Boolean(format))

    return {
        sheetName: sheet.name,
        headers,
        rowCount: Math.max(0, sheet.rowCount - 1),
        frozen: sheet.views?.some((view) => view.state === 'frozen' && (view.ySplit ?? 0) >= 1) ?? false,
        headerBold: sheet.getCell('A1').font?.bold === true,
        numericColumnFormats,
    }
}
