import type {SqlCompletionSlot, SqlStatementKind} from '@sql-editor/types'
import {maskNonCodeRegionsCached} from '../../incremental-scan'
import {lastKeywordEndInCode} from '../../sql-scan'
import type {GrammarClause, StatementGrammar} from '../definitions/types'
import {getStatementGrammar} from '../definitions'

function lastMarkerIndex(masked: string, keyword: string): number {
    return lastKeywordEndInCode(masked, keyword)
}

/** 根据语法定义定位光标所在子句 */
export function findActiveGrammarClause(
    segment: string,
    statement: SqlStatementKind,
    grammar: StatementGrammar = getStatementGrammar(statement),
): GrammarClause | null {
    if (!segment.trim()) {
        return grammar.clauses.find((c) => c.slot === 'statement_start') ?? null
    }

    if (/\b[\w$]+\.(?:\w*|\*)$/i.test(segment)) {
        return null
    }

    const masked = maskNonCodeRegionsCached(segment)

    let best: { clause: GrammarClause; index: number } | null = null

    for (const clause of grammar.clauses) {
        for (const marker of clause.markers) {
            const index = lastMarkerIndex(masked, marker)
            if (index < 0) continue
            if (!best || index > best.index) {
                best = {clause, index}
            }
        }
    }

    return best?.clause ?? null
}

/** 由语法图解析 slot */
export function resolveSlotFromGrammar(
    segment: string,
    statement: SqlStatementKind,
): SqlCompletionSlot {
    if (/\b[\w$]+\.(?:\w*|\*)$/i.test(segment.replace(/[\r\n]+$/, ''))) return 'column_ref'
    if (!segment.trim()) return 'statement_start'

    const grammar = getStatementGrammar(statement)
    const clause = findActiveGrammarClause(segment, statement, grammar)
    if (clause) return clause.slot
    if (statement === 'ddl') return 'statement_start'
    return statement === 'empty' || statement === 'unknown' ? 'statement_start' : 'select_list'
}
