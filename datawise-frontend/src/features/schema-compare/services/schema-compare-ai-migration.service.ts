import type {DbType} from '@/core/types'
import {applySchemaCompareSelection} from '@/features/schema-compare/services/schema-compare-selection.service'
import type {SchemaCompareResult, SchemaScope, TableSchemaDiff} from '@/features/schema-compare/types/schema-compare.types'
import type {AppLocale} from '@/i18n'

export interface SchemaCompareAiMigrationSuggestion {
    up: string
    down: string
}

function formatTableDiff(table: TableSchemaDiff): string {
    const lines = [`- ${table.tableName} (${table.status})`]
    for (const column of table.columnDiffs) {
        const leftType = column.left?.dataType ?? '—'
        const rightType = column.right?.dataType ?? '—'
        lines.push(`  - ${column.name}: ${column.status} (${rightType} -> ${leftType})`)
    }
    return lines.join('\n')
}

export function formatSchemaCompareDiffSummary(
    result: SchemaCompareResult,
    selectedTables: ReadonlySet<string>,
    selectedColumnsByTable: ReadonlyMap<string, ReadonlySet<string>>,
): string {
    const selected = applySchemaCompareSelection(
        result.tableDiffs,
        selectedTables,
        selectedColumnsByTable,
    )
    if (!selected.length) return 'No selected schema changes.'
    return selected.map(formatTableDiff).join('\n')
}

export function buildSchemaCompareAiMigrationPrompt(input: {
    left: SchemaScope
    right: SchemaScope
    baselineDdl: string
    diffSummary: string
    locale: AppLocale
}): string {
    const language = input.locale === 'zh-CN' ? 'Chinese comments allowed' : 'English comments preferred'
    return [
        'Generate ordered database migration scripts to update the TARGET schema to match the REFERENCE schema.',
        `Reference (left): ${input.left.connectionLabel} / ${input.left.database} (${input.left.dbType})`,
        `Target (right): ${input.right.connectionLabel} / ${input.right.database} (${input.right.dbType})`,
        '',
        'Selected diff summary:',
        input.diffSummary,
        '',
        'Deterministic baseline UP script (improve ordering/wording if needed, keep semantics):',
        '```sql',
        input.baselineDdl.trim() || '-- empty',
        '```',
        '',
        'Reply with exactly two SQL sections using these markers on their own lines:',
        '-- UP',
        '<statements to apply on TARGET>',
        '-- DOWN',
        '<statements to rollback UP>',
        '',
        `Use ${input.right.dbType} dialect for TARGET. ${language}. No markdown fences in output.`,
    ].join('\n')
}

export function parseSchemaCompareAiMigrationReply(raw: string): SchemaCompareAiMigrationSuggestion | null {
    const trimmed = raw.trim()
    if (!trimmed) return null

    const upMatch = trimmed.match(/--\s*UP\s*\r?\n([\s\S]*?)(?=--\s*DOWN\s*\r?\n|$)/i)
    const downMatch = trimmed.match(/--\s*DOWN\s*\r?\n([\s\S]*?)$/i)
    const up = upMatch?.[1]?.trim() ?? ''
    const down = downMatch?.[1]?.trim() ?? ''

    if (!up && !down) {
        return {up: trimmed, down: ''}
    }
    if (!up) return null
    return {up, down}
}

export function resolveSchemaCompareTargetDbType(scope: SchemaScope | null | undefined): DbType | undefined {
    return scope?.dbType
}
