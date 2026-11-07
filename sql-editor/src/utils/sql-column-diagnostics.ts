import {maskNonCodeRegions} from '@sql-editor/completion/sql-scan'
import {parseCteAliasesVisibleAt, parseTableAliases, statementBoundsAtOffset} from '@sql-editor/utils/parse-references'
import {findKnownTable, tableBaseNameFromRef, unquoteTableIdent} from '@sql-editor/utils/table-reference'
import type {SqlColumnMeta, SqlEditorSchema} from '@sql-editor/types'
import {sqlEditorT} from '@sql-editor/i18n'
import {getActiveSqlEditorRuntime} from '@sql-editor/runtime/sql-editor-runtime'

export type SqlColumnDiagnosticCode = 'unknown_column' | 'unknown_table'

export interface SqlColumnDiagnostic {
    line: number
    column: number
    endColumn: number
    message: string
    code: SqlColumnDiagnosticCode
}

const QUALIFIED_COLUMN_PATTERN = /(`(?:[^`]|``)+`|"[^"]+"|\[[^\]]+\]|[A-Za-z_][\w$]*)\.(`(?:[^`]|``)+`|"[^"]+"|\[[^\]]+\]|[A-Za-z_][\w$]*)\b/g

function offsetToPosition(text: string, offset: number): {line: number; column: number} {
    const clamped = Math.max(0, Math.min(offset, text.length))
    const before = text.slice(0, clamped)
    const lines = before.split('\n')
    return {
        line: lines.length,
        column: (lines[lines.length - 1]?.length ?? 0) + 1,
    }
}

function columnNamesForTable(schema: SqlEditorSchema, tableName: string): Set<string> {
    const candidates = [
        tableName,
        tableBaseNameFromRef(tableName),
        ...Object.keys(schema.columns).filter((key) => key.toLowerCase() === tableName.toLowerCase()),
        ...Object.keys(schema.columns).filter(
            (key) => tableBaseNameFromRef(key).toLowerCase() === tableBaseNameFromRef(tableName).toLowerCase(),
        ),
    ]
    for (const candidate of candidates) {
        const columns = schema.columns[candidate] ?? schema.columns[candidate.toLowerCase()]
        if (!columns?.length) continue
        return new Set(columns.map((column: SqlColumnMeta) => column.name.toLowerCase()))
    }
    return new Set<string>()
}

function resolveAliasTable(
    alias: string,
    aliases: Record<string, string>,
): string | null {
    const key = alias.toLowerCase()
    return aliases[key] ?? aliases[alias] ?? null
}

function diagnosticMessage(code: SqlColumnDiagnosticCode, params: Record<string, string>): string {
    const locale = getActiveSqlEditorRuntime().getLocale()
    return sqlEditorT(locale, `diagnostics.${code}`, params)
}

function iterateStatements(sql: string): Array<{start: number; text: string}> {
    const statements: Array<{start: number; text: string}> = []
    let offset = 0
    while (offset < sql.length) {
        while (offset < sql.length && /\s/.test(sql[offset]!)) offset += 1
        if (offset >= sql.length) break
        const bounds = statementBoundsAtOffset(sql, offset)
        if (bounds.text.trim()) {
            statements.push({start: bounds.start, text: bounds.text})
        }
        if (bounds.end >= sql.length) break
        offset = bounds.end + (sql[bounds.end] === ';' ? 1 : 0)
    }
    if (!statements.length && sql.trim()) {
        statements.push({start: 0, text: sql})
    }
    return statements
}

/** FROM/JOIN/UPDATE/INTO 后的限定表名（如 db.table），不是 alias.column */
function isTableReferencePosition(masked: string, matchStart: number): boolean {
    const before = masked.slice(0, matchStart)
    if (/\b(?:FROM|(?:INNER|LEFT|RIGHT|FULL|CROSS)\s+JOIN|JOIN|UPDATE|INTO)\s*$/i.test(before)) {
        return true
    }
    const fromIndex = before.search(/\bFROM\b/i)
    if (fromIndex < 0) return false
    const tail = before.slice(fromIndex)
    if (/\bWHERE\b/i.test(tail)) return false
    if (/\b(?:GROUP|ORDER|HAVING)\s+BY\b/i.test(tail)) return false
    return /,\s*$/i.test(before)
}

/** schema.table 限定表名，避免误判为 alias.column */
function isQualifiedTableReference(
    alias: string,
    column: string,
    schema: SqlEditorSchema,
): boolean {
    const qualified = `${alias}.${column}`
    if (findKnownTable(qualified, schema.tables)) return true
    if (findKnownTable(column, schema.tables)) return true
    const scopeKey = alias.toLowerCase()
    const bundles = schema.tablesByDatabase ?? {}
    if (Object.prototype.hasOwnProperty.call(bundles, scopeKey)) return true
    if (Object.keys(bundles).some((key) => key.toLowerCase() === scopeKey)) return true
    return false
}

/** 校验 alias.column 引用是否存在（仅 schema 已加载时） */
export function collectSqlColumnDiagnostics(sql: string, schema: SqlEditorSchema): SqlColumnDiagnostic[] {
    if (!schema.tables.length || !sql.trim()) return []

    const diagnostics: SqlColumnDiagnostic[] = []
    const statements = iterateStatements(sql)

    for (const statement of statements) {
        const masked = maskNonCodeRegions(statement.text)
        const tableAliases = parseTableAliases(masked, schema.tables)
        const cteAliases = parseCteAliasesVisibleAt(masked, masked.length, masked)
        const aliases = {...tableAliases, ...cteAliases}

        QUALIFIED_COLUMN_PATTERN.lastIndex = 0
        let match: RegExpExecArray | null
        while ((match = QUALIFIED_COLUMN_PATTERN.exec(masked)) !== null) {
            const alias = unquoteTableIdent(match[1])
            const column = unquoteTableIdent(match[2])

            if (isTableReferencePosition(masked, match.index)) continue
            if (isQualifiedTableReference(alias, column, schema)) continue

            const table = resolveAliasTable(alias, aliases)
            const absoluteOffset = statement.start + match.index
            const start = offsetToPosition(sql, absoluteOffset)
            const end = offsetToPosition(sql, absoluteOffset + match[0].length)

            if (!table) {
                diagnostics.push({
                    line: start.line,
                    column: start.column,
                    endColumn: end.column,
                    code: 'unknown_table',
                    message: diagnosticMessage('unknown_table', {alias}),
                })
                continue
            }

            const columns = columnNamesForTable(schema, table)
            if (columns.size && !columns.has(column.toLowerCase())) {
                diagnostics.push({
                    line: start.line,
                    column: start.column,
                    endColumn: end.column,
                    code: 'unknown_column',
                    message: diagnosticMessage('unknown_column', {alias, column, table}),
                })
            }
        }
    }

    return diagnostics
}
