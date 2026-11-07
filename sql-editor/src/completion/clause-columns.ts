import type {SqlCompletionContext} from './context'
import {hintCompletionPresentation, completionItemKind, type CompletionDisplayCategory} from './completion-labels'
import {groupBySelectItems, orderBySelectItems} from './select-list'
import {matchesCompletionPrefix, columnFilterText} from './filter-text'
import {isColumnAlreadySelected, selectedColumnRefs} from '@sql-editor/utils/selected-columns'
import {sqlEditorSuggestT} from '@sql-editor/i18n'
import type {SuggestPush, SuggestTextRange} from './suggest-types'

function localeT(key: string, params?: Record<string, string | number>) {
    return sqlEditorSuggestT(key, params)
}

function sortText(index: number, boost = 0): string {
    return String(100 + boost + index).padStart(4, '0')
}

/** 状态栏完整 hint → 名称旁短注（截断表达式） */
function besideFromHint(hint: string, maxChars = 28): string | undefined {
    const text = hint.replace(/\s+/g, ' ').trim()
    if (!text) return undefined
    const chars = [...text]
    if (chars.length <= maxChars) return text
    return `${chars.slice(0, Math.max(1, maxChars - 1)).join('')}…`
}

function pushSelectListItem(
    push: SuggestPush,
    range: SuggestTextRange,
    prefix: string,
    label: string,
    insertText: string,
    hint: string,
    badge: string,
    category: CompletionDisplayCategory,
    sort: string,
    preselect: boolean,
    chainComma: boolean,
    beside?: string,
) {
    if (
        prefix &&
        !matchesCompletionPrefix(label, prefix) &&
        !matchesCompletionPrefix(insertText, prefix)
    ) {
        return
    }

    const presentation = hintCompletionPresentation(
        label,
        hint,
        badge,
        beside ?? besideFromHint(hint),
    )
    push({
        label: presentation.label,
        kind: completionItemKind(category),
        insertText,
        detail: presentation.detail,
        documentation: presentation.documentation,
        filterText: columnFilterText(label),
        range,
        sortText: sort,
        preselect,
        command: chainComma ? {id: 'editor.action.triggerSuggest', title: 'Trigger Suggest'} : undefined,
    })
}

/** GROUP BY：仅 SELECT 非聚合列 / 表达式 */
export function collectGroupByColumnSuggestions(
    ctx: SqlCompletionContext,
    push: SuggestPush,
    range: SuggestTextRange,
    prefix: string,
): boolean {
    const items = groupBySelectItems(ctx.segment)
    if (!items.length) return false

    const badge = localeT('completion.badge.group_by')
    const alreadySelected = selectedColumnRefs(ctx.segment, 'group_by')
    const chainComma = ctx.signals.after_comma && !prefix
    let index = 0
    let first = chainComma

    for (const item of items) {
        const label = item.alias ?? item.expression
        const insertText = item.expression
        if (isColumnAlreadySelected(label, insertText, alreadySelected)) continue

        const hint = item.alias
            ? localeT('completion.group_by.alias', {expr: item.expression})
            : localeT('completion.group_by.expression')
        const beside = item.alias
            ? `← ${besideFromHint(item.expression, 20) ?? item.expression}`
            : undefined

        pushSelectListItem(
            push,
            range,
            prefix,
            label,
            chainComma ? `${insertText},\n  ` : insertText,
            hint,
            badge,
            'group_by',
            sortText(index++),
            first,
            chainComma,
            beside,
        )
        first = false
    }
    return true
}

/** ORDER BY：优先别名，其次表达式，并提供序号 1..n */
export function collectOrderByColumnSuggestions(
    ctx: SqlCompletionContext,
    push: SuggestPush,
    range: SuggestTextRange,
    prefix: string,
): boolean {
    const items = orderBySelectItems(ctx.segment)
    if (!items.length) return false

    const badge = localeT('completion.badge.order_by')
    const alreadySelected = selectedColumnRefs(ctx.segment, 'order_by')
    const chainComma = ctx.signals.after_comma && !prefix
    const pushed = new Set<string>()
    let index = 0
    let first = chainComma

    for (const item of items) {
        if (item.alias) {
            const key = `alias:${item.alias.toLowerCase()}`
            if (pushed.has(key)) continue
            pushed.add(key)
            if (isColumnAlreadySelected(item.alias, item.alias, alreadySelected)) continue

            const hint = localeT('completion.order_by.alias', {
                ordinal: item.ordinal,
                expr: item.expression,
            })
            pushSelectListItem(
                push,
                range,
                prefix,
                item.alias,
                chainComma ? `${item.alias},\n  ` : item.alias,
                hint,
                badge,
                'order_by',
                sortText(index++, -20),
                first,
                chainComma,
                `#${item.ordinal} · ${besideFromHint(item.expression, 18) ?? item.expression}`,
            )
            first = false
        }
    }

    for (const item of items) {
        const key = `expr:${item.expression.toLowerCase()}`
        if (pushed.has(key)) continue
        if (item.alias && item.alias.toLowerCase() === item.expression.toLowerCase()) continue
        pushed.add(key)
        if (isColumnAlreadySelected(item.expression, item.expression, alreadySelected)) continue

        const label = item.alias ?? item.expression
        const hint = localeT('completion.order_by.expression', {ordinal: item.ordinal})
        pushSelectListItem(
            push,
            range,
            prefix,
            label,
            chainComma ? `${item.expression},\n  ` : item.expression,
            hint,
            badge,
            'order_by',
            sortText(index++),
            first,
            chainComma,
            `#${item.ordinal}`,
        )
        first = false
    }

    for (const item of items) {
        const ordinal = String(item.ordinal)
        const key = `ord:${ordinal}`
        if (pushed.has(key)) continue
        pushed.add(key)
        if (isColumnAlreadySelected(ordinal, ordinal, alreadySelected)) continue

        const label = item.alias ?? item.expression
        const hint = localeT('completion.order_by.ordinal', {ordinal: item.ordinal, label})
        pushSelectListItem(
            push,
            range,
            prefix,
            ordinal,
            chainComma ? `${ordinal},\n  ` : ordinal,
            hint,
            localeT('completion.badge.ordinal'),
            'ordinal',
            sortText(index++, 30),
            first,
            chainComma,
            besideFromHint(label, 22),
        )
        first = false
    }
    return true
}
