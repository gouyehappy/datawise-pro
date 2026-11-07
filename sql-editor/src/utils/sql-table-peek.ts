import {
    parseCteNames,
    parseTableAliases,
    statementBoundsAtOffset,
} from '@sql-editor/utils/parse-references'
import {sqlScanModeAt} from '@sql-editor/completion/sql-scan'
import {
    resolveKnownTableRef,
    unquoteTableIdent,
} from '@sql-editor/utils/table-reference'
import type {SqlEditorSchema} from '@sql-editor/types'

export type SqlTablePeekPayload = {
    tableName: string
    tableId?: string
    catalog?: string
    startOffset: number
    endOffset: number
}

const IDENT_CHAR = /[A-Za-z0-9_$\u0080-\uFFFF]/

function isQuoteChar(ch: string | undefined): boolean {
    return ch === '`' || ch === '"' || ch === "'" || ch === '[' || ch === ']'
}

function isIdentPart(ch: string | undefined): boolean {
    if (!ch) return false
    return IDENT_CHAR.test(ch) || ch === '.' || isQuoteChar(ch)
}

function isNonCodeMode(mode: ReturnType<typeof sqlScanModeAt>): boolean {
    return mode === 'lineComment'
        || mode === 'blockComment'
        || mode === 'single'
        || mode === 'double'
        || mode === 'dollar'
}

/** Split `hive`.`a003`.`test` / hive.a003.test into unquoted parts. */
export function splitQualifiedIdent(raw: string): string[] {
    const parts: string[] = []
    let i = 0
    const text = raw.trim()
    while (i < text.length) {
        while (i < text.length && text[i] === '.') i++
        if (i >= text.length) break
        const q = text[i]
        if (q === '`' || q === '"' || q === "'") {
            i++
            const start = i
            while (i < text.length && text[i] !== q) i++
            parts.push(text.slice(start, i))
            if (i < text.length && text[i] === q) i++
            continue
        }
        if (q === '[') {
            i++
            const start = i
            while (i < text.length && text[i] !== ']') i++
            parts.push(text.slice(start, i))
            if (i < text.length && text[i] === ']') i++
            continue
        }
        const start = i
        while (i < text.length && text[i] !== '.') i++
        parts.push(unquoteTableIdent(text.slice(start, i)))
    }
    return parts.filter(Boolean)
}

export function identifierSpanAtOffset(sql: string, offset: number): {start: number; end: number; text: string} | null {
    if (!sql) return null
    const clamped = Math.max(0, Math.min(offset, sql.length))
    let i = clamped
    if (i >= sql.length || !isIdentPart(sql[i])) i = clamped - 1
    if (i < 0 || !isIdentPart(sql[i])) return null
    if (isNonCodeMode(sqlScanModeAt(sql, i))) return null

    let start = i
    let end = i + 1
    while (start > 0 && isIdentPart(sql[start - 1]) && !isNonCodeMode(sqlScanModeAt(sql, start - 1))) {
        start--
    }
    while (end < sql.length && isIdentPart(sql[end]) && !isNonCodeMode(sqlScanModeAt(sql, end))) {
        end++
    }
    const text = sql.slice(start, end).trim()
    if (!text) return null
    return {start, end, text}
}

export function findSchemaTableId(schema: Pick<SqlEditorSchema, 'tablesByDatabase'>, tableName: string): string | undefined {
    const bundles = schema.tablesByDatabase
    if (!bundles) return undefined
    const lower = tableName.toLowerCase()
    for (const bundle of Object.values(bundles)) {
        const direct = bundle.tableIds?.[tableName]
        if (direct) return direct
        for (const [name, id] of Object.entries(bundle.tableIds ?? {})) {
            if (name.toLowerCase() === lower) return id
        }
    }
    return undefined
}

/**
 * Resolve a table (or FROM/JOIN alias) at a SQL offset against the editor schema.
 * CTE names are ignored so they do not open a physical table tab.
 */
export function resolveSqlTablePeekAtOffset(
    sql: string,
    offset: number,
    schema: Pick<SqlEditorSchema, 'tables' | 'tableCatalogs' | 'tablesByDatabase'>,
): SqlTablePeekPayload | null {
    const knownTables = schema.tables ?? []
    if (!knownTables.length) return null

    const span = identifierSpanAtOffset(sql, offset)
    if (!span) return null

    const parts = splitQualifiedIdent(span.text)
    if (!parts.length) return null

    const bounds = statementBoundsAtOffset(sql, offset)
    const ctes = parseCteNames(bounds.text)
    const aliases = parseTableAliases(bounds.text, knownTables)

    const first = parts[0]
    const last = parts[parts.length - 1]
    const firstLower = first.toLowerCase()

    if (parts.length === 1 && ctes.has(firstLower)) return null

    const aliasTable = aliases[firstLower]
    const fromAlias = aliasTable
        ? resolveKnownTableRef(aliasTable, knownTables, schema)
        : null
    const fromRef = resolveKnownTableRef(parts.join('.'), knownTables, schema)
        ?? resolveKnownTableRef(last, knownTables, schema)

    const tableName = fromAlias ?? fromRef
    if (!tableName) return null

    return {
        tableName,
        tableId: findSchemaTableId(schema, tableName),
        catalog: schema.tableCatalogs?.[tableName],
        startOffset: span.start,
        endOffset: span.end,
    }
}
