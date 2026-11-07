import type {SqlCompletionContext} from '../../context'
import type {CompletionStage} from '../types'
import type {GrammarClause, GrammarResolution, GrammarStateRule, StatementGrammar} from '../definitions/types'
import {evaluateTransition, getStatementGrammar} from '../definitions'
import {findActiveGrammarClause} from './clause-active'

function matchFirstState(
    rules: readonly GrammarStateRule[],
    ctx: SqlCompletionContext,
): GrammarStateRule | null {
    for (const rule of rules) {
        if (evaluateTransition(rule.when, ctx)) return rule
    }
    return null
}

function resolveClauseStage(
    clause: GrammarClause,
    ctx: SqlCompletionContext,
): GrammarResolution {
    const rule = matchFirstState(clause.states, ctx)
    if (rule) {
        return {
            stage: rule.stage,
            clauseId: clause.id,
            stateId: rule.id,
            hint: rule.hint,
        }
    }
    const last = clause.states[clause.states.length - 1]
    return {
        stage: last?.stage ?? 'clause.column_first',
        clauseId: clause.id,
        stateId: last?.id ?? null,
        hint: last?.hint ?? null,
    }
}

/**
 * 语法引擎：完整 SQL 语句定义 → 当前位置 → CompletionStage
 * v2「何位置提示何物」的唯一决策入口。
 */
export function resolveStageFromGrammar(
    ctx: SqlCompletionContext,
    grammar: StatementGrammar = getStatementGrammar(ctx.statement),
): GrammarResolution {
    for (const rule of grammar.globalRules) {
        if (evaluateTransition(rule.when, ctx)) {
            return {
                stage: rule.stage,
                clauseId: null,
                stateId: rule.id,
                hint: rule.hint,
            }
        }
    }

    const tableSlots = new Set(['from', 'join', 'insert_columns', 'update_table'])
    if (tableSlots.has(ctx.slot)) {
        const clause =
            findActiveGrammarClause(ctx.segment, ctx.statement, grammar) ??
            grammar.clauses.find((c) => c.slot === ctx.slot)
        if (clause) return resolveClauseStage(clause, ctx)
    }

    const predicateSlots = new Set(['on', 'where', 'having', 'set'])
    if (predicateSlots.has(ctx.slot) && ctx.slot !== 'column_ref') {
        const clause = grammar.clauses.find((c) => c.slot === ctx.slot)
        if (clause) return resolveClauseStage(clause, ctx)
    }

    if (ctx.statement === 'select') {
        const clause = findActiveGrammarClause(ctx.segment, ctx.statement, grammar)
        if (clause) return resolveClauseStage(clause, ctx)
    }

    if (ctx.statement === 'insert' || ctx.statement === 'update' || ctx.statement === 'delete') {
        const clause = findActiveGrammarClause(ctx.segment, ctx.statement, grammar)
        if (clause) return resolveClauseStage(clause, ctx)
    }

    if (ctx.statement === 'empty' || ctx.statement === 'unknown') {
        const clause = grammar.clauses[0]
        if (clause) return resolveClauseStage(clause, ctx)
    }

    if (ctx.statement === 'ddl') {
        const clause = findActiveGrammarClause(ctx.segment, ctx.statement, grammar)
        if (clause) return resolveClauseStage(clause, ctx)
        return {
            stage: 'ddl.keywords',
            clauseId: 'ddl_start',
            stateId: 'default',
            hint: 'DDL → 片段 / 关键字',
        }
    }

    return {
        stage: grammar.fallback,
        clauseId: null,
        stateId: 'fallback',
        hint: null,
    }
}

export function resolveCompletionStageFromGrammar(ctx: SqlCompletionContext): CompletionStage {
    return resolveStageFromGrammar(ctx).stage
}
