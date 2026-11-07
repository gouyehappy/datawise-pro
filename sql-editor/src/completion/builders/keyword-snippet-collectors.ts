import type {SqlCompletionContext} from '../context'
import {effectiveCompletionSlot} from '../context'
import type {SqlCompletionPlan} from '../grammar/types'
import {resolveCompletionKeywords} from '../plan-keywords'
import {listSqlDialectFunctionSignatures} from '../function-signatures'
import {
    buildFunctionInsertSnippet,
    formatFunctionDisplaySignature,
    functionFilterText,
} from '../function-presentation'
import {
    commonFunctionPinBoost,
    functionAffinityBoost,
    resolveFunctionContextHint,
} from '../function-affinity'
import {snippetsForContext} from '../suggestion-policy'
import {presentSnippetFromConfig} from '../snippet-presentation'
import {categoryCompletionLabel, completionItemKind, functionCompletionLabel} from '../completion-labels'
import {buildFilterText, keywordFilterText, matchesCompletionPrefix, matchesKeywordPrefix} from '../filter-text'
import {shouldOfferKeywordAtCursor} from '../completed-keyword'
import {SQL_DDL_COLUMN_TYPES} from '../ddl-column-types'
import {completionSort} from './sort-state'
import type {SuggestEditorSlice, SuggestItem, SuggestPush, SuggestTextRange} from '../suggest-types'
import {SUGGEST_INSERT_AS_SNIPPET} from '../suggest-types'
import {getSchemaContext, localeT, typeT} from './collector-locale'
import type {SqlCompletionSlot} from '@sql-editor/types'
import {getActiveSqlEditorRuntime} from '@sql-editor/runtime/sql-editor-runtime'
import {resolveSqlDialectFile} from '@sql-editor/completion/dialect-aliases'
import {suggestRangeReplacingTypedPrefix} from '../range'
import {classifyColumnType} from '../column-type'
import {resolvePredicateLeftColumn} from '../predicate-column'
import {tablesReferencedInQuery} from '../context'
import {buildKeywordInsert, structureKeywordsForSlot} from '../keyword-insert'

const CHAIN_CONNECTOR_KEYWORDS = new Set([
    'AND',
    'OR',
    'ORDER BY',
    'GROUP BY',
    'HAVING',
    'LIMIT',
    'OFFSET',
])

const TRIGGER_SUGGEST_COMMAND = {id: 'editor.action.triggerSuggest', title: 'Trigger Suggest'} as const

/** 接受比较符后立刻再弹，进入值/对面列阶段 */
function shouldChainAfterOperator(keyword: string): boolean {
    const k = keyword.trim().toUpperCase().replace(/\s+/g, ' ')
    if (k === 'IS NOT NULL' || k === 'IS NULL' || k === 'NOT' || k === 'NULL') return false
    return (
        k === '=' ||
        k === '<>' ||
        k === '!=' ||
        k === '>' ||
        k === '<' ||
        k === '>=' ||
        k === '<=' ||
        k === 'LIKE' ||
        k === 'ILIKE' ||
        k === 'IN' ||
        k === 'BETWEEN' ||
        k === 'IS'
    )
}

/**
 * 表达式槽位可出函数。ORDER BY / GROUP BY 仍以列优先（避免 `c` → COUNT 抢选）。
 * 函数已独立为 `functions` 收集器，不再挂在 keywords 上（否则 WHERE 选列阶段 keywordPhase=none 时函数全灭）。
 */
const FUNCTION_SUGGESTION_SLOTS = new Set([
    'select_list',
    'column_ref',
    'where',
    'having',
    'on',
    'set',
    'values',
])

