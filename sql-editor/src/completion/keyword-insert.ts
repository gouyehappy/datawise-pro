/**
 * 子句关键字插入：占位片段 + 是否链式再弹补全。
 * 接受 WHERE / JOIN 等后，光标落在该填处并触发下一轮表/列提示。
 * 前导 `\n` 在行首（含仅有将被替换前缀）时由 adjustKeywordInsertNewlines 剥掉。
 */

import {getSqlEditorFormatterSettings} from '@sql-editor/config/snippets/cache'
import {adjustKeywordInsertNewlines} from '@sql-editor/utils/format-as-you-type'

export type KeywordInsertResult = {
    insertText: string
    /** 含 ${n} / $0 时需按 snippet 插入 */
    asSnippet: boolean
    /** 接受后触发 triggerSuggest */
    chainSuggest: boolean
}

const KEYWORD_INSERT: Record<string, KeywordInsertResult> = {
    WHERE: {insertText: '\nWHERE $0', asSnippet: true, chainSuggest: true},
    FROM: {insertText: '\nFROM $0', asSnippet: true, chainSuggest: true},
    HAVING: {insertText: '\nHAVING $0', asSnippet: true, chainSuggest: true},
    'GROUP BY': {insertText: '\nGROUP BY $0', asSnippet: true, chainSuggest: true},
    'ORDER BY': {insertText: '\nORDER BY $0', asSnippet: true, chainSuggest: true},
    AND: {insertText: '\n  AND $0', asSnippet: true, chainSuggest: true},
    OR: {insertText: '\n  OR $0', asSnippet: true, chainSuggest: true},
    ON: {insertText: 'ON $0', asSnippet: true, chainSuggest: true},
    AS: {insertText: 'AS $0', asSnippet: true, chainSuggest: true},
    SET: {insertText: '\nSET $0', asSnippet: true, chainSuggest: true},
    VALUES: {insertText: '\nVALUES ($0)', asSnippet: true, chainSuggest: true},
    DISTINCT: {insertText: 'DISTINCT ', asSnippet: false, chainSuggest: true},
    LIMIT: {insertText: '\nLIMIT ${1:100}', asSnippet: true, chainSuggest: false},
    OFFSET: {insertText: '\nOFFSET ${1:0}', asSnippet: true, chainSuggest: false},
    JOIN: {insertText: '\nJOIN ${1:table} ON $0', asSnippet: true, chainSuggest: true},
    'INNER JOIN': {insertText: '\nINNER JOIN ${1:table} ON $0', asSnippet: true, chainSuggest: true},
    'LEFT JOIN': {insertText: '\nLEFT JOIN ${1:table} ON $0', asSnippet: true, chainSuggest: true},
    'RIGHT JOIN': {insertText: '\nRIGHT JOIN ${1:table} ON $0', asSnippet: true, chainSuggest: true},
    'FULL JOIN': {insertText: '\nFULL JOIN ${1:table} ON $0', asSnippet: true, chainSuggest: true},
    'CROSS JOIN': {insertText: '\nCROSS JOIN ${1:table}', asSnippet: true, chainSuggest: true},
    STRAIGHT_JOIN: {insertText: '\nSTRAIGHT_JOIN ${1:table} ON $0', asSnippet: true, chainSuggest: true},
    UNION: {insertText: '\nUNION\n', asSnippet: false, chainSuggest: true},
    'UNION ALL': {insertText: '\nUNION ALL\n', asSnippet: false, chainSuggest: true},
    INTERSECT: {insertText: '\nINTERSECT\n', asSnippet: false, chainSuggest: true},
    EXCEPT: {insertText: '\nEXCEPT\n', asSnippet: false, chainSuggest: true},
    'FETCH FIRST': {insertText: '\nFETCH FIRST ${1:100} ROWS ONLY', asSnippet: true, chainSuggest: false},
    'FETCH NEXT': {insertText: '\nFETCH NEXT ${1:100} ROWS ONLY', asSnippet: true, chainSuggest: false},
    RETURNING: {insertText: '\nRETURNING $0', asSnippet: true, chainSuggest: true},
}

function normalizeKeyword(keyword: string): string {
    return keyword.trim().replace(/\s+/g, ' ').toUpperCase()
}

/** 解析关键字插入文本；无专用模板时回退为 keyword / keyword+空格 */
export function buildKeywordInsert(
    keyword: string,
    options?: {
        trailingSpaceFallback?: boolean
        lineBefore?: string
        typedPrefix?: string
        /** 覆盖个人层 formatAsYouType；未传则读运行时设置 */
        formatAsYouType?: boolean
    },
): KeywordInsertResult {
    const norm = normalizeKeyword(keyword)
    const mapped = KEYWORD_INSERT[norm]
    if (mapped) {
        const leadingNewline =
            options?.formatAsYouType ?? getSqlEditorFormatterSettings().formatAsYouType
        const insertText =
            options?.lineBefore !== undefined
                ? adjustKeywordInsertNewlines(
                      mapped.insertText,
                      options.lineBefore,
                      options.typedPrefix,
                      {leadingNewline},
                  )
                : leadingNewline
                  ? mapped.insertText
                  : mapped.insertText.replace(/^\n+[ \t]*/, '')
        return {...mapped, insertText}
    }
    const trailing = options?.trailingSpaceFallback !== false
    return {
        insertText: trailing ? `${keyword} ` : keyword,
        asSnippet: false,
        chainSuggest: false,
    }
}

/** 结构型关键字（CASE / OVER / WITH）：按前缀注入，不走 clause 白名单 */
export type StructureKeywordOffer = {
    label: string
    insertText: string
    /** 允许出现的槽位 */
    slots: ReadonlySet<string>
    matchPrefix: (prefix: string) => boolean
}

const STRUCTURE_OFFERS: StructureKeywordOffer[] = [
    {
        label: 'CASE',
        insertText: 'CASE\n  WHEN ${1:condition} THEN ${2:value}\n  ELSE ${3:NULL}\nEND',
        slots: new Set(['select_list', 'where', 'having', 'set', 'column_ref']),
        matchPrefix: (p) => /^ca(s|se)?$/i.test(p),
    },
    {
        label: 'OVER',
        insertText: 'OVER (PARTITION BY ${1:column} ORDER BY ${2:column})',
        slots: new Set(['select_list', 'column_ref']),
        matchPrefix: (p) => /^ov(e|er)?$/i.test(p),
    },
    {
        label: 'WITH',
        insertText:
            'WITH ${1:cte} AS (\n  ${2:SELECT * FROM table}\n)\nSELECT ${3:*}\nFROM ${1:cte}',
        slots: new Set(['statement_start']),
        matchPrefix: (p) => /^wi(t|th)?$/i.test(p),
    },
]

export function structureKeywordsForSlot(
    slot: string,
    prefix: string,
): StructureKeywordOffer[] {
    if (!prefix.trim()) return []
    return STRUCTURE_OFFERS.filter((o) => o.slots.has(slot) && o.matchPrefix(prefix))
}
