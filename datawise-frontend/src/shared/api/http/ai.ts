import type {AiApi} from '@/shared/api/types'
import {getJson, postJson, putJson} from '@/shared/api/http/request'
import {API_PATHS} from '@/shared/api/http/paths'
import type {AiChatReplyPayload, AiKnowledgeEntry, AiTableTagCatalogItem} from '@/shared/api/ai.types'
import {
    getAiPreferencesSnapshot,
    resolveEmbeddingForApi,
    resolveWorkbenchAiLlmProfile,
    syncAiPreferences,
    toAiDatabaseTargetPayload,
    toAiEmbeddingProfilePayload,
    toAiLlmProfilePayload,
} from '@/shared/api/internal/ai'
import {logAiChatError, logAiChatRequest, logAiChatResponse} from '@/shared/api/internal/ai-request-log'

function mapChatReply(result: AiChatReplyPayload): AiChatReplyPayload {
    return {
        reply: result.reply,
        mode: result.mode ?? 'chat',
        sql: result.sql ?? undefined,
        columns: result.columns ?? undefined,
        rows: result.rows ?? undefined,
        chart: result.chart ?? undefined,
    }
}

/** Long-form chat (rewrite whole docs) can exceed the default 60s HTTP timeout. */
const AI_CHAT_TIMEOUT_MS = 5 * 60_000
const AI_TEST_TIMEOUT_MS = 90_000

/** AI 对话与 LLM 测试走后端 Spring AI */
export function createHttpAiApi(): AiApi {
    return {
        generateReply: async (prompt, context) => {
            const profile = resolveWorkbenchAiLlmProfile(context?.aiPreferences)
            const targets = context?.targets ?? []
            logAiChatRequest(prompt, targets.length)
            const started = performance.now()
            try {
                const result = await postJson<AiChatReplyPayload>(
                    API_PATHS.ai.chat,
                    {
                        prompt,
                        targets: targets.map(toAiDatabaseTargetPayload),
                        llm: toAiLlmProfilePayload(profile),
                        analysisContext: context?.analysisContext,
                    },
                    // silent: chat UI shows a clearer timeout / failure message in-thread
                    {timeoutMs: AI_CHAT_TIMEOUT_MS, silent: true},
                )
                const mapped = mapChatReply(result)
                logAiChatResponse(mapped, Math.round(performance.now() - started))
                if (!mapped.reply?.trim() && mapped.mode !== 'analysis') {
                    throw new Error('AI returned empty reply')
                }
                return mapped
            } catch (error) {
                logAiChatError(error, Math.round(performance.now() - started))
                throw error
            }
        },
        testConnection: (settings) =>
            postJson(
                API_PATHS.ai.testConnection,
                {llm: toAiLlmProfilePayload(settings)},
                {timeoutMs: AI_TEST_TIMEOUT_MS},
            ),
        testEmbedding: (settings) =>
            postJson(
                API_PATHS.ai.testEmbedding,
                {
                    embedding: toAiEmbeddingProfilePayload(settings, getAiPreferencesSnapshot()),
                },
                {timeoutMs: AI_TEST_TIMEOUT_MS},
            ),
        syncPreferences: (prefs) => {
            syncAiPreferences(prefs)
        },

        fetchKnowledgeEntries: () => getJson<AiKnowledgeEntry[]>(API_PATHS.ai.knowledge),

        saveKnowledgeEntries: (entries) => putJson<AiKnowledgeEntry[]>(API_PATHS.ai.knowledge, entries),

        fetchRagStatus: async (connectionId, database) => {
            const params = new URLSearchParams()
            if (connectionId?.trim()) params.set('connectionId', connectionId.trim())
            if (database?.trim()) params.set('database', database.trim())
            const query = params.toString()
            const path = query ? `${API_PATHS.aiRag.status}?${query}` : API_PATHS.aiRag.status
            return getJson(path)
        },

        rebuildRagIndex: async (connectionId, database) => {
            const body: Record<string, string> = {}
            if (connectionId?.trim()) body.connectionId = connectionId.trim()
            if (database?.trim()) body.database = database.trim()
            return postJson(API_PATHS.aiRag.rebuild, body)
        },

        fetchSchemaTables: async (connectionId, database, options) => {
            const params = new URLSearchParams({connectionId})
            if (database?.trim()) params.set('database', database.trim())
            return getJson<string[]>(`${API_PATHS.aiSchema.tables}?${params.toString()}`, undefined, options)
        },

        fetchAiTableTags: async (connectionId, database) => {
            const params = new URLSearchParams({connectionId})
            if (database?.trim()) params.set('database', database.trim())
            return getJson<string[]>(`${API_PATHS.aiTableTags.list}?${params.toString()}`)
        },

        fetchAiTableTagCatalog: () =>
            getJson<AiTableTagCatalogItem[]>(API_PATHS.aiTableTags.catalog),

        updateAiTableTags: (request) => putJson<string[]>(API_PATHS.aiTableTags.list, request),

        fetchPythonRuntime: () => getJson(API_PATHS.aiPython.runtime),
    }
}