export function collectFunctionSuggestions(
    ctx: SqlCompletionContext,
    push: SuggestPush,
    range: SuggestTextRange,
    prefix: string,
    plan: SqlCompletionPlan,
    lineBeforeCursor?: string,
) {
    const afterClause =
        plan.keywordSlot === 'after_table' ||
        plan.keywordSlot === 'after_on' ||
        plan.keywordSlot === 'after_where' ||
        plan.keywordSlot === 'after_group_by' ||
        plan.keywordSlot === 'after_having' ||
        plan.keywordSlot === 'after_order_by' ||
        plan.keywordPhase === 'clause-next' ||
        plan.keywordPhase === 'insert-clause-next' ||
        plan.keywordPhase === 'update-clause-next' ||
        plan.keywordPhase === 'operators' ||
        plan.keywordPhase === 'sort-direction' ||
        plan.keywordPhase === 'join-on-only'
    if (afterClause) return

    const slot = effectiveCompletionSlot(ctx)
    if (!FUNCTION_SUGGESTION_SLOTS.has(slot)) return
    // `t.` / `orders.` 限定列：不出函数，避免抢字段
    if (ctx.slot === 'column_ref' && ctx.qualifier) return
    const tails = [lineBeforeCursor, ctx.segment].filter(Boolean) as string[]
    if (tails.some((t) => /\b[A-Za-z_][\w$]*\.\w*$/.test(t.replace(/[\r\n]+$/, '')))) return

    const emptyPrefix = !prefix.trim()
    // 空前缀：仅 SELECT 列表给常用函数（P2）；其它槽位仍需字母
    if (emptyPrefix && slot !== 'select_list') return
    if (!emptyPrefix && !/[A-Za-z_]/.test(prefix)) return

    const schema = getSchemaContext()
    const hint = resolveFunctionContextHint(ctx, schema)
    const fnType = typeT('function')
    const fnRange = suggestRangeReplacingTypedPrefix(range, prefix)

    let matched = listSqlDialectFunctionSignatures().filter((fn) =>
        emptyPrefix ? commonFunctionPinBoost(fn) < 0 : matchesCompletionPrefix(fn.name, prefix),
    )
    if (emptyPrefix) {
        // SELECT 空前缀再补一条 COUNT(*) 快捷项
        matched = matched.filter((fn) => /^(COUNT|SUM|AVG|MIN|MAX|IFNULL|COALESCE|NOW)$/i.test(fn.name))
    }
    matched.sort(
        (a, b) =>
            functionAffinityBoost(a, hint) - functionAffinityBoost(b, hint) ||
            a.name.localeCompare(b.name),
    )

    matched.forEach((fn, fnIndex) => {
        const displaySignature = formatFunctionDisplaySignature(fn.signature) ?? '()'
        const returns = fn.returns?.trim()
        const docLines = [
            `\`${fn.name}${displaySignature}\``,
            returns ? localeT('completion.function.returns', {type: returns}) : '',
        ].filter(Boolean)
        const isCountStar = emptyPrefix && fn.name.toUpperCase() === 'COUNT'
        push({
            label: functionCompletionLabel(
                isCountStar ? 'COUNT(*)' : fn.name,
                fnType,
                isCountStar ? undefined : displaySignature,
                returns,
            ),
            kind: completionItemKind('function'),
            insertText: isCountStar ? 'COUNT(*)' : buildFunctionInsertSnippet(fn),
            insertTextRules: isCountStar ? undefined : SUGGEST_INSERT_AS_SNIPPET,
            detail: returns || localeT('completion.type.function'),
            documentation: {value: docLines.join('\n\n'), isTrusted: true},
            filterText: functionFilterText(fn.name),
            range: fnRange,
            // matched 已按 affinity 排好；勿把负数塞进 completionSort（padStart → "-200"）
            sortText: completionSort('function', fnIndex),
            // 空前缀不抢 preselect（与列/片段抢焦点）；有字母前缀时首项可预选
            preselect: !emptyPrefix && fnIndex === 0,
        })
    })
}

