import type {SqlCompletionSlot} from '@sql-editor/types'

const CLAUSE_NEXT_PREFIX = /^(?:ord(?:er)?|hav(?:ing)?|lim(?:it)?)$/i

/** 仅剥离正在输入的下一子句关键字前缀，不误伤 GROUP BY 列名 */
function stripTrailingClauseKeywordPrefix(tail: string): string {
    const match = /\s+([A-Za-z_][\w$]*)$/i.exec(tail.trimEnd())
    if (!match?.[1] || !CLAUSE_NEXT_PREFIX.test(match[1])) return tail.trimEnd()
    return tail.slice(0, match.index).trimEnd()
}

/** GROUP BY 列表已完整（可接 ORDER BY / HAVING / LIMIT），或正在输入下一子句前缀 */
export function detectAfterCompleteGroupByList(segment: string, slot: SqlCompletionSlot): boolean {
    if (slot !== 'group_by') return false
    const tail = segment.trimEnd()
    if (/\bGROUP BY\s*$/i.test(tail)) return false
    if (/,\s*$/i.test(tail)) return false

    const stripped = stripTrailingClauseKeywordPrefix(tail)
    const match = /\bGROUP BY\s+(.+)$/i.exec(stripped)
    if (!match?.[1]?.trim()) return false

    const list = match[1].trimEnd()
    return /\b[`"'\[]?[\w$.]+[`"'\]]?\s*$/i.test(list)
}
