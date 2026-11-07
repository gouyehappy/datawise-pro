import {existingAliasAfterTableOnLine} from '@sql-editor/utils/alias-line'
import type {SqlCompletionSlot} from '@sql-editor/types'
import {
    findKnownTable,
    hasLongerTablePrefix,
    isCompleteKnownTableRef,
    unquoteTableIdent,
} from '@sql-editor/utils/table-reference'

export {findKnownTable, hasLongerTablePrefix} from '@sql-editor/utils/table-reference'

const TABLE_PREFIX_ONLY =
    /^([`"']?[\w$]+(?:\.[`"']?[\w$]+){0,2}[`"']?[.]?)\s*$/i

const TABLE_WITH_TAIL =
    /^([`"']?[\w$]+(?:\.[`"']?[\w$]+){0,2}[`"']?)\s+(.*)$/i

const JOIN_QUALIFIERS = ['inner', 'left', 'right', 'full', 'cross', 'join'] as const

/** 表+别名后的下一子句关键字首词（WHERE / GROUP / ORDER …） */
const CLAUSE_FIRST_WORDS = [
    'where',
    'group',
    'order',
    'having',
    'limit',
    'offset',
    'union',
    'intersect',
    'except',
] as const

function isJoinQualifierToken(token: string): boolean {
    return JOIN_QUALIFIERS.includes(token.toLowerCase() as (typeof JOIN_QUALIFIERS)[number])
}

/** JOIN 限定词或其前缀（如 l → left） */
export function joinQualifierPrefix(token: string): string | null {
    if (!token) return null
    const lower = token.toLowerCase()
    if (isJoinQualifierToken(lower)) return lower
    const matches = JOIN_QUALIFIERS.filter((q) => q.startsWith(lower))
    if (matches.length >= 1) return lower
    return null
}

/** 下一子句关键字或其前缀（如 whe → WHERE） */
export function clauseKeywordPrefix(token: string): string | null {
    if (!token) return null
    const lower = token.toLowerCase()
    const matches = CLAUSE_FIRST_WORDS.filter((w) => w.startsWith(lower))
    if (matches.length >= 1) return lower
    return null
}

function parseTableClauseTail(tail: string): {
    alias: string | null
    joinKeywordPrefix: string | null
    clauseKeywordPrefix: string | null
} {
    const trimmed = tail.trim()
    if (!trimmed) return {alias: null, joinKeywordPrefix: null, clauseKeywordPrefix: null}
    if (lineEndsWithCompleteJoin(trimmed)) {
        return {alias: null, joinKeywordPrefix: null, clauseKeywordPrefix: null}
    }

    let tokens = trimmed.split(/\s+/).filter(Boolean)
    if (tokens[0]?.toUpperCase() === 'AS') tokens = tokens.slice(1)
    if (!tokens.length) return {alias: null, joinKeywordPrefix: null, clauseKeywordPrefix: null}

    if (tokens.length === 1) {
        const tok = tokens[0]
        if (joinQualifierPrefix(tok)) return {alias: null, joinKeywordPrefix: tok, clauseKeywordPrefix: null}
        const clausePref = clauseKeywordPrefix(tok)
        if (clausePref) return {alias: null, joinKeywordPrefix: null, clauseKeywordPrefix: clausePref}
        return {alias: tok, joinKeywordPrefix: null, clauseKeywordPrefix: null}
    }

    if (tokens.length === 2) {
        const [aliasTok, second] = tokens
        const joinPref = joinQualifierPrefix(second)
        if (joinPref) return {alias: aliasTok, joinKeywordPrefix: joinPref, clauseKeywordPrefix: null}
        const clausePref = clauseKeywordPrefix(second)
        if (clausePref) return {alias: aliasTok, joinKeywordPrefix: null, clauseKeywordPrefix: clausePref}
        return {alias: second, joinKeywordPrefix: null, clauseKeywordPrefix: null}
    }

    const last = tokens[tokens.length - 1]
    if (joinQualifierPrefix(last)) {
        const aliasTok = tokens[tokens.length - 2]
        if (aliasTok && !isJoinQualifierToken(aliasTok)) {
            return {alias: aliasTok, joinKeywordPrefix: last, clauseKeywordPrefix: null}
        }
        return {alias: null, joinKeywordPrefix: last, clauseKeywordPrefix: null}
    }

    const clausePref = clauseKeywordPrefix(last)
    if (clausePref) {
        return {alias: tokens[0] ?? null, joinKeywordPrefix: null, clauseKeywordPrefix: clausePref}
    }

    return {alias: tokens[tokens.length - 1], joinKeywordPrefix: null, clauseKeywordPrefix: null}
}

type ActiveClause = {
    kind: 'from' | 'join' | 'update'
    segmentStart: number
}

/** 光标前一行内，取最后一个表名槽（FROM / JOIN / UPDATE…SET 前）起点 */
function findActiveClause(lineBeforeCursor: string): ActiveClause | null {
    let last: ActiveClause | null = null
    for (const m of lineBeforeCursor.matchAll(/\bUPDATE\s+/gi)) {
        const afterUpdate = lineBeforeCursor.slice(m.index! + m[0].length)
        if (!/\bSET\b/i.test(afterUpdate)) {
            last = {kind: 'update', segmentStart: m.index! + m[0].length}
        }
    }
    for (const m of lineBeforeCursor.matchAll(
        /\b(FROM|(?:INNER|LEFT|RIGHT|FULL|CROSS)\s+JOIN|JOIN)\s+/gi,
    )) {
        const opener = m[1].toUpperCase().replace(/\s+/g, ' ')
        const candidate: ActiveClause = {
            kind: opener === 'FROM' ? 'from' : 'join',
            segmentStart: m.index! + m[0].length,
        }
        if (!last || candidate.segmentStart >= last.segmentStart) {
            last = candidate
        }
    }
    return last
}

export interface FromJoinTableState {
    tablePrefix: string
    resolvedTable: string | null
    /** 表名已定（含行内 alias 在光标后，或光标前已写完 table alias） */
    tableClauseComplete: boolean
    /** 光标后同一行已有别名（如 orders| ord） */
    aliasOnLineAfterCursor: string | null
    /** 表/别名后的 JOIN 限定词或其前缀（left / inner …） */
    joinKeywordPrefix?: string | null
    /** 表+别名后的下一子句关键字前缀（whe → WHERE） */
    clauseKeywordPrefix?: string | null
    /** JOIN 关键字已完整（LEFT JOIN 等），等待下一张表 */
    awaitingJoinTable?: boolean
    /** FROM 已完整，等待第一张表 */
    awaitingTableName?: boolean
    /** JOIN 表（+别名）已完整，等待 ON */
    awaitingOnClause?: boolean
}

/** 行尾是否为完整的 JOIN 关键字（其后应接表名） */
export function lineEndsWithCompleteJoin(lineBeforeCursor: string): boolean {
    return /\b(?:(?:INNER|LEFT|RIGHT|FULL|CROSS)\s+)?JOIN\s*$/i.test(lineBeforeCursor)
}

function emptyState(overrides: Partial<FromJoinTableState> = {}): FromJoinTableState {
    return {
        tablePrefix: '',
        resolvedTable: null,
        tableClauseComplete: false,
        aliasOnLineAfterCursor: null,
        joinKeywordPrefix: null,
        clauseKeywordPrefix: null,
        ...overrides,
    }
}

function analyzeTablePrefixSegment(
    tableRef: string,
    line: string,
    cursorColumn: number,
    knownTables: string[],
): FromJoinTableState {
    const tablePrefix = unquoteTableIdent(tableRef)
    const resolvedTable = findKnownTable(tablePrefix, knownTables)
    const aliasAhead = existingAliasAfterTableOnLine(line, cursorColumn)
    const tableClauseComplete =
        isCompleteKnownTableRef(tablePrefix, knownTables) &&
        (aliasAhead !== null || !hasLongerTablePrefix(tablePrefix, knownTables))

    return {
        tablePrefix,
        resolvedTable,
        tableClauseComplete,
        aliasOnLineAfterCursor: aliasAhead,
    }
}

function analyzeSegmentAfterOpener(
    segment: string,
    kind: ActiveClause['kind'],
    line: string,
    cursorColumn: number,
    knownTables: string[],
): FromJoinTableState | null {
    const isJoin = kind === 'join'
    const trimmed = segment.trimEnd()
    if (!trimmed) return null

    const prefixOnly = trimmed.match(TABLE_PREFIX_ONLY)
    if (prefixOnly) {
        const state = analyzeTablePrefixSegment(prefixOnly[1], line, cursorColumn, knownTables)
        if (isJoin && state.tableClauseComplete && !state.aliasOnLineAfterCursor) {
            return emptyState({
                resolvedTable: state.resolvedTable,
                awaitingOnClause: true,
            })
        }
        return state
    }

    const withTail = trimmed.match(TABLE_WITH_TAIL)
    if (!withTail) return null

    const tableRef = unquoteTableIdent(withTail[1])
    const tail = withTail[2] ?? ''

    // INSERT INTO orders ( … — 开括号进入列清单，不是别名
    if (tail.trimStart().startsWith('(')) {
        return analyzeTablePrefixSegment(tableRef, line, cursorColumn, knownTables)
    }

    const resolvedTable = findKnownTable(tableRef, knownTables)
    const parsed = parseTableClauseTail(tail)

    if (isJoin) {
        if (parsed.joinKeywordPrefix) return null
        if (parsed.alias && isCompleteKnownTableRef(tableRef, knownTables)) {
            return emptyState({resolvedTable, awaitingOnClause: true})
        }
        if (isCompleteKnownTableRef(tableRef, knownTables) && !parsed.alias && !parsed.joinKeywordPrefix) {
            return emptyState({resolvedTable, awaitingOnClause: true})
        }
        return analyzeTablePrefixSegment(tableRef, line, cursorColumn, knownTables)
    }

    if (parsed.joinKeywordPrefix && resolvedTable) {
        return emptyState({
            resolvedTable,
            tableClauseComplete: true,
            joinKeywordPrefix: parsed.joinKeywordPrefix,
        })
    }

    if (parsed.clauseKeywordPrefix && isCompleteKnownTableRef(tableRef, knownTables)) {
        return emptyState({
            resolvedTable,
            tableClauseComplete: true,
            clauseKeywordPrefix: parsed.clauseKeywordPrefix,
        })
    }

    if (parsed.alias && isCompleteKnownTableRef(tableRef, knownTables)) {
        return emptyState({
            resolvedTable,
            tableClauseComplete: true,
        })
    }

    return analyzeTablePrefixSegment(tableRef, line, cursorColumn, knownTables)
}

export function analyzeFromJoinTableState(
    slot: SqlCompletionSlot,
    line: string,
    lineBeforeCursor: string,
    cursorColumn: number,
    knownTables: string[],
): FromJoinTableState | null {
    if (
        slot !== 'from'
        && slot !== 'join'
        && slot !== 'insert_columns'
        && slot !== 'update_table'
    ) {
        return null
    }

    if (slot === 'insert_columns') {
        const intoMatch = /\bINTO\s+(.*)$/i.exec(lineBeforeCursor)
        if (intoMatch) {
            const segment = intoMatch[1] ?? ''
            if (!segment.trim()) return emptyState({awaitingTableName: true})
            const state = analyzeSegmentAfterOpener(segment, 'from', line, cursorColumn, knownTables)
            if (state) return state
        }
    }

    const active = findActiveClause(lineBeforeCursor)
    if (active) {
        const segment = lineBeforeCursor.slice(active.segmentStart)
        if (!segment.trim()) {
            if (active.kind === 'join') return emptyState({awaitingJoinTable: true})
            if (active.kind === 'update') return emptyState({awaitingTableName: true})
            return emptyState({awaitingTableName: true})
        }
        const state = analyzeSegmentAfterOpener(segment, active.kind, line, cursorColumn, knownTables)
        if (state) return state
    }

    return emptyState()
}
