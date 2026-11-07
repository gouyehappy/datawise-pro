import type {Suggestions} from 'dt-sql-parser'

/**
 * dt-sql-parser MySQL 词法中的 charset / collation 名（非日常 SQL 补全关键字）。
 * 来源：node_modules/dt-sql-parser/dist/lib/mysql/MySqlLexer.js
 */
const MYSQL_CHARSET_COLLATION_KEYWORDS = new Set([
    'ARMSCII8',
    'ASCII',
    'BIG5',
    'CP1250',
    'CP1251',
    'CP1256',
    'CP1257',
    'CP850',
    'CP852',
    'CP866',
    'CP932',
    'DEC8',
    'GBK',
    'GEOSTD8',
    'GREEK',
    'HEBREW',
    'HP8',
    'KEYBCS2',
    'KOI8R',
    'KOI8U',
    'LATIN1',
    'LATIN2',
    'LATIN5',
    'LATIN7',
    'MACCE',
    'MACROMAN',
    'SJIS',
    'SWE7',
    'TIS620',
    'UCS2',
    'UJIS',
    'UTF8',
    'UTF8MB3',
    'UTF8MB4',
    'UTF16',
    'UTF16LE',
    'UTF32',
])

/** MySQL index hint 词法 token，SELECT 补全中无实用价值 */
const MYSQL_INDEX_HINT_KEYWORDS = new Set(['FORCE', 'IGNORE'])

export function isParserNoiseKeyword(keyword: string): boolean {
    const upper = keyword.trim().replace(/\s+/g, ' ').toUpperCase()
    if (!upper) return false
    if (MYSQL_CHARSET_COLLATION_KEYWORDS.has(upper)) return true
    if (MYSQL_INDEX_HINT_KEYWORDS.has(upper)) return true
    if (/^CP\d+$/.test(upper)) return true
    return false
}

export function filterParserNoiseKeywords(keywords: string[]): string[] {
    return keywords.filter((keyword) => !isParserNoiseKeyword(keyword))
}

export function extractParserKeywords(suggestions: Suggestions): string[] {
    return filterParserNoiseKeywords([...(suggestions.keywords ?? [])])
}
