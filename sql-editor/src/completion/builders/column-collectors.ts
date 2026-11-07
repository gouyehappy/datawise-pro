import type {SqlColumnMeta} from '@sql-editor/types'
import {listQueryAliases, preferredAlias} from '@sql-editor/utils/alias'
import {columnDocumentation, columnsForTable} from '@sql-editor/utils/schema-columns'
import {buildExpandedColumnList} from '@sql-editor/utils/expand-columns'
import {filterColumnsForCompletion} from '../schema-column-index'
import {columnNameInitials} from '../column-fuzzy'
import {isColumnAlreadySelected, selectedColumnRefs} from '@sql-editor/utils/selected-columns'
import {tablesReferencedInQuery} from '../context'
import type {SqlCompletionContext} from '../context'
import {isFkColumn} from '../predicate-column'
import {shouldSuggestAliasComplete, shouldSuggestAliasDotStar, shouldSuggestColumns} from '../suggestion-policy'
import {
    categoryCompletionLabel,
    columnCompletionLabel,
    completionItemKind,
} from '../completion-labels'
import {collectGroupByColumnSuggestions, collectOrderByColumnSuggestions} from '../clause-columns'
import {detectSelectAliasDraft, orderBySelectItems} from '../select-list'
import {buildFilterText, matchesCompletionPrefix as matchPrefix} from '../filter-text'
import {completionSort} from './sort-state'
import type {SuggestItem, SuggestTextRange} from '../suggest-types'
import {getSqlEditorShowColumnCommentInSuggest} from '@sql-editor/config/snippets/cache'
import {
    columnInsertText,
    columnSortBoost,
    getSchemaContext,
    localeT,
    typeT,
    uniqueTables,
} from './collector-locale'

function selectAliasDraft(ctx: SqlCompletionContext) {
    if (ctx.slot !== 'select_list') return null
    return detectSelectAliasDraft(ctx.segment)
}

/** 别名 → 表；或 `orders.` 这类表名限定符 */
function resolveQualifierToTable(qualifier: string, ctx: SqlCompletionContext): string | null {
    const key = qualifier.toLowerCase()
    if (ctx.aliases[key]) return ctx.aliases[key]
    const inQuery = tablesReferencedInQuery(ctx)
    const fromQuery = inQuery.find((t) => t.toLowerCase() === key)
    if (fromQuery) return fromQuery
    const schema = getSchemaContext()
    return schema.tables.find((t) => t.toLowerCase() === key) ?? null
}

/**
 * `t1.` / `orders.` / `t1.pro`：已锁定限定符，只出该表字段。
 * 限定符无法解析时仍锁定为空（不出其它表列）。
 */
function resolveOpenAliasColumnRef(
    ctx: SqlCompletionContext,
    lineBeforeCursor?: string,
): {
    qualifier: string
    table: string
    columnPrefix: string
} | null {
    if (ctx.slot === 'column_ref' && ctx.qualifier) {
        const table =
            ctx.resolvedTable ??
            resolveQualifierToTable(ctx.qualifier, ctx) ??
            ''
        return {
            qualifier: ctx.qualifier,
            table,
            columnPrefix: ctx.columnPrefix ?? '',
        }
    }

    // 优先用光标行：比 segment 更贴近 Monaco 正在过滤的文本
    const tails = [lineBeforeCursor, ctx.segment]
        .filter((v): v is string => Boolean(v))
        .map((v) => v.replace(/[\r\n]+$/, ''))

    for (const tail of tails) {
        // `alias.` / `alias.*`（点后可有空白）
        const open = /\b([A-Za-z_][\w$]*)\.(?:\*|)\s*$/.exec(tail)
        if (open) {
            const qualifier = open[1]
            const table = resolveQualifierToTable(qualifier, ctx) ?? ''
            const columnPrefix = /\.\*\s*$/.test(tail) ? '*' : ''
            return {qualifier, table, columnPrefix}
        }
        // `alias.col` 正在输入字段前缀（无尾随空白，避免完成态 `alias.col `）
        const partial = /\b([A-Za-z_][\w$]*)\.(\w+)$/.exec(tail)
        if (!partial) continue
        const qualifier = partial[1]
        const table = resolveQualifierToTable(qualifier, ctx) ?? ''
        return {qualifier, table, columnPrefix: partial[2] ?? ''}
    }
    return null
}

