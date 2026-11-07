import {resolveCompletionPlan, resolveStageFromGrammar} from '../grammar'
import type {SqlCompletionContext} from '../context'
import type {GrammarResolution} from '../grammar/definitions'
import type {CompletionStage} from '../grammar/types'
import type {SqlCompletionPlan} from '../grammar/types'

/** snapshot 计划：grammar 定 stage；关键字由 keywords-config 提供（不经 dt-sql-parser） */
export function resolveSnapshotPlan(
    context: SqlCompletionContext,
    _sql: string,
    _offset: number,
    options?: { parserKeywords?: string[] },
): {
    plan: SqlCompletionPlan
    stage: CompletionStage
    grammar: GrammarResolution
} {
    const grammar = resolveStageFromGrammar(context)
    const plan = resolveCompletionPlan(context, {
        grammar,
        parserKeywords: options?.parserKeywords,
    })
    return {plan, stage: grammar.stage, grammar}
}
