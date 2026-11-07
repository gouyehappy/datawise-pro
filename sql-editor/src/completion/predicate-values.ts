import type {SqlCompletionContext} from './context'
import {classifyColumnType} from './column-type'
import {
    hintCompletionPresentation,
    completionItemKind,
    formatSqlTypeHint,
    type CompletionDisplayCategory,
} from './completion-labels'
import {sortTextForProfile} from './completion-phase'
import {matchesCompletionPrefix, buildFilterText} from './filter-text'
import {resolvePredicateLeftColumn} from './predicate-column'
import {
    buildPredicateValueItems,
    detectValueTail,
    predicateColumnEnumValues,
} from './predicate-value-templates'
import type {SuggestPush, SuggestTextRange} from './suggest-types'
import {SUGGEST_INSERT_AS_SNIPPET} from './suggest-types'
import {sqlEditorSuggestT} from '@sql-editor/i18n'
import type {SqlEditorSchema} from '@sql-editor/types'

function localeT(key: string) {
    return sqlEditorSuggestT(key)
}

/** 枚举字面量 `'paid'` 也能被前缀 `pai` 命中 */
function matchesValueItemPrefix(label: string, insertText: string, prefix: string): boolean {
    if (matchesCompletionPrefix(label, prefix) || matchesCompletionPrefix(insertText, prefix)) {
        return true
    }
    const stripQuotes = (s: string) => s.replace(/^'(.*)'$/s, '$1').replace(/^"(.*)"$/s, '$1')
    const bareLabel = stripQuotes(label.trim())
    const bareInsert = stripQuotes(insertText.trim())
    if (bareLabel !== label && matchesCompletionPrefix(bareLabel, prefix)) return true
    if (bareInsert !== insertText && matchesCompletionPrefix(bareInsert, prefix)) return true
    return false
}

function valueBadge(kindKey: string): string {
    const badge = localeT(`completion.badge.${kindKey}`)
    if (badge && badge !== `completion.badge.${kindKey}`) return badge
    return localeT(`completion.type.${kindKey}`)
}

const FALLBACK_EQUALS_ITEMS = [
    {label: 'NULL', insertText: 'NULL', detailKey: 'completion.value.null', kind: 'value' as const},
    {
        label: 'abc',
        insertText: "'${1:value}'",
        detailKey: 'completion.value.string_template',
        snippet: true,
        kind: 'value_string' as const,
    },
    {
        label: '123',
        insertText: '${1:0}',
        detailKey: 'completion.value.numeric_template',
        snippet: true,
        kind: 'value_number' as const,
    },
]

/** = / LIKE / IN / IS 后：值与子查询，不展示 AND/OR 等谓词关键字 */
export function collectPredicateValueSuggestions(
    ctx: SqlCompletionContext,
    push: SuggestPush,
    range: SuggestTextRange,
    prefix: string,
    schema: SqlEditorSchema,
    knownTables: string[],
) {
    // 停在运算符后，或右值打了一半（detectValueTail 覆盖）；兜底 equals 避免空列表
    const tail =
        detectValueTail(ctx.segment) ??
        (ctx.signals.after_predicate_operator ? 'equals' : null)
    if (!tail) return

    const left = resolvePredicateLeftColumn(ctx.segment, ctx.aliases, knownTables, schema)
    const columnKind = classifyColumnType(left?.meta.type)
    const enums = predicateColumnEnumValues(left?.meta)
    let items = buildPredicateValueItems(
        tail,
        columnKind,
        enums,
        left?.meta,
        localeT('completion.value.between_label'),
    )
    if (!items.length) items = [...FALLBACK_EQUALS_ITEMS]

    const typeBeside = formatSqlTypeHint(left?.meta.type)
    const typeHint = left?.meta.type ? ` · ${left.meta.type}` : ''

    let index = 0
    let first = true
    let pushed = 0
    for (const item of items) {
        if (prefix && !matchesValueItemPrefix(item.label, item.insertText, prefix)) {
            continue
        }
        const kindKey = (item.kind ?? 'value') as CompletionDisplayCategory
        const badge = valueBadge(kindKey)
        const hint = localeT(item.detailKey) + typeHint
        // 右侧短徽标 VAL/STR/NUM；列类型挂名称旁
        const presentation = hintCompletionPresentation(item.label, hint, badge, typeBeside)
        // ON 右侧列优先，字面量不抢 preselect；WHERE/SET 仍可预选枚举/类型模板
        const preselect =
            first &&
            !prefix &&
            ctx.slot !== 'on' &&
            (kindKey === 'value'
                ? true
                : columnKind === 'numeric' || columnKind === 'boolean'
                    ? kindKey === 'value_number'
                    : columnKind === 'string' || columnKind === 'temporal'
                        ? kindKey === 'value_string'
                        : kindKey === 'value_number')
        push({
            label: presentation.label,
            kind: completionItemKind(kindKey),
            insertText: item.insertText,
            insertTextRules: item.snippet ? SUGGEST_INSERT_AS_SNIPPET : undefined,
            detail: presentation.detail,
            documentation: presentation.documentation,
            filterText: buildFilterText(item.label, [hint, badge, left?.column ?? '']),
            range,
            // 字面量排在列/别名之后（column-first 下 keyword 档靠后）
            sortText: sortTextForProfile('column-first', 'keyword', 40 + index),
            preselect,
        })
        first = false
        index++
        pushed++
    }

    // 前缀把字面量全滤掉时仍给一个兜底，避免「只有列也没有、值也没有」的空档感
    if (!pushed && !prefix) {
        for (const item of FALLBACK_EQUALS_ITEMS) {
            const kindKey = (item.kind ?? 'value') as CompletionDisplayCategory
            const badge = valueBadge(kindKey)
            const hint = localeT(item.detailKey) + typeHint
            const presentation = hintCompletionPresentation(item.label, hint, badge, typeBeside)
            push({
                label: presentation.label,
                kind: completionItemKind(kindKey),
                insertText: item.insertText,
                insertTextRules: item.snippet ? SUGGEST_INSERT_AS_SNIPPET : undefined,
                detail: presentation.detail,
                documentation: presentation.documentation,
                filterText: buildFilterText(item.label, [hint, badge]),
                range,
                sortText: sortTextForProfile('column-first', 'keyword', 40 + index++),
            })
        }
    }
}

export {buildPredicateValueItems} from './predicate-value-templates'
