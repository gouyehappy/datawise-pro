export {
    createDefaultSqlEditorAiSettings,
    DEFAULT_SQL_EDITOR_AI_MODEL,
    isSqlEditorAiReady,
    isSqlEditorAiCompletionEnabled,
    normalizeSqlEditorAiLayer,
    resolveSqlEditorAiSettings,
} from './settings'
export {generateSqlWithAi, runSqlEditorAiAction} from './generate-sql'
export {resolveAiAssistScenarios, matchesAiAssistPrefix} from './completion-scenarios'
export {resolveAiQuickActionsForContext} from './hint-quick-actions'
export {
    SQL_EDITOR_AI_ACTIONS,
    aiActionAllowsEmptyPrompt,
    aiActionRequiresSelectionHint,
    resolveAiDefaultPrompt,
    type SqlEditorAiAction,
} from './actions'
export {buildSchemaSummary, buildSqlAiMessages, buildSqlGenerationMessages} from './build-sql-prompt'
export {resolveChatCompletionsUrl, stripPlainTextFence, stripSqlCodeFence} from './openai-compatible'
export {
    applyAiSqlInsertPlan,
    buildAiExplanationBlock,
    buildAiSqlBlock,
    formatAiPromptComment,
    planAiBlockInsert,
    planAiSqlInsert,
} from './format-ai-insert'