export function collectKeywordSuggestions(
    ctx: SqlCompletionContext,
    push: SuggestPush,
    editor: SuggestEditorSlice,
    range: SuggestTextRange,
    prefix: string,
    plan: SqlCompletionPlan,
) {
    const kwType = typeT('keyword')
    const afterClause =
        plan.keywordSlot === 'after_table' ||
        plan.keywordSlot === 'after_on' ||
        plan.keywordSlot === 'after_where' ||
        plan.keywordSlot === 'after_group_by' ||
        plan.keywordSlot === 'after_having' ||
        plan.keywordSlot === 'after_order_by' ||
        plan.keywordPhase === 'insert-clause-next' ||
        plan.keywordPhase === 'update-clause-next'
    let index = 0
    let preselected = false
    const predicateClauseExit =
        ctx.signals.after_complete_where_predicate ||
        ctx.signals.after_complete_on_predicate ||
        ctx.signals.after_complete_group_by_list ||
        ctx.signals.after_complete_having_predicate ||
        ctx.signals.after_complete_order_by
    const fromParser = (plan.parserKeywords?.length ?? 0) > 0
    const lineBefore = editor.lineBeforeCursor

    const slot = effectiveCompletionSlot(ctx)
    // Keywords always replace the full handwritten prefix (wh → WHERE, ord → ORDER BY).
    const keywordRange = suggestRangeReplacingTypedPrefix(range, prefix)

    // CASE / OVER / WITH：前缀命中时注入结构片段（不进 clause 白名单，避免空前缀噪音）
    for (const structure of structureKeywordsForSlot(slot, prefix)) {
        push({
            label: categoryCompletionLabel(structure.label, kwType),
            kind: completionItemKind('keyword'),
            insertText: structure.insertText,
            insertTextRules: SUGGEST_INSERT_AS_SNIPPET,
            detail: localeT('completion.keyword'),
            filterText: keywordFilterText(structure.label),
            range: keywordRange,
            sortText: completionSort('keyword', index++),
            command: TRIGGER_SUGGEST_COMMAND,
        })
    }

    let valueKind: ReturnType<typeof classifyColumnType> | undefined
    if (plan.keywordPhase === 'operators') {
        const schema = getSchemaContext()
        const left = resolvePredicateLeftColumn(
            ctx.segment,
            ctx.aliases,
            tablesReferencedInQuery(ctx),
            schema,
        )
        valueKind = classifyColumnType(left?.meta.type)
    }

    for (const keyword of resolveCompletionKeywords(ctx, plan, {prefix, valueKind})) {
        const prefixOk = matchesKeywordPrefix(keyword, prefix)
        if (predicateClauseExit) {
            if (!prefixOk) continue
        } else if (fromParser && prefix && !prefixOk) {
            continue
        }
        if (!shouldOfferKeywordAtCursor(lineBefore, keyword, prefix)) continue
        if (
            ctx.signals.after_condition_connector &&
            CHAIN_CONNECTOR_KEYWORDS.has(keyword.toUpperCase())
        ) {
            continue
        }
        const preferWhere =
            plan.keywordSlot === 'after_table' &&
            !preselected &&
            Boolean(prefix) &&
            prefix.toLowerCase().startsWith('wh')
        const preselect =
            !preselected &&
            ((preferWhere && keyword.toUpperCase() === 'WHERE') ||
                (!preferWhere && plan.sortProfile === 'keyword-first' && index === 0))
        if (preselect) preselected = true

        const insert = buildKeywordInsert(keyword, {
            trailingSpaceFallback: afterClause || plan.keywordPhase === 'clause-next',
            lineBefore,
            typedPrefix: prefix,
        })
        // 非子句出口（如运算符）保持纯文本，避免 = 变成 snippet
        const useSnippet =
            insert.asSnippet &&
            (afterClause ||
                plan.keywordPhase === 'clause-next' ||
                plan.keywordPhase === 'clause-prefix' ||
                plan.keywordPhase === 'connectors' ||
                plan.keywordPhase === 'insert-clause-next' ||
                plan.keywordPhase === 'update-clause-next' ||
                plan.keywordPhase === 'join-on-only')

        let insertText = useSnippet ? insert.insertText : afterClause ? `${keyword} ` : keyword
        // `t1.col|` 后插 AS：需前导空格，避免 colAS
        if (
            useSnippet &&
            (ctx.signals.after_select_list_item || ctx.signals.after_select_list_complete_col) &&
            insertText &&
            !/^\s/.test(insertText) &&
            !/\n/.test(insertText) &&
            lineBefore.length > 0 &&
            !/\s$/.test(lineBefore)
        ) {
            insertText = ` ${insertText}`
        }

        const chainSuggest =
            (useSnippet && insert.chainSuggest) ||
            (plan.keywordPhase === 'operators' && shouldChainAfterOperator(keyword))

        push({
            label: categoryCompletionLabel(keyword, kwType),
            kind: completionItemKind('keyword'),
            insertText,
            insertTextRules: useSnippet ? SUGGEST_INSERT_AS_SNIPPET : undefined,
            detail: localeT('completion.keyword'),
            filterText: keywordFilterText(keyword),
            range: keywordRange,
            sortText: completionSort('keyword', index),
            preselect,
            command: chainSuggest ? TRIGGER_SUGGEST_COMMAND : undefined,
        })
        index++
    }
}

export function collectDdlTypeSuggestions(
    push: SuggestPush,
    range: SuggestTextRange,
    prefix: string,
) {
    const typeLabel = typeT('keyword')
    let index = 0
    for (const ddlType of SQL_DDL_COLUMN_TYPES) {
        if (prefix && !ddlType.toLowerCase().startsWith(prefix.toLowerCase())) continue
        push({
            label: categoryCompletionLabel(ddlType, typeLabel),
            kind: completionItemKind('keyword'),
            insertText: ddlType,
            detail: typeLabel,
            filterText: buildFilterText(ddlType, [ddlType]),
            range,
            sortText: completionSort('keyword', index++),
        })
    }
}

export function collectSnippetSuggestions(
    ctx: SqlCompletionContext,
    push: (item: SuggestItem) => void,
    range: SuggestTextRange,
    prefix: string,
    snippetSlot: SqlCompletionSlot,
    _plan: SqlCompletionPlan,
) {
    let index = 0
    const dialectFile = resolveSqlDialectFile(getActiveSqlEditorRuntime().getDialect())
    const snippetType = typeT('snippet')
    for (const snippet of snippetsForContext(ctx.statement, snippetSlot, prefix, ctx.segment)) {
        const presentation = presentSnippetFromConfig(
            snippet,
            'en',
            snippetType,
            dialectFile === 'sqlserver' ? 'sqlserver' : undefined,
        )
        push({
            label: presentation.completionLabel,
            kind: completionItemKind('snippet'),
            insertText: snippet.insertText,
            insertTextRules: SUGGEST_INSERT_AS_SNIPPET,
            detail: presentation.completionDetail,
            documentation: presentation.documentation,
            filterText: buildFilterText(snippet.label, [
                presentation.summary,
                presentation.sqlPreview,
                snippetType,
            ]),
            // Same rule as keywords: replace the full typed trigger (e.g. ord → ORDER BY …)
            range: suggestRangeReplacingTypedPrefix(range, prefix),
            sortText: completionSort('snippet', index++),
            command: {id: 'editor.action.triggerSuggest', title: 'Trigger Suggest'},
        })
    }
}
