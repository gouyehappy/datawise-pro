import type {SqlEditorLocale, SqlSnippet} from '@sql-editor/types'
import {translateSnippetDetail} from '@sql-editor/i18n'
import {categoryCompletionLabel, type CompletionItemLabel} from './completion-labels'

export type SnippetSqlPreviewMode = 'inline' | 'full'

/** 将 Monaco snippet 模板转为可读 SQL */
export function simplifySnippetInsertText(insertText: string): string {
    return insertText
        .replace(/\$\{\d+\:([^}|]+)(?:\|[^}]*)?\}/g, '$1')
        .replace(/\$\{\d+\|([^}|]+)\|[^}]*\}/g, '$1')
        .replace(/\$\{\d+[^}]*\}/g, '')
        .replace(/\$\d+/g, '')
        .trim()
}

/** 补全列表用单行 SQL 预览 */
export function formatSnippetSqlPreview(
    insertText: string,
    mode: SnippetSqlPreviewMode = 'inline',
    maxLength = 72,
): string {
    const raw = simplifySnippetInsertText(insertText)
    if (mode === 'full') return raw
    const oneLine = raw.replace(/\s+/g, ' ').trim()
    if (oneLine.length <= maxLength) return oneLine
    return `${oneLine.slice(0, maxLength - 1)}…`
}

export interface SnippetPresentationInput {
    label: string
    insertText: string
    detail?: string
}

export interface SnippetPresentation {
    summary: string
    sqlPreview: string
    sqlDocumentation: string
    /** 补全主列表：仅 trigger + 类型徽标（如「片段」） */
    completionLabel: CompletionItemLabel
    /** 二级面板标题（Monaco suggest details 的 detail 区） */
    completionDetail: string
    /** 二级面板正文（Monaco documentation widget） */
    documentation: { value: string; isTrusted: boolean }
    tooltip: string
}

/** 片段说明：i18n → detail 字段 → SQL 首行 */
export function resolveSnippetSummary(
    locale: SqlEditorLocale,
    snippet: SnippetPresentationInput,
    dialectVariant?: string,
): string {
    const translated = translateSnippetDetail(
        locale,
        snippet.label,
        snippet.detail ?? '',
        dialectVariant,
    )
    if (translated.trim()) return translated.trim()
    return formatSnippetSqlPreview(snippet.insertText, 'inline', 48)
}

export function presentSnippet(
    snippet: SnippetPresentationInput,
    locale: SqlEditorLocale,
    typeLabel: string,
    dialectVariant?: string,
): SnippetPresentation {
    const summary = resolveSnippetSummary(locale, snippet, dialectVariant)
    const sqlPreview = formatSnippetSqlPreview(snippet.insertText, 'inline')
    const sqlDocumentation = formatSnippetSqlPreview(snippet.insertText, 'full')

    const docBody = sqlDocumentation || summary

    const tooltip =
        sqlDocumentation && sqlDocumentation !== summary
            ? `${summary}\n\n${sqlDocumentation}`
            : summary

    return {
        summary,
        sqlPreview,
        sqlDocumentation,
        completionLabel: categoryCompletionLabel(snippet.label, typeLabel),
        completionDetail: summary,
        documentation: {value: docBody, isTrusted: true},
        tooltip,
    }
}

export function presentSnippetFromConfig(
    snippet: SqlSnippet,
    locale: SqlEditorLocale,
    typeLabel: string,
    dialectVariant?: string,
): SnippetPresentation {
    return presentSnippet(
        {
            label: snippet.label,
            insertText: snippet.insertText,
            detail: snippet.detail,
        },
        locale,
        typeLabel,
        dialectVariant,
    )
}

export function snippetTitleKey(label: string): `snippet.${string}` {
    return `snippet.${label.toLowerCase()}`
}
