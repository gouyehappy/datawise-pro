import type {SqlCompletionContext} from './context'
import {tablesReferencedInQuery} from './context'
import type {SqlCompletionPlan, KeywordSlotOverride} from './grammar/types'
import type {KeywordPhase} from './completion-phase'
import {filterKeywordsByPhase, sortClauseNextKeywords} from './completion-phase'
import {forbiddenInSelectKeywords} from './keyword-config'
import {filterParserNoiseKeywords} from './parser/parser-keywords'
import type {SqlValueKind} from './column-type'
import {preferFullPhraseKeywords} from './keyword-abbreviations'
import {getActiveSqlEditorRuntime} from '@sql-editor/runtime/sql-editor-runtime'

function normalizeClauseKeyword(keyword: string): string {
    return keyword.trim().replace(/\s+/g, ' ').toUpperCase()
}

function filterKeywordsForDmlStatement(
    ctx: SqlCompletionContext,
    plan: Pick<SqlCompletionPlan, 'keywordSlot' | 'keywordPhase'>,
    keywords: string[],
): string[] {
    if (ctx.statement === 'delete' && plan.keywordSlot === 'after_table') {
        return keywords.filter((kw) => DELETE_AFTER_TABLE_KEYWORDS.has(normalizeClauseKeyword(kw)))
    }
    return keywords
}

const DELETE_AFTER_TABLE_KEYWORDS = new Set(['WHERE'])

const AFTER_SET_KEYWORDS = new Set(['WHERE'])

const ALTER_AFTER_TABLE_KEYWORDS = new Set([
    'ADD',
    'ADD COLUMN',
    'DROP',
    'DROP COLUMN',
    'MODIFY',
    'MODIFY COLUMN',
    'CHANGE',
    'CHANGE COLUMN',
    'ALTER',
    'ALTER COLUMN',
    'RENAME',
    'RENAME COLUMN',
    'RENAME TO',
])

function applyForbidden(ctx: SqlCompletionContext, keywords: string[]): string[] {
    if (ctx.statement !== 'select') return keywords
    const forbidden = forbiddenInSelectKeywords()
    return keywords.filter((kw) => !forbidden.has(kw))
}

/** JOIN 族（含限定词，便于 left → LEFT JOIN；空前缀时由 preferFullPhrase 去掉限定词） */
const JOIN_FAMILY = new Set([
    'JOIN',
    'INNER JOIN',
    'LEFT JOIN',
    'RIGHT JOIN',
    'FULL JOIN',
    'CROSS JOIN',
    'STRAIGHT_JOIN',
    'INNER',
    'LEFT',
    'RIGHT',
    'FULL',
    'CROSS',
])

const SET_UNION = new Set(['UNION', 'UNION ALL', 'INTERSECT', 'EXCEPT'])

/** SELECT 列表：FROM / DISTINCT / AS（AS 靠前缀或空前缀 top 策略控制） */
const SELECT_LIST_KEYWORDS = new Set(['FROM', 'DISTINCT', 'AS'])

const AFTER_TABLE_KEYWORDS = new Set([
    'WHERE',
    ...JOIN_FAMILY,
    'GROUP BY',
    'GROUP',
    'ORDER BY',
    'ORDER',
    'LIMIT',
    'OFFSET',
    ...SET_UNION,
])

const AFTER_ON_KEYWORDS = new Set([
    'AND',
    'OR',
    'WHERE',
    ...JOIN_FAMILY,
    'GROUP BY',
    'GROUP',
    'ORDER BY',
    'ORDER',
    'HAVING',
    'LIMIT',
    'OFFSET',
    ...SET_UNION,
])

const AFTER_WHERE_KEYWORDS = new Set([
    'AND',
    'OR',
    'GROUP BY',
    'GROUP',
    'HAVING',
    'ORDER BY',
    'ORDER',
    'LIMIT',
    'OFFSET',
    ...SET_UNION,
])

