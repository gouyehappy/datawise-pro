import type {SqlStatementKind} from '@sql-editor/types'
import type {StatementGrammar} from './types'
import {SELECT_STATEMENT_GRAMMAR} from './select'
import {
    DDL_STATEMENT_GRAMMAR,
    DELETE_STATEMENT_GRAMMAR,
    EMPTY_STATEMENT_GRAMMAR,
    INSERT_STATEMENT_GRAMMAR,
    UNKNOWN_STATEMENT_GRAMMAR,
    UPDATE_STATEMENT_GRAMMAR,
} from './dml'

const REGISTRY: Record<SqlStatementKind, StatementGrammar> = {
    select: SELECT_STATEMENT_GRAMMAR,
    insert: INSERT_STATEMENT_GRAMMAR,
    update: UPDATE_STATEMENT_GRAMMAR,
    delete: DELETE_STATEMENT_GRAMMAR,
    ddl: DDL_STATEMENT_GRAMMAR,
    empty: EMPTY_STATEMENT_GRAMMAR,
    unknown: UNKNOWN_STATEMENT_GRAMMAR,
}

export function getStatementGrammar(statement: SqlStatementKind): StatementGrammar {
    return REGISTRY[statement] ?? UNKNOWN_STATEMENT_GRAMMAR
}

export function listAllStatementGrammars(): StatementGrammar[] {
    return Object.values(REGISTRY)
}

export {SELECT_STATEMENT_GRAMMAR} from './select'
export * from './types'
export {evaluateTransition, PREDICATE_CHAIN_STATES} from './transitions'
