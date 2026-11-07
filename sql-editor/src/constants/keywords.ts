import {
    getFormatBreakKeywords,
    getFormatKeywords,
} from '@sql-editor/completion/keyword-config'

export {SQL_SNIPPETS, SQL_SLOT_SNIPPETS, type SqlSnippet} from './snippets'

/** 通用 + 当前方言的格式化关键字 */
export function formatKeywordsForDialect(dialectFile?: string | null): string[] {
    return getFormatKeywords(dialectFile)
}

export function formatBreakKeywordsForDialect(dialectFile?: string | null): string[] {
    return getFormatBreakKeywords(dialectFile)
}
