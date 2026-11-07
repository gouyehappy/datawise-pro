/** AI 功能模块公共导出（外部模块优先从此处引用） */
export {default as AiWorkbench} from './AiWorkbench.vue'

export {useAiAssistantChatStore, useAiChatStore} from './stores/ai-chat'
export type {AiChatSession, AiChatStore} from './stores/ai-chat'

export type {
    AiChatMessage,
    MessageBlock,
    AiSqlConfirmPending,
    AiAnalysisResult,
    AiChartSpec,
    AiChatReplyPayload,
    AiAnalysisStepEvent,
    AiAnalysisContextPayload,
    AiAnalysisInterruptPayload,
    AiAnalysisStepId,
} from './types'
export {AI_ANALYSIS_STEP_ORDER} from './types'

export {isAnalysisPrompt} from './analysis/utils/analysis-intent'
export {buildAnalysisContextFromMessages} from './analysis/utils/analysis-context'
export {buildAiChartOption} from './analysis/services/ai-chart.service'
export {buildAnalysisResult} from './analysis/services/analysis-result.service'
export {formatAiErrorMessage} from './shared/utils/ai-error'
export type {AiDatabaseTarget} from './shared/utils/database-targets'
export {
    resolveTargetIdFromNode,
    formatTargetLabel,
} from './shared/utils/database-targets'

export {
    buildAssistantRenderBlocks,
    extractDocumentFromContent,
    extractSqlFromContent,
    isAssistantDocumentCodeBlock,
    isAssistantSqlCodeBlock,
    parseMessageBlocks,
} from './chat/services/ai-chat.service'
export type {AssistantRenderBlock} from './chat/services/ai-chat.service'
