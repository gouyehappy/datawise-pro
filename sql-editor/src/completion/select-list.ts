import {sqlScanModeAt} from './sql-scan'
import {maskNonCodeRegionsCached} from './incremental-scan'
import {stripSqlForParsing} from '@sql-editor/utils/parse-references'

export type SelectListItem = {
    /** SELECT 中的原始表达式 */
    expression: string
    /** AS 或隐式别名 */
    alias: string | null
    /** SELECT 列表中的序号（从 1 开始） */
    ordinal: number
    /** 是否为聚合表达式 */
    aggregate: boolean
    /** 表达式中引用的裸列名（小写） */
    columnNames: string[]
}

const AGGREGATE_FN =
    /\b(COUNT|SUM|AVG|MIN|MAX|GROUP_CONCAT|STRING_AGG|ARRAY_AGG|LISTAGG|STDDEV|VARIANCE|BIT_AND|BIT_OR|BOOL_AND|BOOL_OR|JSON_AGG|XMLAGG)\s*\(/i

const RESERVED_ALIASES = new Set([
    'as', 'asc', 'desc', 'and', 'or', 'not', 'null', 'from', 'where', 'on', 'by', 'select',
])

function unquote(value: string): string {
    return value.replace(/^[`"'\[]|[`"'\]]$/g, '')
}

/** 提取 SELECT … FROM 之间的列表文本 */
export function extractSelectListText(segment: string): string {
    const text = stripSqlForParsing(segment)
    const selectMatch = /\bSELECT\b/i.exec(text)
    const fromMatch = /\bFROM\b/i.exec(text)
    if (!selectMatch || !fromMatch || fromMatch.index <= selectMatch.index) return ''
    let listPart = text.slice(selectMatch.index + selectMatch[0].length, fromMatch.index).trim()
    listPart = listPart.replace(/^(DISTINCT|ALL)\s+/i, '')
    return listPart
}

/** 按顶层逗号拆分 SELECT 列表项 */
export function splitSelectListItems(listPart: string): string[] {
    if (!listPart.trim()) return []

    const items: string[] = []
    let start = 0
    let depth = 0

    for (let i = 0; i < listPart.length; i++) {
        if (sqlScanModeAt(listPart, i) !== 'code') continue
        const ch = listPart[i]
        if (ch === '(') depth++
        else if (ch === ')') depth = Math.max(0, depth - 1)
        else if (ch === ',' && depth === 0) {
            const piece = listPart.slice(start, i).trim()
            if (piece) items.push(piece)
            start = i + 1
        }
    }

    const tail = listPart.slice(start).trim()
    if (tail) items.push(tail)
    return items
}

function isAggregateExpression(expression: string): boolean {
    return AGGREGATE_FN.test(maskNonCodeRegionsCached(expression))
}

function isWildcardExpression(expression: string): boolean {
    const trimmed = maskNonCodeRegionsCached(expression).trim()
    return trimmed === '*' || /\.\*$/.test(trimmed)
}

function parseAlias(expression: string): { expression: string; alias: string | null } {
    const trimmed = expression.trim()
    const asMatch = /^(.*)\s+AS\s+([`"'\[]?[\w$]+[`"'\]]?)\s*$/i.exec(trimmed)
    if (asMatch) {
        return {expression: asMatch[1].trim(), alias: unquote(asMatch[2])}
    }

    const implicit = /^(.+?)\s+([A-Za-z_][\w$]*)\s*$/i.exec(trimmed)
    if (implicit) {
        const expr = implicit[1].trim()
        const alias = unquote(implicit[2])
        if (
            !RESERVED_ALIASES.has(alias.toLowerCase()) &&
            expr.toLowerCase() !== alias.toLowerCase() &&
            (/[.]|\(|\)|,|\+|-|\*|\/|::/i.test(expr) || isAggregateExpression(expr))
        ) {
            return {expression: expr, alias}
        }
    }

    return {expression: trimmed, alias: null}
}

function extractColumnNames(expression: string, aggregate: boolean): string[] {
    if (aggregate || isWildcardExpression(expression)) return []

    const masked = maskNonCodeRegionsCached(expression).trim()
    const names = new Set<string>()

    for (const match of masked.matchAll(/\b([A-Za-z_][\w$]*)\.([A-Za-z_][\w$]*)\b/g)) {
        names.add(match[2].toLowerCase())
    }
    if (names.size) return [...names]

    if (/^[A-Za-z_][\w$]*$/.test(masked)) {
        return [masked.toLowerCase()]
    }

    return []
}

const SELECT_LIST_CACHE_MAX = 48
type SelectListCacheEntry = { segment: string; items: SelectListItem[] }
const selectListCache = new Map<string, SelectListCacheEntry>()

function selectListCacheKey(segment: string): string {
    if (segment.length <= 2048) return segment
    let hash = 0
    for (let i = 0; i < segment.length; i++) {
        hash = (hash * 31 + segment.charCodeAt(i)) | 0
    }
    return `h:${segment.length}:${hash}`
}

function getCachedSelectList(segment: string): SelectListItem[] | null {
    const key = selectListCacheKey(segment)
    const hit = selectListCache.get(key)
    if (!hit || hit.segment !== segment) return null
    return hit.items
}

function setCachedSelectList(segment: string, items: SelectListItem[]): void {
    const key = selectListCacheKey(segment)
    selectListCache.delete(key)
    selectListCache.set(key, {segment, items})
    if (selectListCache.size > SELECT_LIST_CACHE_MAX) {
        const oldest = selectListCache.keys().next().value
        if (oldest) selectListCache.delete(oldest)
    }
}

/** 解析当前语句 SELECT 列表 */
export function parseSelectListItems(segment: string): SelectListItem[] {
    const cached = getCachedSelectList(segment)
    if (cached) return cached

    const listPart = extractSelectListText(segment)
    const rawItems = splitSelectListItems(listPart)

    const items = rawItems.map((raw, index) => {
        const {expression, alias} = parseAlias(raw)
        const aggregate = isAggregateExpression(expression)
        return {
            expression,
            alias,
            ordinal: index + 1,
            aggregate,
            columnNames: extractColumnNames(expression, aggregate),
        }
    })

    setCachedSelectList(segment, items)
    return items
}

/** GROUP BY 可选：SELECT 中的非聚合项 */
export function groupBySelectItems(segment: string): SelectListItem[] {
    return parseSelectListItems(segment).filter((item) => !item.aggregate && !isWildcardExpression(item.expression))
}

/** ORDER BY 可选：SELECT 列表全部输出列（含聚合别名） */
export function orderBySelectItems(segment: string): SelectListItem[] {
    return parseSelectListItems(segment).filter((item) => !isWildcardExpression(item.expression))
}

function selectListDraftText(segment: string): string {
    const text = stripSqlForParsing(segment)
    const selectMatch = /\bSELECT\b/i.exec(text)
    if (!selectMatch) return ''
    let listPart = text.slice(selectMatch.index + selectMatch[0].length)
    const fromMatch = /\bFROM\b/i.exec(listPart)
    if (fromMatch && fromMatch.index >= 0) {
        listPart = listPart.slice(0, fromMatch.index)
    }
    return listPart.replace(/^(DISTINCT|ALL)\s+/i, '').trimStart()
}

function deriveAliasFromExpression(expression: string): string | null {
    const trimmed = expression.trim()
    const qualified = /(?:^|[.(\s])(?:[`"'\[]?[\w$]+[`"'\]]?\.)?([`"'\[]?[\w$]+[`"'\]]?)\s*$/.exec(trimmed)
    if (!qualified?.[1]) return null
    const alias = unquote(qualified[1])
    if (!alias || RESERVED_ALIASES.has(alias.toLowerCase())) return null
    return alias
}

export type SelectAliasDraft = {
    expression: string
    alias: string
}

/** 当前 SELECT 列表项处于 `... AS <prefix>` 时，返回建议的默认别名。 */
export function detectSelectAliasDraft(segment: string): SelectAliasDraft | null {
    const listPart = selectListDraftText(segment)
    const rawItems = splitSelectListItems(listPart)
    const current = rawItems[rawItems.length - 1]?.trim()
    if (!current) return null

    const asMatch = /^(.*)\s+AS(?:\s+([A-Za-z_][\w$]*))?\s*$/i.exec(current)
    if (!asMatch?.[1]) return null

    const expression = asMatch[1].trim()
    const alias = deriveAliasFromExpression(expression)
    if (!alias) return null
    return {expression, alias}
}
