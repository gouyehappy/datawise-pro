import type {SqlColumnMeta, SqlEditorSchema} from '@sql-editor/types'
import {getActiveSqlEditorRuntime} from '@sql-editor/runtime/sql-editor-runtime'
import {preferredAlias} from '@sql-editor/utils/alias'
import {tablesReferencedInQuery} from '../context'
import type {SqlCompletionContext} from '../context'
import {completionItemKind} from '../completion-labels'
import {isColumnAlreadySelected} from '@sql-editor/utils/selected-columns'
import {isFkColumn} from '../predicate-column'
import {columnNameSharedAcrossTables} from '@sql-editor/utils/schema-columns'
import {sqlEditorSuggestT} from '@sql-editor/i18n'

export function localeT(key: string, params?: Record<string, string | number>) {
    return sqlEditorSuggestT(key, params)
}

/** 主列表右侧短徽标（KW / TBL…）；无 badge 键时回退长类型名 */
export function typeT(category: Parameters<typeof completionItemKind>[0]) {
    const badge = localeT(`completion.badge.${category}`)
    if (badge && badge !== `completion.badge.${category}`) return badge
    return localeT(`completion.type.${category}`)
}

export function getSchemaContext(): SqlEditorSchema {
    return getActiveSqlEditorRuntime().getSchema()
}

export function uniqueTables(tables: string[]): string[] {
    const seen = new Set<string>()
    return tables.filter((table) => {
        const key = table.toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
    })
}

export function columnDetailPrefix(ctx: SqlCompletionContext, table: string): string {
    if (
        ctx.qualifier &&
        ctx.resolvedTable &&
        ctx.qualifier.toLowerCase() !== ctx.resolvedTable.toLowerCase()
    ) {
        return ctx.qualifier
    }
    return preferredAlias(table, ctx.aliases)
}

export function columnInsertText(
    column: string,
    table: string,
    ctx: SqlCompletionContext,
    chainComma = false,
): string {
    const alias = preferredAlias(table, ctx.aliases)
    const multiTable = tablesReferencedInQuery(ctx).length > 1
    let text = column
    if (ctx.slot !== 'column_ref') {
        text =
            multiTable || alias.toLowerCase() !== table.toLowerCase() ? `${alias}.${column}` : column
    }
    if (chainComma && (ctx.slot === 'select_list' || ctx.slot === 'group_by')) {
        return `${text},\n  `
    }
    return text
}

export function columnSortBoost(
    meta: SqlColumnMeta,
    table: string,
    ctx: SqlCompletionContext,
    schema: SqlEditorSchema,
    alreadySelected: Set<string>,
): number {
    let boost = 0
    if (meta.pk) boost -= 50
    if (ctx.signals.after_comma) boost -= 20
    const inQuery = tablesReferencedInQuery(ctx)
    if (isFkColumn(meta, table, inQuery, schema.foreignKeys)) boost -= 30
    // ON 子句：与另一表同名的列优先（配合 FK 条件）
    if (ctx.slot === 'on' && inQuery.length > 1) {
        if (columnNameSharedAcrossTables(schema, table, meta.name, inQuery)) boost -= 45
    }
    if (isColumnAlreadySelected(meta.name, meta.name, alreadySelected)) boost += 80
    return boost
}
