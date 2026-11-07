/**
 * 子句关键字常见缩写（仅 clause-next 等场景通过 matchesKeywordPrefix 生效）。
 * 例：lj → LEFT JOIN，gb → GROUP BY。
 */

const KEYWORD_ABBREVIATIONS: Record<string, readonly string[]> = {
    'LEFT JOIN': ['lj', 'leftj', 'ljoin'],
    'INNER JOIN': ['ij', 'innerj', 'ijoin'],
    'RIGHT JOIN': ['rj', 'rightj', 'rjoin'],
    'FULL JOIN': ['fj', 'fullj', 'fjoin'],
    'CROSS JOIN': ['xj', 'crossj', 'xjoin'],
    'GROUP BY': ['gb', 'groupby', 'grp'],
    'ORDER BY': ['ob', 'orderby', 'ord'],
    WHERE: ['wh', 'whe'],
    HAVING: ['hav', 'hv'],
    LIMIT: ['lim'],
    OFFSET: ['off'],
    'UNION ALL': ['ua', 'unionall'],
    DISTINCT: ['dist'],
    'FETCH FIRST': ['ff', 'fetchf'],
}

function normalizeKeyword(keyword: string): string {
    return keyword.trim().replace(/\s+/g, ' ').toUpperCase()
}

/** 关键字是否匹配缩写前缀（精确等值，避免 l → LEFT JOIN） */
export function matchesKeywordAbbreviation(keyword: string, prefix: string): boolean {
    if (!prefix.trim()) return false
    const lower = prefix.toLowerCase()
    const aliases = KEYWORD_ABBREVIATIONS[normalizeKeyword(keyword)]
    if (!aliases) return false
    return aliases.some((a) => a === lower)
}

/** 写入 filterText，便于 Monaco 客户端过滤 */
export function abbreviationTokensForKeyword(keyword: string): string[] {
    return [...(KEYWORD_ABBREVIATIONS[normalizeKeyword(keyword)] ?? [])]
}

/** JOIN/GROUP/ORDER 等限定词：有完整短语时优先隐藏单字限定词 */
const QUALIFIER_TO_PHRASE: Record<string, string> = {
    INNER: 'INNER JOIN',
    LEFT: 'LEFT JOIN',
    RIGHT: 'RIGHT JOIN',
    FULL: 'FULL JOIN',
    CROSS: 'CROSS JOIN',
    GROUP: 'GROUP BY',
    ORDER: 'ORDER BY',
}

/**
 * 空前缀或完整短语也能匹配时，去掉 INNER/LEFT/GROUP 等限定词，只留 LEFT JOIN / GROUP BY。
 */
export function preferFullPhraseKeywords(keywords: string[], prefix: string): string[] {
    const normalized = keywords.map((kw) => ({raw: kw, norm: normalizeKeyword(kw)}))
    const present = new Set(normalized.map((k) => k.norm))
    const lowerPrefix = prefix.trim().toLowerCase()

    return normalized
        .filter(({norm}) => {
            const phrase = QUALIFIER_TO_PHRASE[norm]
            if (!phrase || !present.has(phrase)) return true

            // 空前缀：只出完整短语
            if (!lowerPrefix) return false

            // 前缀已能匹配完整短语（left / group / ord…）→ 隐藏限定词
            const phraseLower = phrase.toLowerCase()
            const phraseCompact = phraseLower.replace(/\s+/g, '')
            const phraseFirst = phraseLower.split(/\s+/)[0] ?? phraseLower
            if (
                phraseLower.startsWith(lowerPrefix) ||
                phraseCompact.startsWith(lowerPrefix) ||
                phraseFirst.startsWith(lowerPrefix)
            ) {
                return false
            }

            // 缩写命中完整短语时也不出限定词
            if (matchesKeywordAbbreviation(phrase, lowerPrefix)) return false

            return true
        })
        .map((k) => k.raw)
}
