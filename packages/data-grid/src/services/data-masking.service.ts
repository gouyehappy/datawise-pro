/**
 * Pure export-masking helpers — OpenAPI-free; column shape is name-only for defaults.
 */
import type {TableColumn, TableRow} from '../grid-types'
import {formatCellFullValue} from '../utils/cell-value-format'
import {columnRowKey, readRowCell} from '../utils/query-result-column'

export type DataMaskTemplate = 'phone' | 'email' | 'idCard'

export interface ExportColumnMaskRule {
  columnName: string
  template: DataMaskTemplate
  enabled: boolean
}

export interface GridExportMaskConfig {
  enabled: boolean
  columns: ExportColumnMaskRule[]
}

/** Minimal column face for mask-default suggestion (host TableColumn is compatible). */
export type ExportColumn = {
  name: string
}

const PHONE_NAME = /phone|mobile|tel|cell|handset|手机|电话/i
const EMAIL_NAME = /e[-_]?mail|email|mail|邮箱/i
const ID_CARD_NAME = /id[-_]?card|idcard|identity|national.?id|身份证|证件号/i

export function guessMaskTemplate(columnName: string): DataMaskTemplate | null {
  const name = columnName.trim()
  if (!name) return null
  if (ID_CARD_NAME.test(name)) return 'idCard'
  if (EMAIL_NAME.test(name)) return 'email'
  if (PHONE_NAME.test(name)) return 'phone'
  return null
}

export function maskPhone(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return trimmed
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) {
    return `${digits.slice(0, 3)}****${digits.slice(-4)}`
  }
  if (digits.length > 11) {
    const local = digits.slice(-11)
    if (local.startsWith('1')) {
      const prefix = trimmed.slice(0, Math.max(0, trimmed.length - local.length))
      return `${prefix}${local.slice(0, 3)}****${local.slice(-4)}`
    }
  }
  if (trimmed.length <= 4) return '****'
  return `${trimmed.slice(0, 2)}****${trimmed.slice(-2)}`
}

export function maskEmail(value: string): string {
  const trimmed = value.trim()
  const at = trimmed.indexOf('@')
  if (at <= 0) return '***@***'
  const local = trimmed.slice(0, at)
  const domain = trimmed.slice(at)
  if (local.length <= 2) return `***${domain}`
  return `${local[0]}***${local[local.length - 1]}${domain}`
}

export function maskIdCard(value: string): string {
  const cleaned = value.replace(/\s/g, '').toUpperCase()
  if (/^\d{17}[\dX]$/.test(cleaned)) {
    return `${cleaned.slice(0, 6)}********${cleaned.slice(-4)}`
  }
  if (/^\d{15}$/.test(cleaned)) {
    return `${cleaned.slice(0, 6)}*****${cleaned.slice(-4)}`
  }
  if (cleaned.length <= 4) return '****'
  return `${cleaned.slice(0, 2)}****${cleaned.slice(-2)}`
}

export function maskByTemplate(value: string, template: DataMaskTemplate): string {
  switch (template) {
    case 'phone':
      return maskPhone(value)
    case 'email':
      return maskEmail(value)
    case 'idCard':
      return maskIdCard(value)
    default:
      return value
  }
}

export function createDefaultExportMaskConfig(
  columns: readonly ExportColumn[],
  suggestMask: boolean,
): GridExportMaskConfig {
  const rules = columns.map((column) => {
    const guessed = guessMaskTemplate(column.name)
    return {
      columnName: column.name,
      template: guessed ?? ('phone' as DataMaskTemplate),
      enabled: suggestMask && guessed != null,
    }
  })
  return {
    enabled: suggestMask && rules.some((rule) => rule.enabled),
    columns: rules,
  }
}

export function applyExportMasking(
  columns: readonly TableColumn[],
  rows: readonly TableRow[],
  config: GridExportMaskConfig | undefined,
): TableRow[] {
  if (!config?.enabled) return [...rows]

  const rules = new Map<string, DataMaskTemplate>()
  for (const rule of config.columns) {
    if (rule.enabled) rules.set(rule.columnName, rule.template)
  }
  if (!rules.size) return [...rows]

  return rows.map((row) => {
    const next: TableRow = {...row}
    for (const column of columns) {
      const template = rules.get(column.name)
      if (!template) continue
      const raw = readRowCell(row, column)
      const text = formatCellFullValue(raw)
      if (!text) continue
      next[columnRowKey(column)] = maskByTemplate(text, template)
    }
    return next
  })
}
