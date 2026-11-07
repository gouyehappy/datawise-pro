import {parseCteAliasesVisibleAt, parseTableAliases, statementBoundsAtOffset} from '@sql-editor/utils/parse-references'
import type {SqlCompletionSlot, SqlStatementKind} from '@sql-editor/types'
import {analyzeFromJoinTableState, type FromJoinTableState} from './from-join'
import {codeParenDepthAt, lastKeywordEndInCode} from './sql-scan'
import {maskNonCodeRegionsCached} from './incremental-scan'
import {
    getCachedAnalysis,
    schemaFingerprint,
    setCachedAnalysis,
} from './analysis-cache'
import {completionSegmentAtOffset} from './grammar/transitions/predicate'
import {
    computeGrammarSignals,
    hasSignal,
    type GrammarSignals,
} from './grammar/engine/signals'
import {resolveSlotFromGrammar} from './grammar/engine/clause-active'

export type {FromJoinTableState} from './from-join'
export type {GrammarSignals} from './grammar/engine/signals'
export {hasSignal} from './grammar/engine/signals'

export interface SqlCompletionContext {
    statement: SqlStatementKind
    slot: SqlCompletionSlot
    /** 点号前的标识符（表名或别名） */
    qualifier: string | null
    /** 别名 → 表名 */
    aliases: Record<string, string>
    /** 当前点号解析到的物理表名 */
    resolvedTable: string | null
    /** 点号后已输入的字段前缀（如 tag_na） */
    columnPrefix: string | null
    /** 语法转移信号 — 单一真相源，替代散落 bool */
    signals: GrammarSignals
    /** FROM/JOIN 表名槽位解析（含表是否已选定） */
    fromJoin: FromJoinTableState | null
    /** after_complete_column_ref 时用于关键字/片段的槽位（where / on / having …） */
    predicateSlot: SqlCompletionSlot | null
    /** 当前语句片段（用于已选列解析） */
    segment: string
}

const IDENT = '[`"\']?([A-Za-z_][\\w$]*)[`"\']?'

