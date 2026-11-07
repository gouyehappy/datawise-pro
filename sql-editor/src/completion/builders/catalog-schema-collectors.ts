import type {SqlEditorSchema} from '@sql-editor/types'
import {
    catalogUsesSchemaLevel,
    parseFromJoinQualifiedInput,
    resolveSchemasForCatalogKey,
    resolveTableScopeFromSegments,
} from '@sql-editor/utils/from-qualified-input'
import {resolveDatabaseScopeEntry} from '@sql-editor/utils/qualified-database-scopes'
import {tableCompletionInsertText} from '@sql-editor/utils/alias'
import {commentForTable} from '@sql-editor/utils/schema-columns'
import {getSqlEditorShowColumnCommentInSuggest} from '@sql-editor/config/snippets/cache'
import type {SqlCompletionContext} from '../context'
import {
    categoryCompletionLabel,
    completionItemKind,
    tableCompletionLabel,
} from '../completion-labels'
import {buildFilterText} from '../filter-text'
import {completionSort} from './sort-state'
import type {SuggestEditorSlice, SuggestPush, SuggestTextRange} from '../suggest-types'
import {localeT} from './collector-locale'

const TRIGGER_SUGGEST_COMMAND = {id: 'editor.action.triggerSuggest', title: 'Trigger Suggest'} as const

/** @deprecated use parseFromJoinQualifiedInput */
export function parseQualifiedTablePrefix(tablePrefix: string): {
    parts: string[]
    trailingDot: boolean
} {
    const parsed = parseFromJoinQualifiedInput(tablePrefix)
    return {parts: parsed.segments, trailingDot: parsed.trailingDot}
}

function resolveTablesForScope(schema: SqlEditorSchema, databaseScope: string): string[] {
    const bundle = resolveDatabaseScopeEntry(schema.tablesByDatabase, databaseScope)
    return bundle?.tables ?? []
}

function matchesLocalPrefix(value: string, localPartial: string): boolean {
    if (!localPartial) return true
    return value.toLowerCase().startsWith(localPartial.toLowerCase())
}

function pushCatalogSuggestions(
    schema: SqlEditorSchema,
    push: SuggestPush,
    range: SuggestTextRange,
    prefix: string,
    localPartial: string,
    startIndex: number,
): number {
    let index = startIndex
    for (const catalog of schema.catalogs ?? []) {
        if (!matchesLocalPrefix(catalog, localPartial || prefix)) continue
        push({
            label: categoryCompletionLabel(catalog, localeT('completion.badge.catalog')),
            kind: completionItemKind('catalog'),
            insertText: catalog,
            detail: localeT('completion.type.catalog'),
            filterText: buildFilterText(catalog, ['catalog']),
            range,
            sortText: completionSort('table', index++),
            preselect: index === startIndex + 1,
        })
    }
    return index
}

function pushSchemaSuggestions(
    schema: SqlEditorSchema,
    push: SuggestPush,
    range: SuggestTextRange,
    catalog: string,
    localPartial: string,
    startIndex: number,
): number {
    let index = startIndex
    for (const schemaName of resolveSchemasForCatalogKey(schema.schemasByCatalog, catalog)) {
        if (!matchesLocalPrefix(schemaName, localPartial)) continue
        push({
            label: categoryCompletionLabel(schemaName, localeT('completion.badge.schema')),
            kind: completionItemKind('schema'),
            insertText: schemaName,
            detail: `${catalog}.${schemaName}`,
            filterText: buildFilterText(schemaName, [catalog, 'schema']),
            range,
            sortText: completionSort('table', index++),
            preselect: index === startIndex + 1,
        })
    }
    return index
}

type TableInsertContext = {
    line: string
    sql: string
    cursorOffset: number
    aliases: Record<string, string>
    /** DDL / INSERT 等强制仅表名 */
    nameOnly?: boolean
}