function pushTableColumns(
    push: (item: SuggestItem) => void,
    range: SuggestTextRange,
    table: string,
    qualifier: string | undefined,
    columnPrefix: string,
    ctx: SqlCompletionContext,
) {
    if (columnPrefix === '*') return
    const schema = getSchemaContext()
    const cols = columnsForTable(schema, table)
    let index = 0
    let first = true
    const inQuery = tablesReferencedInQuery(ctx)
    for (const meta of filterColumnsForCompletion(cols, columnPrefix)) {
        push({
            label: columnCompletionLabel(meta.name, meta, typeT('column'), undefined, {
                showComment: getSqlEditorShowColumnCommentInSuggest(),
                fk: isFkColumn(meta, table, inQuery, schema.foreignKeys),
            }),
            kind: completionItemKind('column'),
            insertText: meta.name,
            // 二级面板单独用 documentation 卡片，避免 header 再刷 type·PK
            documentation: {
                value: columnDocumentation(meta, table),
                isTrusted: true,
            },
            // 始终带上别名 + 缩写，兼容 Monaco 过滤与 ct→create_time
            filterText: buildFilterText(meta.name, [
                qualifier ?? '',
                table,
                qualifier ? `${qualifier}.${meta.name}` : meta.name,
                columnNameInitials(meta.name),
            ]),
            range,
            sortText: completionSort(
                'column',
                columnSortBoost(meta, table, ctx, schema, new Set()) + index++,
            ),
            preselect: first,
        })
        first = false
    }
}

export function collectAliasDotStar(
    ctx: SqlCompletionContext,
    push: (item: SuggestItem) => void,
    range: SuggestTextRange,
    prefix: string,
    hasTables: boolean,
) {
    if (!shouldSuggestAliasDotStar(ctx.slot, hasTables)) return
    if (selectAliasDraft(ctx)) return
    // `t1.` 已锁定字段：Expand / t1.* 交给 starExpansion（且纯 alias. 时不展示）
    if (resolveOpenAliasColumnRef(ctx)) return

    const schema = getSchemaContext()
    const multiTable = tablesReferencedInQuery(ctx).length > 1
    const multiline = !ctx.signals.after_comma
    let index = 0

    for (const {alias, table} of listQueryAliases(ctx.aliases)) {
        const starLabel = `${alias}.*`
        // 不要用裸别名 `t1` 或 `t1.*` 的前缀命中——`t1` 应走 aliasComplete 插入 `t1.`
        // 仅空前缀 / `*` / 显式 `alias.*` / expand 关键字时展示
        const matchesPrefix =
            !prefix ||
            prefix === '*' ||
            (prefix.includes('.') && matchPrefix(starLabel, prefix)) ||
            matchPrefix('expand', prefix) ||
            matchPrefix('展开', prefix)
        if (!matchesPrefix) continue

        const cols = columnsForTable(schema, table)
        if (cols.length) {
            const expandLabel = localeT('completion.expand_label', {alias})
            push({
                label: categoryCompletionLabel(expandLabel, typeT('expand')),
                kind: completionItemKind('expand'),
                insertText: buildExpandedColumnList(cols, table, alias, multiTable, multiline),
                detail: localeT('completion.expand_detail', {count: cols.length}),
                filterText: buildFilterText(expandLabel, [alias, table, starLabel, '*', 'expand', '展开', 'star']),
                range,
                sortText: completionSort('expand', index),
                preselect: index === 0,
            })
            index++
        }

        push({
            label: categoryCompletionLabel(starLabel, typeT('alias')),
            kind: completionItemKind('alias'),
            insertText: starLabel,
            detail: localeT('completion.keep_asterisk', {table}),
            filterText: buildFilterText(starLabel, [alias, table, '*']),
            range,
            sortText: completionSort('alias', index++),
        })
    }
}

