export type DatePresetId = 'today' | 'last7days' | 'mtd' | 'lastMonth'

export interface DateParameterBinding {
    startKey?: string
    endKey?: string
    singleKeys: string[]
}

function normalizeName(name: string): string {
    return name.trim()
}

function classifyDateParameter(name: string): 'start' | 'end' | 'single' | null {
    const normalized = normalizeName(name)
    if (!normalized) return null
    const lower = normalized.toLowerCase()
    if (/^(start|from|begin)/.test(lower) && /(date|time|dt|day)/.test(lower)) {
        return 'start'
    }
    if (/^(end|to)/.test(lower) && /(date|time|dt|day)/.test(lower)) {
        return 'end'
    }
    if (/(date|time|dt|day)$/i.test(normalized)) {
        return 'single'
    }
    return null
}

export function isDateLikeParameterName(name: string): boolean {
    return classifyDateParameter(name) != null
}

export function detectDateParameterBinding(names: string[]): DateParameterBinding | null {
    const unique = [...new Set(names.map(normalizeName).filter(Boolean))]
    if (!unique.length) return null

    let startKey: string | undefined
    let endKey: string | undefined
    const singleKeys: string[] = []

    for (const name of unique) {
        const kind = classifyDateParameter(name)
        if (kind === 'start') {
            startKey = name
        } else if (kind === 'end') {
            endKey = name
        } else if (kind === 'single') {
            singleKeys.push(name)
        }
    }

    if (startKey && endKey) {
        return {startKey, endKey, singleKeys}
    }

    if (singleKeys.length > 0) {
        return {startKey, endKey, singleKeys}
    }

    return null
}

export function formatDateYmd(date: Date): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

function startOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1)
}

function endOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

export function resolveDatePresetRange(preset: DatePresetId, baseDate = new Date()): { start: string; end: string } {
    const today = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate())

    switch (preset) {
        case 'today':
            return {start: formatDateYmd(today), end: formatDateYmd(today)}
        case 'last7days': {
            const start = new Date(today)
            start.setDate(start.getDate() - 6)
            return {start: formatDateYmd(start), end: formatDateYmd(today)}
        }
        case 'mtd':
            return {start: formatDateYmd(startOfMonth(today)), end: formatDateYmd(today)}
        case 'lastMonth': {
            const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
            return {
                start: formatDateYmd(startOfMonth(lastMonth)),
                end: formatDateYmd(endOfMonth(lastMonth)),
            }
        }
        default:
            return {start: formatDateYmd(today), end: formatDateYmd(today)}
    }
}

export function applyDatePresetToValues(
    preset: DatePresetId,
    values: Record<string, string>,
    binding: DateParameterBinding,
): Record<string, string> {
    const range = resolveDatePresetRange(preset)
    const next = {...values}

    if (binding.startKey && binding.endKey) {
        next[binding.startKey] = range.start
        next[binding.endKey] = range.end
        return next
    }

    const fillValue = preset === 'lastMonth' ? range.end : range.end
    for (const key of binding.singleKeys) {
        next[key] = fillValue
    }
    return next
}