function pushTableSuggestionsForScope(
    schema: SqlEditorSchema,
    push: SuggestPush,
    range: SuggestTextRange,
    databaseScope: string,
    localPartial: string,
    startIndex: number,
    insertCtx?: TableInsertContext,
): number {
    let index = startIndex
    for (const table of resolveTablesForScope(schema, databaseScope)) {
        if (!matchesLocalPrefix(table, localPartial)) continue
        const nameOnly = insertCtx?.nameOnly === true
        const {insertText, detail} = insertCtx
            ? tableCompletionInsertText(
                table,
                insertCtx.line,
                range.endColumn,
                insertCtx.aliases,
                insertCtx.sql,
                insertCtx.cursorOffset,
                nameOnly ? {insertMode: 'name-only'} : undefined,
            )
            : {insertText: table, detail: ''}
        // FROM/JOIN：别名后留空格并链式再弹（与扁平表补全一致）
        const chainedText =
            nameOnly || !insertCtx || insertText.endsWith(' ')
                ? insertText
                : `${insertText} `
        const rightDetail = [detail || null].filter(Boolean).join(' | ')
        push({
            label: tableCompletionLabel(
                table,
                localeT('completion.badge.table'),
                undefined,
                databaseScope,
                rightDetail || undefined,
                {
                    comment: commentForTable(schema, table),
                    showComment: getSqlEditorShowColumnCommentInSuggest(),
                },
            ),
            kind: completionItemKind('table'),
            insertText: chainedText,
            detail: [rightDetail || null, databaseScope].filter(Boolean).join(' | ') || databaseScope,
            filterText: buildFilterText(table, [databaseScope, localPartial, insertText]),
            range,
            sortText: completionSort('table', index++),
            preselect: index === startIndex + 1,
            command: nameOnly || !insertCtx ? undefined : TRIGGER_SUGGEST_COMMAND,
        })
    }
    return index
}

export function collectCatalogSchemaSuggestions(
    ctx: SqlCompletionContext,
    push: SuggestPush,
    range: SuggestTextRange,
    prefix: string,
    schema: SqlEditorSchema,
    editor?: SuggestEditorSlice,
    options?: {nameOnly?: boolean},
) {
    if (ctx.slot !== 'from' && ctx.slot !== 'join') return
    if (!schema.catalogs?.length) return

    const qualifiedInput = ctx.fromJoin?.tablePrefix || prefix
    const {segments, trailingDot, localPartial} = parseFromJoinQualifiedInput(qualifiedInput)
    let index = 0

    const insertCtx: TableInsertContext | undefined = editor
        ? {
            line: editor.lineAtRange,
            sql: editor.fullSql,
            cursorOffset: editor.cursorOffset,
            aliases: ctx.aliases,
            nameOnly: options?.nameOnly,
        }
        : undefined

    const pushTables = (databaseScope: string, partial: string) =>
        pushTableSuggestionsForScope(
            schema,
            push,
            range,
            databaseScope,
            partial,
            index,
            insertCtx,
        )

    // FROM → catalog
    if (segments.length === 0) {
        pushCatalogSuggestions(schema, push, range, prefix, localPartial || prefix, index)
        return
    }

    const catalog = segments[0]

    // FROM hive / hive（未带点）
    if (segments.length === 1 && !trailingDot) {
        pushCatalogSuggestions(schema, push, range, prefix, catalog, index)
        return
    }

    // FROM hive. 或 admin_db.
    if (segments.length === 1 && trailingDot) {
        if (catalogUsesSchemaLevel(schema, catalog)) {
            pushSchemaSuggestions(schema, push, range, catalog, localPartial, index)
            return
        }
        pushTables(catalog, localPartial)
        return
    }

    // FROM hive.a003 或 admin_db.users
    if (segments.length === 2 && !trailingDot) {
        if (catalogUsesSchemaLevel(schema, catalog)) {
            pushSchemaSuggestions(schema, push, range, catalog, segments[1], index)
            return
        }
        const scope = resolveTableScopeFromSegments(schema, segments)
        if (scope) pushTables(scope, segments[1])
        return
    }

    // FROM hive.a003.
    if (segments.length === 2 && trailingDot) {
        const databaseScope = `${segments[0]}.${segments[1]}`
        pushTables(databaseScope, localPartial)
        return
    }

    // FROM hive.a003.table 或 admin_db.users
    if (segments.length >= 3) {
        if (catalogUsesSchemaLevel(schema, catalog)) {
            const databaseScope = `${segments[0]}.${segments[1]}`
            const tablePartial = segments.slice(2).join('.')
            pushTables(databaseScope, tablePartial)
            return
        }
        const scope = resolveTableScopeFromSegments(schema, segments)
        if (scope) {
            const tablePartial = segments.slice(1).join('.')
            pushTables(scope, tablePartial)
        }
    }
}
