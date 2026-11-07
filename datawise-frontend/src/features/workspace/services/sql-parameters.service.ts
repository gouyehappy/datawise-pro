const NAMED_PARAM_RE = /(?<!['"`]):([a-zA-Z_][\w]*)/g
const TEMPLATE_PARAM_RE = /\$\{([a-zA-Z_][\w]*)\}/g

export function extractSqlParameters(sql: string): string[] {
    const names = new Set<string>()
    for (const match of sql.matchAll(NAMED_PARAM_RE)) {
        if (match[1]) names.add(match[1])
    }
    for (const match of sql.matchAll(TEMPLATE_PARAM_RE)) {
        if (match[1]) names.add(match[1])
    }
    return [...names]
}

function isNumericLiteral(value: string): boolean {
    const trimmed = value.trim()
    if (!trimmed) return false
    return /^-?\d+(\.\d+)?$/.test(trimmed)
}

function quoteSqlValue(value: string): string {
    return `'${value.replace(/'/g, "''")}'`
}

function formatParamValue(raw: string): string {
    const trimmed = raw.trim()
    if (trimmed.toUpperCase() === 'NULL') return 'NULL'
    if (isNumericLiteral(trimmed)) return trimmed
    return quoteSqlValue(trimmed)
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Replace `${name}` / quoted forms without producing doubled quotes. */
function replaceTemplateParam(sql: string, name: string, formatted: string): string {
    const id = escapeRegExp(name)
    let next = sql.replace(new RegExp(`'\\$\\{${id}\\}'`, 'g'), formatted)
    next = next.replace(new RegExp(`"\\$\\{${id}\\}"`, 'g'), formatted)
    next = next.replace(new RegExp(`\`\\$\\{${id}\\}\``, 'g'), formatted)
    next = next.replace(new RegExp(`\\$\\{${id}\\}`, 'g'), formatted)
    return next
}

/** Replace `:name` / quoted forms without producing doubled quotes. */
function replaceNamedParam(sql: string, name: string, formatted: string): string {
    const id = escapeRegExp(name)
    let next = sql.replace(new RegExp(`':${id}\\b'`, 'g'), formatted)
    next = next.replace(new RegExp(`":${id}\\b"`, 'g'), formatted)
    next = next.replace(new RegExp(`(?<![\\w'"\`]):${id}\\b`, 'g'), formatted)
    return next
}

export function applySqlParameters(
    sql: string,
    values: Record<string, string | undefined>,
): string {
    if (!sql.trim()) return sql

    let next = sql
    for (const [name, raw] of Object.entries(values)) {
        if (raw == null) continue
        const formatted = formatParamValue(raw)
        next = replaceTemplateParam(next, name, formatted)
        next = replaceNamedParam(next, name, formatted)
    }
    return next
}
