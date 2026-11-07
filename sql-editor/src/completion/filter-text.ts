import {
    abbreviationTokensForKeyword,
    matchesKeywordAbbreviation,
} from './keyword-abbreviations'

/** 列名 Monaco 过滤：仅用 label，避免子串误命中（如 count → user_count） */
export function columnFilterText(label: string): string {
    return label
}

/** Monaco 用 filterText 做补全过滤；生成大小写不敏感 filterText */
export function buildFilterText(label: string, extra: string[] = []): string {
    const lower = label.toLowerCase()
    const compact = lower.replace(/\s+/g, '')
    const parts = new Set<string>([lower, compact, label, ...extra.map((v) => v.toLowerCase())])
    return [...parts].filter(Boolean).join(' ')
}

/** 前缀匹配：大小写不敏感 */
export function matchesCompletionPrefix(label: string, prefix: string): boolean {
    if (!prefix) return true
    const lowerLabel = label.toLowerCase()
    const lowerPrefix = prefix.toLowerCase()
    if (lowerLabel.startsWith(lowerPrefix)) return true
    const compactLabel = lowerLabel.replace(/\s+/g, '')
    if (compactLabel.startsWith(lowerPrefix)) return true
    const firstWord = lowerLabel.split(/\s+/)[0] ?? lowerLabel
    return firstWord.startsWith(lowerPrefix)
}

/** 关键字是否匹配前缀（含空格关键字首词 + 缩写 lj/gb/ob…） */
export function matchesKeywordPrefix(keyword: string, prefix: string): boolean {
    if (matchesCompletionPrefix(keyword, prefix)) return true
    return matchesKeywordAbbreviation(keyword, prefix)
}

/** 关键字专用 filterText：含空格关键字的分词与缩写，便于 order/lj → ORDER BY / LEFT JOIN */
export function keywordFilterText(keyword: string): string {
    const lower = keyword.toLowerCase()
    const compact = lower.replace(/\s+/g, '')
    const words = lower.split(/\s+/).filter(Boolean)
    const prefixes = new Set<string>([
        lower,
        compact,
        keyword,
        ...words,
        ...abbreviationTokensForKeyword(keyword),
    ])
    for (const word of words) {
        for (let i = 1; i <= word.length; i++) prefixes.add(word.slice(0, i))
    }
    return [...prefixes].join(' ')
}
