import {
    collectSqlColumnDiagnostics,
    type SqlColumnDiagnostic,
} from '@datawise/sql-editor/utils/sql-column-diagnostics'
import type {SqlEditorSchema} from '@datawise/sql-editor/types'

export type PreExecuteDiagnostic = SqlColumnDiagnostic

/** 执行前对即将运行的 SQL 做表/列轻量诊断（不阻断方言语法） */
export function collectPreExecuteDiagnostics(
    sql: string,
    schema: SqlEditorSchema | null | undefined,
): PreExecuteDiagnostic[] {
    const trimmed = sql.trim()
    if (!trimmed || !schema?.tables.length) return []
    return collectSqlColumnDiagnostics(trimmed, schema)
}

/** 诊断行号（相对可执行 SQL）映射到编辑器绝对行 */
export function mapDiagnosticToEditorLine(
    diagnosticLine: number,
    anchorLine?: number | null,
): number {
    if (diagnosticLine < 1) return 1
    if (anchorLine == null || anchorLine < 1) return diagnosticLine
    return anchorLine + diagnosticLine - 1
}

export function summarizePreExecuteDiagnostics(diagnostics: PreExecuteDiagnostic[]): {
    count: number
    firstMessage: string
    firstLine: number
} | null {
    const first = diagnostics[0]
    if (!first) return null
    return {
        count: diagnostics.length,
        firstMessage: first.message,
        firstLine: first.line,
    }
}
