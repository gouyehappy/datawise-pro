import type {SuggestItem} from './suggest-types'
import {sqlEditorSuggestT} from '@sql-editor/i18n'

/** Monaco CompletionItemKind 数值 → 分组（与 completion-labels 一致） */
function groupKeyForKind(kind: number): string | null {
    switch (kind) {
        case 3: // Field
            return 'column'
        case 1: // Function
            return 'function'
        case 17: // Keyword
            return 'keyword'
        case 28: // Snippet
            return 'snippet'
        case 5: // Class
        case 6: // Struct
        case 7: // Interface (schema)
        case 8: // Module (catalog)
            return 'table'
        case 21: // Reference (fk)
            return 'fk'
        case 4: // Variable (alias)
            return 'alias'
        case 10: // Event (expand)
            return 'expand'
        case 13: // Value
        case 14: // Constant
        case 12: // Unit
            return 'value'
        case 15: // Enum (recent)
            return 'recent'
        case 25: // User (ai)
            return 'ai'
        default:
            return null
    }
}

function groupTitle(key: string): string {
    const msg = sqlEditorSuggestT(`completion.group.${key}`)
    if (msg && msg !== `completion.group.${key}`) return msg
    return key
}

/** 保证全局最多一个 preselect，且绝不是分组标题；有标题且无人预选时落到首个非标题项 */
export function normalizeSuggestPreselect(items: SuggestItem[]): SuggestItem[] {
    let seen = false
    const cleared = items.map((item) => {
        if (item.suggestHeader) return {...item, preselect: false}
        if (!item.preselect) return item
        if (seen) return {...item, preselect: false}
        seen = true
        return item
    })
    if (seen || !cleared.some((i) => i.suggestHeader)) return cleared

    let promoted = false
    return cleared.map((item) => {
        if (promoted || item.suggestHeader) return item
        promoted = true
        return {...item, preselect: true}
    })
}

/**
 * 空前缀且列表较长时，按 kind 插入「分组标题」行（P2）。
 * 标题行 range 塌缩到光标，insertText 为空 → 接受时不删字、不插字。
 */
export function injectSuggestGroupHeaders(items: SuggestItem[], prefix: string): SuggestItem[] {
    if (prefix.trim() || items.length < 5) return normalizeSuggestPreselect(items)

    const sorted = [...items].sort((a, b) =>
        String(a.sortText ?? '').localeCompare(String(b.sortText ?? '')),
    )

    const grouped: SuggestItem[] = []
    let lastGroup: string | null = null
    const groupsSeen = new Set<string>()

    for (const item of sorted) {
        if (item.suggestHeader) {
            grouped.push(item)
            continue
        }
        const group = groupKeyForKind(item.kind)
        if (group && group !== lastGroup) {
            const caret = item.range.endColumn
            grouped.push({
                label: `— ${groupTitle(group)} —`,
                kind: 18, // Text
                insertText: '',
                filterText: `\u0000${group}`,
                // 塌缩 range：避免 Enter 时用空串替换正在编辑的前缀区间
                range: {
                    startLineNumber: item.range.startLineNumber,
                    endLineNumber: item.range.endLineNumber,
                    startColumn: caret,
                    endColumn: caret,
                },
                sortText: '0000',
                suggestHeader: true,
                preselect: false,
            })
            groupsSeen.add(group)
            lastGroup = group
        }
        grouped.push(item)
    }

    if (groupsSeen.size < 2) return normalizeSuggestPreselect(items)

    const renumbered = grouped.map((item, index) => ({
        ...item,
        sortText: String(index).padStart(4, '0'),
        preselect: item.suggestHeader ? false : item.preselect,
    }))
    return normalizeSuggestPreselect(renumbered)
}
