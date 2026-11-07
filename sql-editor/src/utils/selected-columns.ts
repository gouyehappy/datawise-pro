import {stripSqlForParsing} from './parse-references'
import type {SqlCompletionSlot} from '@sql-editor/types'

/** 已出现在 SELECT 列表中的列引用（小写），用于去重 */
export function selectedColumnRefs(segment: string, slot: SqlCompletionSlot): Set<string> {
    if (slot !== 'select_list' && slot !== 'group_by' && slot !== 'order_by') {
        return new Set()
    }

    const text = stripSqlForParsing(segment)
    let listPart = text

    if (slot === 'select_list') {
        const selectMatch = /\bSELECT\b/i.exec(text)
        const fromMatch = /\bFROM\b/i.exec(text)
        if (!selectMatch || !fromMatch || fromMatch.index <= selectMatch.index) return new Set()
        listPart = text.slice(selectMatch.index + selectMatch[0].length, fromMatch.index)
    } else if (slot === 'group_by') {
        const groupMatch = /\bGROUP BY\b/i.exec(text)
        if (!groupMatch) return new Set()
        const after = text.slice(groupMatch.index + groupMatch[0].length)
        const endMatch = /\b(HAVING|ORDER BY|LIMIT|UNION)\b/i.exec(after)
        listPart = endMatch ? after.slice(0, endMatch.index) : after
    } else if (slot === 'order_by') {
        const orderMatch = /\bORDER BY\b/i.exec(text)
        if (!orderMatch) return new Set()
        const after = text.slice(orderMatch.index + orderMatch[0].length)
        const endMatch = /\b(LIMIT|UNION|OFFSET)\b/i.exec(after)
        listPart = endMatch ? after.slice(0, endMatch.index) : after
    }

    const selected = new Set<string>()
    for (const match of listPart.matchAll(/\b([\w$]+(?:\.[\w$]+)?|\*)\b/gi)) {
        const token = match[1]
        if (!token || /^(as|asc|desc|and|or|null)$/i.test(token)) continue
        selected.add(token.toLowerCase())
        if (token.includes('.')) {
            selected.add(token.split('.').pop()!.toLowerCase())
        }
    }
    return selected
}

export function isColumnAlreadySelected(
    column: string,
    insertText: string,
    selected: Set<string>,
): boolean {
    if (!selected.size) return false
    const keys = [column.toLowerCase(), insertText.toLowerCase()]
    if (insertText.includes('.')) {
        keys.push(insertText.split('.').pop()!.toLowerCase())
    }
    return keys.some((key) => selected.has(key))
}
