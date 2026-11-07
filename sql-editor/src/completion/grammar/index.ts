import type {SqlCompletionContext} from '../context'
import {effectiveCompletionSlot} from '../context'
import {buildPlanFromStage} from './plans'
import type {GrammarResolution} from './definitions'
import {resolveStageFromGrammar} from './engine'
import type {SqlCompletionPlan} from './types'
import {getCompletionKeywords} from '../keyword-config'

/** 补全关键字：优先测试注入；运行时始终用 keywords-config 白名单 */
function resolveCompletionKeywordList(explicit?: string[] | null): string[] | undefined {
    if (explicit?.length) return explicit
    const configured = getCompletionKeywords()
    return configured.length ? configured : undefined
}

/** 语法状态机 → 补全计划（复用已有 grammar 解析，避免重复 resolveStageFromGrammar） */
export function resolvePlanFromGrammar(
    ctx: SqlCompletionContext,
    resolution: GrammarResolution,
): SqlCompletionPlan {
    const stage = resolution.stage
    const eff = effectiveCompletionSlot(ctx)
    const plan = buildPlanFromStage(stage, eff)
    return {...plan, stage}
}

/** 补全计划唯一入口：grammar 决定 stage/collectors；关键字来自 keywords-config。 */
export function resolveCompletionPlan(
    ctx: SqlCompletionContext,
    options?: { parserKeywords?: string[]; grammar?: GrammarResolution },
): SqlCompletionPlan {
    const grammar = options?.grammar ?? resolveStageFromGrammar(ctx)
    const keywords = resolveCompletionKeywordList(options?.parserKeywords)
    return {
        ...resolvePlanFromGrammar(ctx, grammar),
        parserKeywords: keywords,
    }
}

export {
    resolveCompletionStageFromGrammar as resolveCompletionStage,
    resolveStageFromGrammar,
} from './engine'

export {buildPlanFromStage, STAGE_PLAN_TEMPLATES} from './plans'
export type {CompletionStage, StagePlanTemplate, SqlCompletionPlan} from './types'
export type {GrammarResolution, StatementGrammar, GrammarStateRule} from './definitions'
export {
    SELECT_STATEMENT_GRAMMAR,
    getStatementGrammar,
    listAllStatementGrammars,
    evaluateTransition,
} from './definitions'
