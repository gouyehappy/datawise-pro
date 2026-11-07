import {api} from '@/shared/api'
import type {HttpRequestOptions} from '@/shared/api/http/request'
import type {AiReplyContext} from '@/shared/api/types'
import type {AiKnowledgeEntry} from '@/features/ai/knowledge/types/ai-knowledge.types'
import type {AiEmbeddingProfile, AiLlmSettings, AiPreferences} from '@/shared/config/app-config.types'

export {
    syncAiPreferences,
    resolveWorkbenchAiLlmProfile,
    toAiDatabaseTargetPayload,
    toAiLlmProfilePayload,
} from '@/shared/api/internal/ai'
export type {AiLlmProfilePayload, AiDatabaseTargetPayload} from '@/shared/api/internal/ai'

export {streamAiAnalysis, resumeAiAnalysis} from '@/shared/api/http/ai-analysis-stream'
export type {AiAnalysisStreamRequest, AiAnalysisStreamHandlers} from '@/shared/api/http/ai-analysis-stream'

export {logAiChatError, logAiChatRequest, logAiChatResponse} from '@/shared/api/internal/ai-request-log'

export const aiApi = {
    generateReply: (prompt: string, context?: AiReplyContext) =>
        api.ai.generateReply(prompt, context),
    testConnection: (settings: AiLlmSettings) => api.ai.testConnection(settings),
    testEmbedding: (profile: AiEmbeddingProfile) => api.ai.testEmbedding(profile),
    syncPreferences: (prefs: AiPreferences) => api.ai.syncPreferences(prefs),
    fetchKnowledgeEntries: () => api.ai.fetchKnowledgeEntries(),
    saveKnowledgeEntries: (entries: AiKnowledgeEntry[]) => api.ai.saveKnowledgeEntries(entries),
    fetchRagStatus: (connectionId?: string, database?: string) =>
        api.ai.fetchRagStatus(connectionId, database),
    rebuildRagIndex: (connectionId?: string, database?: string) =>
        api.ai.rebuildRagIndex(connectionId, database),
    fetchSchemaTables: (connectionId: string, database?: string, options?: HttpRequestOptions) =>
        api.ai.fetchSchemaTables(connectionId, database, options),
    fetchAiTableTags: (connectionId: string, database?: string) =>
        api.ai.fetchAiTableTags(connectionId, database),
    fetchAiTableTagCatalog: () => api.ai.fetchAiTableTagCatalog(),
    updateAiTableTags: (request: {
        connectionId: string
        database: string
        tableNames: string[]
        tagged: boolean
    }) => api.ai.updateAiTableTags(request),
    fetchPythonRuntime: () => api.ai.fetchPythonRuntime(),
}