export function collectAliasComplete(
    ctx: SqlCompletionContext,
    push: (item: SuggestItem) => void,
    range: SuggestTextRange,
    prefix: string,
    hasTables: boolean,
) {
    if (ctx.slot === 'column_ref') return
    if (!shouldSuggestAliasComplete(ctx.slot, hasTables, ctx.signals.after_complete_column_ref)) return
    const aliasDraft = selectAliasDraft(ctx)
    if (aliasDraft) {
        if (!prefix || matchPrefix(aliasDraft.alias, prefix)) {
            push({
                label: categoryCompletionLabel(aliasDraft.alias, typeT('alias')),
                kind: completionItemKind('alias'),
                insertText: aliasDraft.alias,
                detail: aliasDraft.expression,
                filterText: buildFilterText(aliasDraft.alias, [aliasDraft.expression, 'alias']),
                range,
                sortText: completionSort('alias', 0),
                preselect: true,
            })
        }
        return
    }
    let index = 0
    for (const {alias, table} of listQueryAliases(ctx.aliases)) {
        if (!matchPrefix(alias, prefix)) continue
        push({
            label: categoryCompletionLabel(alias, typeT('alias')),
            kind: completionItemKind('alias'),
            insertText: `${alias}.`,
            detail: localeT('completion.alias_arrow', {table}),
            filterText: buildFilterText(alias, [table]),
            command: {id: 'editor.action.triggerSuggest', title: 'Trigger Suggest'},
            range,
            sortText: completionSort('alias', index++),
        })
    }
}

export function collectColumnSuggestions(
    ctx: SqlCompletionContext,
    push: (item: SuggestItem) => void,
    range: SuggestTextRange,
    prefix: string,
    hasTables: boolean,
    lineBeforeCursor?: string,
) {
    if (selectAliasDraft(ctx)) return

    // 完整 `alias.col` / SELECT 列项后：勿再推同名字段；交给 AS / 运算符阶段
    if (
        ctx.signals.after_complete_column_ref ||
        ctx.signals.after_select_list_complete_col ||
        ctx.signals.after_select_list_item
    ) {
        return
    }

    // `t1.` / `orders.` → 仅该表字段；限定符无效则空列表（不串其它表）
    const openRef = resolveOpenAliasColumnRef(ctx, lineBeforeCursor)
    if (openRef) {
        if (openRef.table) {
            pushTableColumns(push, range, openRef.table, openRef.qualifier, openRef.columnPrefix, ctx)
        }
        return
    }

    if (!shouldSuggestColumns(ctx.slot, hasTables, ctx.signals.after_complete_column_ref)) return

    if (ctx.slot === 'group_by') {
        // 有 SELECT 项用表达式/别名；SELECT * 等无具体项时回退 FROM 表字段
        if (collectGroupByColumnSuggestions(ctx, push, range, prefix)) return
    }
    if (ctx.slot === 'order_by') {
        collectOrderByColumnSuggestions(ctx, push, range, prefix)
        if (orderBySelectItems(ctx.segment).length > 0) return
    }

    const schema = getSchemaContext()
    let index = 0
    const chainComma = ctx.signals.after_comma && !prefix
    const alreadySelected = selectedColumnRefs(ctx.segment, ctx.slot)

    const tables = uniqueTables(tablesReferencedInQuery(ctx))
    const multiTable = tables.length > 1
    const inQuery = tables
    const pushedColumns = new Set<string>()
    const entries: { meta: SqlColumnMeta; table: string; sort: number }[] = []

    for (const table of tables) {
        for (const meta of filterColumnsForCompletion(columnsForTable(schema, table), prefix)) {
            const key = multiTable ? `${table}:${meta.name.toLowerCase()}` : meta.name.toLowerCase()
            if (pushedColumns.has(key)) continue
            pushedColumns.add(key)
            entries.push({
                meta,
                table,
                sort: columnSortBoost(meta, table, ctx, schema, alreadySelected) + index++,
            })
        }
    }

    entries.sort((a, b) => a.sort - b.sort || a.meta.name.localeCompare(b.meta.name))

    let first = chainComma
    for (const {meta, table, sort} of entries) {
        const alias = preferredAlias(table, ctx.aliases)
        const insertText = columnInsertText(meta.name, table, ctx, chainComma)
        if (isColumnAlreadySelected(meta.name, insertText, alreadySelected)) continue
        const tableSource = multiTable ? alias : undefined
        push({
            label: columnCompletionLabel(meta.name, meta, typeT('column'), tableSource, {
                showComment: getSqlEditorShowColumnCommentInSuggest(),
                fk: isFkColumn(meta, table, inQuery, schema.foreignKeys),
            }),
            kind: completionItemKind('column'),
            insertText,
            documentation: {
                value: columnDocumentation(meta, table),
                isTrusted: true,
            },
            filterText: buildFilterText(meta.name, [columnNameInitials(meta.name)]),
            range,
            sortText: completionSort('column', 100 + sort),
            preselect: first,
            command: chainComma
                ? {id: 'editor.action.triggerSuggest', title: 'Trigger Suggest'}
                : undefined,
        })
        first = false
    }
}

