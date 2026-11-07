/** 补全模块公共 API */
export {
    analyzeCompletion,
    warmCompletionSnapshot,
    buildSnapshot,
    type CompletionSnapshot,
    type CursorInput,
} from './core/snapshot'
export {
    clearAnalysisCache,
    getCachedAnalysis,
    getCachedSnapshot,
    schemaFingerprint,
} from './analysis-cache'
export {MAX_TABLE_SUGGESTIONS, LARGE_SCHEMA_TABLE_THRESHOLD} from './limits'
export type {GrammarResolution} from './grammar/definitions'
export {
    resolveCompletionPlan,
    resolveCompletionStage,
    resolveStageFromGrammar,
    STAGE_PLAN_TEMPLATES,
    SELECT_STATEMENT_GRAMMAR,
    getStatementGrammar,
    type CompletionStage,
    type SqlCompletionPlan,
} from './grammar'
export {registerSqlCompletionProvider} from './monaco/provider'
export {registerSqlSignatureHelpProvider} from './monaco/signature-help'
export {
    getCompletionSnapshot,
    preloadCompletionWorker,
    scheduleSqlCompletionAnalysis,
    disposeCompletionWorker,
} from './completion-worker-client'
export {buildSuggestions, type SuggestBuildInput} from './builders/engine'
export type {SuggestItem, SuggestEditorSlice} from './suggest-types'
export {analyzeSqlCompletionContext, effectiveCompletionSlot, type SqlCompletionContext} from './context'
export type {CompletionCollector} from './completion-collectors'
export {
    shouldSuggestTables,
    shouldSuggestColumns,
    snippetsForContext,
} from './suggestion-policy'
export {resolveSqlDialectFile, SQL_DIALECT_ALIASES} from './dialect-aliases'
