export type TableCellValue = string | number | boolean | null | Record<string, unknown> | unknown[]

export const GRID_CELL_PREVIEW_MAX_LENGTH = 96

export function unwrapCellValue(value: unknown): unknown {
    if (value == null || typeof value !== 'object' || Array.isArray(value)) {
        return value
    }
    const record = value as Record<string, unknown>
    if (typeof record.type === 'string' && Object.prototype.hasOwnProperty.call(record, 'value')) {
        return record.value
    }
    return value
}

export function formatCellPreviewValue(value: unknown): string {
    return formatCellDisplayValue(unwrapCellValue(value), GRID_CELL_PREVIEW_MAX_LENGTH)
}

/**
 * Compact display for grid cells / form previews. Skips JSON pretty-print so wide
 * pages do not pay JSON.parse on every visible cell (use formatCellFullValue for that).
 */
export function formatCellDisplayValue(value: unknown, maxLength = GRID_CELL_PREVIEW_MAX_LENGTH): string {
    if (value == null) return ''
    if (typeof value === 'string') {
        return truncateCellText(value, maxLength)
    }
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    if (typeof value === 'object') {
        try {
            return truncateCellText(JSON.stringify(value), maxLength)
        } catch {
            return truncateCellText(String(value), maxLength)
        }
    }
    return truncateCellText(String(value), maxLength)
}

export function formatCellFullValue(value: unknown): string {
    const unwrapped = unwrapCellValue(value)
    if (unwrapped == null) return ''
    if (typeof unwrapped === 'string') {
        return maybePrettyJsonString(unwrapped) ?? unwrapped
    }
    if (typeof unwrapped === 'number' || typeof unwrapped === 'boolean') {
        return String(unwrapped)
    }
    if (typeof unwrapped === 'object') {
        try {
            return JSON.stringify(unwrapped, null, 2)
        } catch {
            return String(unwrapped)
        }
    }
    return String(unwrapped)
}

export function isExpandableCellValue(value: unknown): boolean {
    if (value == null) return false
    if (typeof value === 'object') return true
    const full = formatCellFullValue(value)
    return full.length > GRID_CELL_PREVIEW_MAX_LENGTH
}

function maybePrettyJsonString(text: string): string | null {
    const trimmed = text.trim()
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null
    try {
        return JSON.stringify(JSON.parse(trimmed), null, 2)
    } catch {
        return null
    }
}

function truncateCellText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text
    return `${text.slice(0, Math.max(0, maxLength - 1))}…`
}