export function collectStarExpansion(
    ctx: SqlCompletionContext,
    push: (item: SuggestItem) => void,
    range: SuggestTextRange,
    prefix: string,
    hasTables: boolean,
    lineBeforeCursor?: string,
) {
    if (!hasTables) return
    if (ctx.slot === 'group_by' || ctx.slot === 'order_by') return
    if (selectAliasDraft(ctx)) return

    const schema = getSchemaContext()
    const tables = tablesReferencedInQuery(ctx)
    const multiTable = tables.length > 1
    const multiline = ctx.slot === 'select_list' && !ctx.signals.after_comma
    const wantStar = prefix === '*' || ctx.columnPrefix === '*'
    const openRef = resolveOpenAliasColumnRef(ctx, lineBeforeCursor)
    // `t1.` 锁定字段列表：不再塞 Expand / t1.*，避免占住补全框
    if (openRef && !wantStar && !openRef.columnPrefix) {
        return
    }

    const pushExpand = (alias: string, table: string, index: number, preselect = false) => {
        const cols = columnsForTable(schema, table)
        if (!cols.length) return
        const insertText = buildExpandedColumnList(cols, table, alias, multiTable, multiline)
        const label = localeT('completion.expand_label', {alias})
        push({
            label: categoryCompletionLabel(label, typeT('expand')),
            kind: completionItemKind('expand'),
            insertText,
            detail: localeT('completion.expand_detail_short', {count: cols.length, table}),
            filterText: buildFilterText(label, [alias, table, insertText, 'expand', 'star']),
            range,
            sortText: completionSort('expand', index),
            preselect,
        })
    }

    if (ctx.slot === 'column_ref' && ctx.resolvedTable && ctx.qualifier) {
        // alias.* 或已输入字段前缀时：展开项 + 保留 *；纯 alias. 由 columns 负责
        pushExpand(ctx.qualifier, ctx.resolvedTable, 0, wantStar)
        if (!wantStar) {
            const starLabel = `${ctx.qualifier}.*`
            push({
                label: categoryCompletionLabel(starLabel, typeT('alias')),
                kind: completionItemKind('alias'),
                insertText: starLabel,
                detail: localeT('completion.keep_asterisk', {table: ctx.resolvedTable}),
                filterText: buildFilterText(starLabel, [ctx.qualifier, ctx.resolvedTable, '*']),
                range,
                sortText: completionSort('alias', 1),
            })
        }
        return
    }

    if (ctx.slot !== 'select_list') return
    if (!wantStar && prefix) return

    let index = 0
    const aliasEntries = listQueryAliases(ctx.aliases)
    if (aliasEntries.length > 0) {
        for (const {alias, table} of aliasEntries) {
            pushExpand(alias, table, index++, index === 0 && wantStar)
        }
        return
    }

    if (tables.length === 1) {
        const table = tables[0]
        const alias = preferredAlias(table, ctx.aliases)
        pushExpand(alias, table, 0, wantStar)
    }
}