const AFTER_GROUP_BY_KEYWORDS = new Set([
    'HAVING',
    'ORDER BY',
    'ORDER',
    'LIMIT',
    'OFFSET',
    ...SET_UNION,
])

/** HAVING 条件完整：ORDER / LIMIT / AND — 禁止 WHERE/JOIN/GROUP BY */
const AFTER_HAVING_KEYWORDS = new Set([
    'AND',
    'OR',
    'ORDER BY',
    'ORDER',
    'LIMIT',
    'OFFSET',
    ...SET_UNION,
])

/** ORDER BY（含 ASC/DESC）写完：LIMIT / OFFSET / FETCH / UNION（方言关键字经 parserKeywords 交集生效） */
const AFTER_ORDER_BY_KEYWORDS = new Set([
    'LIMIT',
    'OFFSET',
    'FETCH FIRST',
    'FETCH NEXT',
    ...SET_UNION,
])

/** 空前缀时各槽位优先展示的关键字（其余需打前缀） */
const EMPTY_PREFIX_TOP: Partial<Record<string, string[]>> = {
    select_list: ['FROM', 'DISTINCT'],
    after_table: ['WHERE', 'LEFT JOIN', 'INNER JOIN', 'GROUP BY', 'ORDER BY'],
    after_on: ['WHERE', 'AND', 'LEFT JOIN', 'GROUP BY', 'ORDER BY'],
    after_where: ['AND', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT'],
    after_group_by: ['HAVING', 'ORDER BY', 'LIMIT'],
    after_having: ['ORDER BY', 'LIMIT', 'AND'],
    after_order_by: ['LIMIT', 'OFFSET', 'UNION ALL', 'FETCH FIRST'],
}

const OPERATORS_BY_KIND: Record<SqlValueKind, Set<string>> = {
    string: new Set([
        '=',
        '<>',
        '!=',
        'LIKE',
        'ILIKE',
        'SIMILAR TO',
        'IN',
        'IS',
        'IS NOT NULL',
        'BETWEEN',
        'NOT',
        'NULL',
    ]),
    numeric: new Set(['=', '<>', '!=', '>', '<', '>=', '<=', 'IN', 'BETWEEN', 'IS', 'IS NOT NULL', 'NOT', 'NULL']),
    boolean: new Set(['=', '<>', '!=', 'IS', 'IS NOT NULL', 'NOT', 'NULL']),
    temporal: new Set(['=', '<>', '!=', '>', '<', '>=', '<=', 'BETWEEN', 'IS', 'IS NOT NULL', 'NOT', 'NULL']),
    unknown: new Set([
        '=',
        '<>',
        '!=',
        '>=',
        '<=',
        '<',
        '>',
        'LIKE',
        'ILIKE',
        'IN',
        'IS',
        'BETWEEN',
        'EXISTS',
        'NOT',
        'IS NOT NULL',
        'NULL',
    ]),
}

const AGGREGATE_RE = /\b(?:COUNT|SUM|AVG|MIN|MAX|GROUP_CONCAT|STRING_AGG|ARRAY_AGG)\s*\(/i

function segmentHasAggregate(segment: string): boolean {
    return AGGREGATE_RE.test(segment)
}

function segmentHasGroupBy(segment: string): boolean {
    return /\bGROUP\s+BY\b/i.test(segment)
}

/** 查询表是否与 schema 中其它表有 FK（暗示下一步可能 JOIN） */
function queryHasOutboundFk(ctx: SqlCompletionContext): boolean {
    const fks = getActiveSqlEditorRuntime().getSchema().foreignKeys
    if (!fks?.length) return false
    const inQuery = new Set(tablesReferencedInQuery(ctx).map((t) => t.toLowerCase()))
    if (!inQuery.size) return false
    return fks.some((fk) => {
        const from = fk.fromTable.toLowerCase()
        const to = fk.toTable.toLowerCase()
        const fromIn = inQuery.has(from)
        const toIn = inQuery.has(to)
        return (fromIn && !toIn) || (toIn && !fromIn)
    })
}

/**
 * 按语句结构 / schema 调整空前缀 top 顺序（不增删集合外的关键字）。
 */
export function rankEmptyPrefixTop(
    slotKey: string,
    top: string[],
    ctx: SqlCompletionContext,
): string[] {
    if (!top.length) return top
    const ranked = [...top]
    const bump = (name: string, toIndex: number) => {
        const i = ranked.findIndex((k) => normalizeClauseKeyword(k) === name)
        if (i < 0 || i === toIndex) return
        const [item] = ranked.splice(i, 1)
        ranked.splice(Math.min(toIndex, ranked.length), 0, item)
    }

    if (slotKey === 'after_table' || slotKey === 'after_on') {
        if (segmentHasAggregate(ctx.segment) && !segmentHasGroupBy(ctx.segment)) {
            bump('GROUP BY', 0)
        } else if (queryHasOutboundFk(ctx)) {
            bump('LEFT JOIN', 0)
            bump('INNER JOIN', 1)
        } else if (tablesReferencedInQuery(ctx).length <= 1) {
            bump('WHERE', 0)
        }
    }

    if (slotKey === 'after_where') {
        if (segmentHasAggregate(ctx.segment) && !segmentHasGroupBy(ctx.segment)) {
            bump('GROUP BY', 0)
        }
    }

    return ranked
}

/**
 * 按 keywordSlot 收紧 clause-next / clause-prefix 关键字。
 */
export function filterKeywordsForKeywordSlot(
    keywordSlot: KeywordSlotOverride | undefined,
    keywordPhase: KeywordPhase,
    keywords: string[],
): string[] {
    let allowed: Set<string> | null = null

    if (keywordPhase === 'clause-prefix' || keywordSlot === 'select_list') {
        allowed = SELECT_LIST_KEYWORDS
    } else if (keywordSlot === 'after_table') {
        allowed = AFTER_TABLE_KEYWORDS
    } else if (keywordSlot === 'after_on') {
        allowed = AFTER_ON_KEYWORDS
    } else if (keywordSlot === 'after_where') {
        allowed = AFTER_WHERE_KEYWORDS
    } else if (keywordSlot === 'after_group_by') {
        allowed = AFTER_GROUP_BY_KEYWORDS
    } else if (keywordSlot === 'after_having') {
        allowed = AFTER_HAVING_KEYWORDS
    } else if (keywordSlot === 'after_order_by') {
        allowed = AFTER_ORDER_BY_KEYWORDS
    } else if (keywordSlot === 'after_set') {
        allowed = AFTER_SET_KEYWORDS
    } else if (keywordSlot === 'after_alter_table') {
        allowed = ALTER_AFTER_TABLE_KEYWORDS
    }

    if (!allowed) return keywords
    return keywords.filter((kw) => allowed!.has(normalizeClauseKeyword(kw)))
}

function resolveEmptyPrefixSlotKey(
    keywordSlot: KeywordSlotOverride | undefined,
    keywordPhase: KeywordPhase,
    ctx?: SqlCompletionContext,
): string {
    if (keywordPhase === 'clause-prefix' || keywordSlot === 'select_list') {
        if (ctx?.signals.after_select_list_item || ctx?.signals.after_select_list_complete_col) {
            return 'select_list_after_item'
        }
        return 'select_list'
    }
    return String(keywordSlot ?? '')
}

/** 空前缀只保留高频 top-N；有前缀时返回全部（由 matchesKeywordPrefix 再滤） */
export function limitKeywordsForEmptyPrefix(
    keywordSlot: KeywordSlotOverride | undefined,
    keywordPhase: KeywordPhase,
    keywords: string[],
    prefix: string,
    ctx?: SqlCompletionContext,
): string[] {
    if (prefix.trim()) return keywords
    if (
        keywordPhase !== 'clause-next' &&
        keywordPhase !== 'clause-prefix' &&
        keywordSlot !== 'select_list'
    ) {
        return keywords
    }

    const slotKey = resolveEmptyPrefixSlotKey(keywordSlot, keywordPhase, ctx)
    let top: string[] | undefined
    if (slotKey === 'select_list_after_item') {
        top = ['AS', 'FROM']
    } else {
        top = EMPTY_PREFIX_TOP[slotKey]
        if (top?.length && ctx) {
            top = rankEmptyPrefixTop(slotKey, top, ctx)
        }
    }
    if (!top?.length) return keywords

    const byNorm = new Map(keywords.map((kw) => [normalizeClauseKeyword(kw), kw]))
    const picked: string[] = []
    for (const name of top) {
        const hit = byNorm.get(name)
        if (hit) picked.push(hit)
    }
    return picked.length ? picked : keywords.slice(0, Math.min(5, keywords.length))
}

export function filterOperatorsByValueKind(keywords: string[], kind: SqlValueKind): string[] {
    const allowed = OPERATORS_BY_KIND[kind] ?? OPERATORS_BY_KIND.unknown
    return keywords.filter((kw) => allowed.has(normalizeClauseKeyword(kw)))
}

/**
 * 提示条用：当前槽位「下一步」关键字摘要（与空前缀 top 列表同源）。
 */
export function nextKeywordHintsForPlan(
    plan: Pick<SqlCompletionPlan, 'keywordPhase' | 'keywordSlot'>,
    ctx?: SqlCompletionContext,
): string[] {
    const slotKey =
        plan.keywordPhase === 'clause-prefix' || plan.keywordSlot === 'select_list'
            ? ctx?.signals.after_select_list_item || ctx?.signals.after_select_list_complete_col
                ? 'select_list_after_item'
                : 'select_list'
            : String(plan.keywordSlot ?? '')
    if (slotKey === 'select_list_after_item') return ['AS', 'FROM']
    let top = EMPTY_PREFIX_TOP[slotKey] ?? []
    if (top.length && ctx) {
        top = rankEmptyPrefixTop(slotKey, top, ctx)
    }
    return top
}

/** 补全关键字：keywords-config → phase → slot → phrase prefer → empty-prefix top */
export function resolveCompletionKeywords(
    ctx: SqlCompletionContext,
    plan: Pick<SqlCompletionPlan, 'keywordPhase' | 'keywordSlot'> & {
        parserKeywords?: string[]
    },
    options?: {prefix?: string; valueKind?: SqlValueKind},
): string[] {
    if (plan.keywordPhase === 'function-open' || plan.keywordSlot === 'select_aggregate') {
        return ['(']
    }

    let keywords = plan.parserKeywords?.length ? [...plan.parserKeywords] : []
    keywords = filterParserNoiseKeywords(keywords)
    keywords = applyForbidden(ctx, keywords)
    if (!keywords.length) return []

    keywords = filterKeywordsByPhase(keywords, plan.keywordPhase)
    keywords = filterKeywordsForKeywordSlot(plan.keywordSlot, plan.keywordPhase, keywords)
    keywords = filterKeywordsForDmlStatement(ctx, plan, keywords)

    if (plan.keywordPhase === 'operators' && options?.valueKind) {
        keywords = filterOperatorsByValueKind(keywords, options.valueKind)
    }

    if (plan.keywordPhase === 'clause-next' || plan.keywordPhase === 'clause-prefix') {
        keywords = sortClauseNextKeywords(keywords)
    }

    const prefix = options?.prefix ?? ''
    keywords = preferFullPhraseKeywords(keywords, prefix)

    keywords = limitKeywordsForEmptyPrefix(
        plan.keywordSlot,
        plan.keywordPhase,
        keywords,
        prefix,
        ctx,
    )
    return keywords
}