function unquote(value: string): string {
    return value.replace(/^[`"']|[`"']$/g, '')
}

function cursorLineAtOffset(sql: string, offset: number): {
    line: string
    lineBefore: string
    column: number
} {
    const safe = Math.max(0, Math.min(offset, sql.length))
    const lineStart = sql.lastIndexOf('\n', safe - 1) + 1
    const lineEnd = sql.indexOf('\n', safe)
    const line = sql.slice(lineStart, lineEnd === -1 ? sql.length : lineEnd)
    const lineBefore = sql.slice(lineStart, safe)
    return {line, lineBefore, column: safe - lineStart + 1}
}

/** 子查询 / 括号内：只取当前 SELECT 作用域片段，避免外层 WHERE 干扰 */
function extractScopedSegment(segment: string, maskedSegment?: string): string {
    const trimmed = segment.trimStart()
    if (/^(create|alter|drop|truncate)\b/i.test(trimmed)) return segment

    const masked = maskedSegment ?? maskNonCodeRegionsCached(segment)
    const depth = codeParenDepthAt(segment, segment.length)
    if (depth === 0) return segment

    let d = depth
    for (let i = masked.length - 1; i >= 0 && d > 0; i--) {
        const ch = masked[i]
        if (ch === ')') d++
        else if (ch === '(') {
            d--
            if (d === 0) {
                const inner = segment.slice(i + 1)
                const selectMatch = /\bSELECT\b/i.exec(masked.slice(i + 1))
                if (selectMatch?.index !== undefined) {
                    return inner.slice(selectMatch.index)
                }
                // 非 SELECT 括号（INSERT 列清单 / VALUES / 函数实参等）：保留整句，避免丢语句类型
                return segment
            }
        }
    }
    return segment
}

function detectStatementKind(segment: string): SqlStatementKind {
    const trimmed = segment.trim()
    if (!trimmed) return 'empty'
    if (/^\s*select\b/i.test(trimmed) || /\bselect\b/i.test(trimmed)) return 'select'
    if (/^\s*insert\b/i.test(trimmed)) return 'insert'
    if (/^\s*update\b/i.test(trimmed)) return 'update'
    if (/^\s*delete\b/i.test(trimmed)) return 'delete'
    if (/^\s*(create|alter|drop|truncate|grant|revoke)\b/i.test(trimmed)) return 'ddl'
    return 'unknown'
}

/** 括号内 alias. 时 scoped 片段可能仅为 "cs."，需回退到整句判断语句类型 */
function resolveStatementKind(
    scopedSegment: string,
    statementText: string,
    slot: SqlCompletionSlot,
): SqlStatementKind {
    const scoped = detectStatementKind(scopedSegment)
    if (slot === 'column_ref' && (scoped === 'unknown' || scoped === 'empty')) {
        const outer = detectStatementKind(statementText)
        if (outer !== 'unknown' && outer !== 'empty') return outer
    }
    return scoped
}

function lastMarkerIndex(masked: string, keyword: string): number {
    return lastKeywordEndInCode(masked, keyword)
}

/** Trino 等：{@code FROM catalog.} / {@code JOIN catalog.schema.} 是表名限定，不是 column_ref */
export function isFromJoinQualifiedTablePartial(segment: string): boolean {
    const trimmed = segment.trimEnd()
    return /\b(?:FROM|(?:INNER|LEFT|RIGHT|FULL|CROSS)\s+JOIN|JOIN)\s+[`"']?[\w$]+(?:\.[`"']?[\w$]+)*\.\s*$/i.test(
        trimmed,
    )
}

function detectMarkerSlot(
    segment: string,
    statement: SqlStatementKind,
    masked: string,
): SqlCompletionSlot {
    if (!segment.trim()) return 'statement_start'

    if (statement === 'select') {
        const markers: { slot: SqlCompletionSlot; index: number }[] = [
            {slot: 'order_by', index: lastMarkerIndex(masked, 'ORDER BY')},
            {slot: 'having', index: lastMarkerIndex(masked, 'HAVING')},
            {slot: 'group_by', index: lastMarkerIndex(masked, 'GROUP BY')},
            {slot: 'where', index: lastMarkerIndex(masked, 'WHERE')},
            {slot: 'tail', index: lastMarkerIndex(masked, 'LIMIT')},
            {slot: 'on', index: lastMarkerIndex(masked, 'ON')},
            {
                slot: 'join',
                index: Math.max(
                    lastMarkerIndex(masked, 'INNER JOIN'),
                    lastMarkerIndex(masked, 'LEFT JOIN'),
                    lastMarkerIndex(masked, 'RIGHT JOIN'),
                    lastMarkerIndex(masked, 'FULL JOIN'),
                    lastMarkerIndex(masked, 'CROSS JOIN'),
                    lastMarkerIndex(masked, 'JOIN'),
                ),
            },
            {slot: 'from', index: lastMarkerIndex(masked, 'FROM')},
            {slot: 'select_list', index: lastMarkerIndex(masked, 'SELECT')},
        ]
        const active = markers.filter((m) => m.index >= 0).sort((a, b) => b.index - a.index)
        return active[0]?.slot ?? 'statement_start'
    }

    if (statement === 'insert') {
        if (lastMarkerIndex(masked, 'VALUES') >= 0) return 'values'
        if (lastMarkerIndex(masked, 'INTO') >= 0) return 'insert_columns'
        return 'statement_start'
    }

    if (statement === 'update') {
        if (lastMarkerIndex(masked, 'WHERE') >= 0) return 'where'
        if (lastMarkerIndex(masked, 'SET') >= 0) return 'set'
        if (lastMarkerIndex(masked, 'UPDATE') >= 0) return 'update_table'
        return 'statement_start'
    }

    if (statement === 'delete') {
        if (lastMarkerIndex(masked, 'WHERE') >= 0) return 'where'
        if (lastMarkerIndex(masked, 'FROM') >= 0) return 'from'
        return 'statement_start'
    }

    if (statement === 'ddl') {
        return resolveSlotFromGrammar(segment, statement)
    }

    return 'statement_start'
}

function detectSlot(
    segment: string,
    statement: SqlStatementKind,
    skipColumnRef = false,
    maskedSegment?: string,
): SqlCompletionSlot {
    const masked = maskedSegment ?? maskNonCodeRegionsCached(segment)
    const markerSlot = detectMarkerSlot(segment, statement, masked)
    // 只剥行尾 CR/LF，保留空格：`alias.col ` 仍是完成态，不能当成 column_ref
    const columnRefTail = segment.replace(/[\r\n]+$/, '')

    // `alias.` / `alias.*`（点后可有空白）→ column_ref；`alias.col`（无尾随空白）→ column_ref
    // `alias.col ` 不匹配，保持 select_list 等完成态
    if (
        !skipColumnRef &&
        (/\b[\w$]+\.(?:\*|)\s*$/i.test(columnRefTail) || /\b[\w$]+\.\w+$/i.test(columnRefTail))
    ) {
        if (
            (markerSlot === 'from' || markerSlot === 'join')
            && isFromJoinQualifiedTablePartial(columnRefTail)
        ) {
            return markerSlot
        }
        return 'column_ref'
    }

    return markerSlot
}

const PREDICATE_SLOTS = new Set<SqlCompletionSlot>(['where', 'having', 'on', 'set'])

function detectPredicateSlot(slot: SqlCompletionSlot): SqlCompletionSlot | null {
    return PREDICATE_SLOTS.has(slot) ? slot : null
}

function buildKnownColumnNames(
    aliases: Record<string, string>,
    knownTables: string[],
    knownColumns: Record<string, { name: string }[]>,
): Set<string> {
    const names = new Set<string>()
    const tables = new Set<string>()
    for (const table of Object.values(aliases)) tables.add(table)
    for (const table of knownTables) tables.add(table)
    for (const table of tables) {
        const cols = knownColumns[table] ?? knownColumns[table.toLowerCase()]
        for (const col of cols ?? []) names.add(col.name.toLowerCase())
    }
    return names
}

/** 根据光标位置分析 SQL 补全上下文（无 LRU；Worker 内使用） */
export function effectiveCompletionSlot(ctx: SqlCompletionContext): SqlCompletionSlot {
    if (hasSignal(ctx, 'after_complete_on_predicate')) return 'where'
    if (hasSignal(ctx, 'after_complete_where_predicate')) return ctx.slot
    if (hasSignal(ctx, 'after_complete_column_ref') && ctx.predicateSlot) return ctx.predicateSlot
    if (ctx.fromJoin?.awaitingOnClause) return 'on'
    if (ctx.fromJoin?.tableClauseComplete && ctx.slot === 'insert_columns' && !hasSignal(ctx, 'insert_in_column_list')) {
        return 'values'
    }
    if (ctx.fromJoin?.tableClauseComplete && ctx.slot === 'update_table') return 'set'
    if (ctx.fromJoin?.tableClauseComplete && (ctx.slot === 'from' || ctx.slot === 'join')) {
        return ctx.slot === 'join' ? 'join' : 'where'
    }
    return ctx.slot
}

function parseQualifierBeforeDot(segment: string): string | null {
    const match = new RegExp(`(?:^|[\\s,(])${IDENT}\\.\\w*$`, 'i').exec(segment.replace(/[\r\n]+$/, ''))
    return match ? unquote(match[1]) : null
}

function partialColumnPrefix(segment: string): string | null {
    const tail = segment.replace(/[\r\n]+$/, '')
    if (/\b[\w$]+\.\*$/i.test(tail)) return '*'
    const match = /\b[\w$]+\.(\w*)$/i.exec(tail)
    return match?.[1] ?? null
}

function resolveTable(
    qualifier: string,
    aliases: Record<string, string>,
    knownTables: string[],
): string | null {
    const key = qualifier.toLowerCase()
    if (aliases[key]) return aliases[key]
    const table = knownTables.find((name) => name.toLowerCase() === key)
    return table ?? null
}

function mergeAliases(
    tableAliases: Record<string, string>,
    cteAliases: Record<string, string>,
): Record<string, string> {
    return {...tableAliases, ...cteAliases}
}

/**
 * SELECT 写在 FROM 上方时需整句解析别名；否则只解析光标之前，避免读到尚未写到的 FROM。
 */
function needsForwardAliasLookup(scopedSegment: string, slot: SqlCompletionSlot): boolean {
    if (slot === 'column_ref') return true
    return /\b[A-Za-z_][\w$]*\./i.test(scopedSegment)
}

/**
 * 解析表别名：优先当前作用域；若光标前尚无 FROM（如 SELECT 写在 FROM 上方），
 * 且已出现 alias. 引用，则回退到整句解析。
 */
function resolveTableAliases(
    sql: string,
    offset: number,
    scopedSegment: string,
    statementText: string,
    offsetInStatement: number,
    knownTables: string[],
    slot: SqlCompletionSlot,
): Record<string, string> {
    const scoped = parseTableAliases(scopedSegment, knownTables)
    if (Object.keys(scoped).length > 0) return scoped

    // 函数实参内 alias.（如 SUM(cs.)）scoped 仅为 "cs."，需整句前向解析 FROM 别名
    if (codeParenDepthAt(sql, offset) > 0 && slot !== 'column_ref') return scoped

    const parseSource = needsForwardAliasLookup(scopedSegment, slot)
        ? statementText
        : statementText.slice(0, offsetInStatement)

    return parseTableAliases(parseSource, knownTables)
}

/** 根据光标位置分析 SQL 补全上下文（无 LRU；Worker 内使用） */
export function analyzeSqlCompletionContextUncached(
    sql: string,
    offset: number,
    knownTables: string[] = [],
    knownColumns: Record<string, { name: string }[]> = {},
): SqlCompletionContext {
    const bounds = statementBoundsAtOffset(sql, offset)
    const {segment: rawSegment, offsetInSegment, afterStatementSemicolon} =
        completionSegmentAtOffset(sql, offset, bounds)
    const offsetInStatement = afterStatementSemicolon ? offsetInSegment : offset - bounds.start
    const maskedRawSegment = maskNonCodeRegionsCached(rawSegment)
    const segment = extractScopedSegment(rawSegment, maskedRawSegment)
    const maskedSegment = segment === rawSegment ? maskedRawSegment : maskNonCodeRegionsCached(segment)
    const maskedStatement = maskNonCodeRegionsCached(bounds.text)
    const slot = detectSlot(segment, detectStatementKind(segment), false, maskedSegment)
    const statement = resolveStatementKind(segment, bounds.text, slot)
    const tableAliases = resolveTableAliases(
        sql,
        offset,
        segment,
        bounds.text,
        offsetInStatement,
        knownTables,
        slot,
    )
    const cteAliases = parseCteAliasesVisibleAt(bounds.text, offsetInStatement, maskedStatement)
    const aliases = mergeAliases(tableAliases, cteAliases)
    const knownColumnNames = buildKnownColumnNames(aliases, knownTables, knownColumns)
    const qualifier = slot === 'column_ref' ? parseQualifierBeforeDot(segment) : null
    const resolvedTable = qualifier ? resolveTable(qualifier, aliases, knownTables) : null
    const columnPrefix = slot === 'column_ref' ? partialColumnPrefix(segment) : null
    const predicateSlot = detectPredicateSlot(slot)
    const {line, lineBefore, column} = cursorLineAtOffset(sql, offset)
    const fromJoin = analyzeFromJoinTableState(slot, line, lineBefore, column, knownTables)
    const signals = computeGrammarSignals({
        segment,
        slot,
        columnPrefix,
        resolvedTable,
        knownColumns,
        knownColumnNames,
        fromJoin,
    })

    return {
        statement,
        slot,
        qualifier,
        aliases,
        resolvedTable,
        columnPrefix,
        signals,
        fromJoin,
        predicateSlot,
        segment,
    }
}

/** 根据光标位置分析 SQL 补全上下文（LRU 缓存，HintBar / Provider 共用） */
export function analyzeSqlCompletionContext(
    sql: string,
    offset: number,
    knownTables: string[] = [],
    knownColumns: Record<string, { name: string }[]> = {},
): SqlCompletionContext {
    const schemaKey = schemaFingerprint(knownTables, knownColumns)
    const cached = getCachedAnalysis(sql, offset, schemaKey)
    if (cached) return cached
    const ctx = analyzeSqlCompletionContextUncached(sql, offset, knownTables, knownColumns)
    setCachedAnalysis(sql, offset, schemaKey, ctx)
    return ctx
}

/** SQL 中已通过 FROM/JOIN 引用的物理表 */
export function tablesReferencedInQuery(ctx: SqlCompletionContext): string[] {
    const seen = new Set<string>()
    const result: string[] = []
    for (const table of Object.values(ctx.aliases)) {
        const key = table.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        result.push(table)
    }
    return result
}

export function hasTablesInQuery(ctx: SqlCompletionContext): boolean {
    return tablesReferencedInQuery(ctx).length > 0
}
