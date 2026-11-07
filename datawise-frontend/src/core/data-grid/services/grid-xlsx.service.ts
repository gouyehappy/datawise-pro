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

function normalizeSpreadsheetCell(value: unknown): string {
    if (value == null) return ''
    return String(value).trim()
}

function coerceNumericValue(value: unknown): number | null {
    const unwrapped = unwrapCellValue(value)
    if (typeof unwrapped === 'number' && Number.isFinite(unwrapped)) return unwrapped
    if (typeof unwrapped === 'string') {
        const trimmed = unwrapped.trim()
        if (!trimmed) return null
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
    let hasFraction = false
    for (const row of rows.slice(0, NUMERIC_SAMPLE_ROWS)) {
        const numericValue = coerceNumericValue(readRowCell(row, col))
        if (numericValue == null) continue
        if (!Number.isInteger(numericValue)) {
            hasFraction = true
            break
        }
    }
    return hasFraction ? '#,##0.##' : '#,##0'
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

export async function parseXlsxBuffer(buffer: ArrayBuffer): Promise<SpreadsheetParseResult> {
    const XLSX = await import('xlsx')
    const workbook = XLSX.read(buffer, {type: 'array'})
    const sheetName = workbook.SheetNames[0]
    if (!sheetName) return {headers: [], rows: []}

    const sheet = workbook.Sheets[sheetName]
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        defval: '',
        raw: false,
    })
    if (!matrix.length) return {headers: [], rows: []}

    const headers = (matrix[0] ?? []).map(normalizeSpreadsheetCell)
    const rows = matrix
        .slice(1)
        .map((line) => {
            const cells = (line ?? []).map(normalizeSpreadsheetCell)
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
