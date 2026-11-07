function tryParseJson(raw: string): unknown | undefined {
    try {
        return JSON.parse(raw)
    } catch {
        return undefined
    }
}

function unescapeLiteralEscapes(raw: string): string {
    return raw
        .replace(/\\\\/g, '\u0000')
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\r/g, '\r')
        .replace(/\\"/g, '"')
        .replace(/\u0000/g, '\\')
}

function formatParsedValue(value: unknown): string {
    return JSON.stringify(value, null, 2)
}

export function tryFormatMessageValue(raw: string | null | undefined): string {
    if (raw == null || raw === '') return ''
    const trimmed = raw.trim()

    let candidate = trimmed
    for (let depth = 0; depth < 3; depth++) {
        const parsed = tryParseJson(candidate)
        if (parsed === undefined) break
        if (typeof parsed === 'object' && parsed !== null) {
            return formatParsedValue(parsed)
        }
        if (typeof parsed === 'string') {
            candidate = parsed.trim()
            continue
        }
        break
    }

    if (candidate.startsWith('{') || candidate.startsWith('[')) {
        const parsed = tryParseJson(candidate)
        if (parsed !== undefined && typeof parsed === 'object' && parsed !== null) {
            return formatParsedValue(parsed)
        }

        const unescaped = unescapeLiteralEscapes(candidate)
        const reparsed = tryParseJson(unescaped.trim())
        if (reparsed !== undefined && typeof reparsed === 'object' && reparsed !== null) {
            return formatParsedValue(reparsed)
        }
    }

    return raw
}

export function isStructuredMessageValue(raw: string | null | undefined): boolean {
    if (!raw?.trim()) return false
    const formatted = tryFormatMessageValue(raw)
    return formatted !== raw.trim() && (formatted.startsWith('{') || formatted.startsWith('['))
}

export function formatMessageTimestamp(value: number): string {
    if (!value) return '—'
    const date = new Date(value)
    const datePart = date.toLocaleDateString()
    const timePart = date.toLocaleTimeString()
    return `${datePart} ${timePart}`
}

export function truncateText(text: string, max = 48): string {
    if (text.length <= max) return text
    return `${text.slice(0, max)}…`
}

export function summarizeMessageValue(raw: string | null | undefined, max = 96): string {
    const formatted = tryFormatMessageValue(raw)
    const oneLine = formatted.replace(/\s+/g, ' ').trim()
    return truncateText(oneLine, max)
}
