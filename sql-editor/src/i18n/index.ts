import type {SqlEditorLocale} from '@sql-editor/types'
import {SQL_EDITOR_MESSAGES, snippetMessageKey, type SqlEditorMessageKey} from './messages'

export type {SqlEditorMessageKey}
export {SQL_EDITOR_MESSAGES, snippetMessageKey}

export function normalizeSqlEditorLocale(raw?: string | null): SqlEditorLocale {
    if (!raw) return 'en'
    if (raw === 'zh-CN' || raw === 'zh' || raw.startsWith('zh-')) return 'zh-CN'
    return 'en'
}

/** 首次无个人配置时，按浏览器语言推断 UI 语言 */
export function detectBrowserSqlEditorLocale(): SqlEditorLocale {
    if (typeof navigator !== 'undefined' && navigator.language) {
        return normalizeSqlEditorLocale(navigator.language)
    }
    return 'en'
}

export function sqlEditorT(
    locale: SqlEditorLocale,
    key: SqlEditorMessageKey | string,
    params?: Record<string, string | number>,
): string {
    const catalog = SQL_EDITOR_MESSAGES[locale] ?? SQL_EDITOR_MESSAGES.en
    let text = catalog[key] ?? SQL_EDITOR_MESSAGES.en[key] ?? key
    if (params) {
        for (const [name, value] of Object.entries(params)) {
            text = text.split(`{${name}}`).join(String(value))
        }
    }
    return text
}

/**
 * Monaco suggest-widget copy stays English (type badges, detail, snippet summaries).
 * App UI locale still drives HintBar / settings / diagnostics.
 */
export function sqlEditorSuggestT(
    key: SqlEditorMessageKey | string,
    params?: Record<string, string | number>,
): string {
    return sqlEditorT('en', key, params)
}

export function translateSnippetDetail(
    locale: SqlEditorLocale,
    label: string,
    fallback = '',
    dialectVariant?: string,
): string {
    const key = snippetMessageKey(label, dialectVariant)
    if (!key) return fallback
    return sqlEditorT(locale, key, undefined) || fallback
}
