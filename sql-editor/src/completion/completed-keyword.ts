import {matchesKeywordPrefix} from './filter-text'

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 行尾（光标前）是否已完整输入该关键字。
 * 只认紧邻光标的尾部关键字，避免同行更早出现的 LEFT JOIN 把「下一跳 LEFT JOIN」误杀掉。
 */
export function isKeywordCompleteBeforeCursor(lineBefore: string, keyword: string): boolean {
    const trimmed = lineBefore.trimEnd()
    if (!trimmed || !keyword.trim()) return false
    const parts = keyword.trim().split(/\s+/)
    const pattern = parts.map(escapeRegex).join('\\s+')
    const re = new RegExp(`(?:^|\\s)(${pattern})$`, 'i')
    return re.test(trimmed)
}

/** 是否仍应提供该关键字补全（排除光标前刚写完的重复项） */
export function shouldOfferKeywordAtCursor(
    lineBefore: string,
    keyword: string,
    prefix: string,
): boolean {
    if (!matchesKeywordPrefix(keyword, prefix)) return false
    if (isKeywordCompleteBeforeCursor(lineBefore, keyword)) return false
    return true
}

/** 行尾是否为已完整的 FROM（下一步应接表名） */
export function lineEndsWithCompleteFrom(lineBefore: string): boolean {
    return /\bFROM\s*$/i.test(lineBefore.trimEnd())
}
