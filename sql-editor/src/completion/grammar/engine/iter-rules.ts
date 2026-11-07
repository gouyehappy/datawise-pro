import type {SqlStatementKind} from '@sql-editor/types'
import type {CompletionStage} from '../types'
import type {TransitionId} from '../definitions/types'
import {listAllStatementGrammars} from '../definitions'

export type GrammarRuleRef = {
    statement: SqlStatementKind
    clauseId: string | null
    stateId: string
    when: TransitionId
    stage: CompletionStage
    hint: string
}

export function grammarRuleKey(
    statement: SqlStatementKind,
    clauseId: string | null,
    stateId: string,
): string {
    return `${statement}:${clauseId ?? 'global'}:${stateId}`
}

/** 遍历所有语句语法图中的 globalRules + clause.states */
export function listAllGrammarStateRules(): GrammarRuleRef[] {
    const rules: GrammarRuleRef[] = []
    for (const grammar of listAllStatementGrammars()) {
        for (const rule of grammar.globalRules) {
            rules.push({
                statement: grammar.statement,
                clauseId: null,
                stateId: rule.id,
                when: rule.when,
                stage: rule.stage,
                hint: rule.hint,
            })
        }
        for (const clause of grammar.clauses) {
            for (const state of clause.states) {
                rules.push({
                    statement: grammar.statement,
                    clauseId: clause.id,
                    stateId: state.id,
                    when: state.when,
                    stage: state.stage,
                    hint: state.hint,
                })
            }
        }
    }
    return rules
}
