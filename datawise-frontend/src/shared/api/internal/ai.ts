import type {AiDatabaseTarget} from '@/shared/api/ai.types'
import {
    AI_DEFAULT_COMPLETIONS_PATH,
    AI_DEFAULT_EMBEDDINGS_PATH,
    DEFAULT_AI_EMBEDDING_PROFILE,
    DEFAULT_AI_LLM_PROFILE,
} from '@/shared/config/ai-presets'
import type {
    AiEmbeddingProfile,
    AiEmbeddingSettings,
    AiLlmProfile,
    AiLlmSettings,
    AiPreferences,
} from '@/shared/config/app-config.types'
import {DEFAULT_AI_PREFERENCES} from '@/shared/config/app-config.defaults'
import {readAppConfig} from '@/shared/config/app-config.service'
import {normalizeLlmBaseUrl} from '@/shared/api/internal/llm-base-url'

let runtimeAiPreferences: AiPreferences | undefined

/** 与 Pinia 同步，避免持久化延迟导致 API 读到旧配置。 */
export function syncAiPreferences(prefs: AiPreferences) {
    runtimeAiPreferences = prefs
}

export function getAiPreferencesSnapshot(): AiPreferences {
    return runtimeAiPreferences ?? readAppConfig().ai ?? DEFAULT_AI_PREFERENCES
}

export interface AiLlmProfilePayload {
    provider: string
    baseUrl: string
    apiKey: string
    model: string
    temperature: number
    maxTokens: number
    completionsPath?: string
}

export interface AiEmbeddingProfilePayload {
    provider: string
    baseUrl: string
    apiKey: string
    model: string
    dimensions?: number | null
    embeddingsPath?: string
    useChatConnection?: boolean
}

export interface AiDatabaseTargetPayload {
    connectionId: string
    connectionLabel: string
    database: string
    databaseLabel: string
    tableLabel?: string
    dbType: string
}

export function toAiLlmProfilePayload(settings: AiLlmSettings): AiLlmProfilePayload {
    return {
        provider: settings.provider,
        baseUrl: normalizeLlmBaseUrl(settings.baseUrl),
        apiKey: settings.apiKey,
        model: settings.model,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
        completionsPath: settings.completionsPath ?? AI_DEFAULT_COMPLETIONS_PATH,
    }
}

export function resolveDefaultEmbeddingProfile(prefs?: AiPreferences): AiEmbeddingProfile {
    const ai = prefs ?? getAiPreferencesSnapshot()
    if (!ai.embeddingProfiles?.length) return {...DEFAULT_AI_EMBEDDING_PROFILE}
    const activeId = ai.defaultEmbeddingId
    return ai.embeddingProfiles.find((profile) => profile.id === activeId) ?? ai.embeddingProfiles[0]
}

export function resolveEmbeddingForApi(prefs?: AiPreferences): AiEmbeddingSettings {
    const profile = resolveDefaultEmbeddingProfile(prefs)
    if (profile.useChatConnection !== true) {
        return profile
    }
    const chat = resolveConsoleAiLlmProfile(prefs)
    return {
        ...profile,
        baseUrl: chat.baseUrl,
        apiKey: chat.apiKey,
    }
}

export function toAiEmbeddingProfilePayload(
    settings: AiEmbeddingSettings | AiEmbeddingProfile,
    prefs?: AiPreferences,
): AiEmbeddingProfilePayload {
    const resolved = settings.useChatConnection === true
        ? resolveEmbeddingForApi(prefs)
        : settings
    return {
        provider: resolved.provider,
        baseUrl: normalizeLlmBaseUrl(resolved.baseUrl),
        apiKey: resolved.apiKey,
        model: resolved.model,
        dimensions: resolved.dimensions ?? null,
        embeddingsPath: resolved.embeddingsPath ?? AI_DEFAULT_EMBEDDINGS_PATH,
        useChatConnection: resolved.useChatConnection === true,
    }
}

export function resolveWorkbenchAiLlmProfile(prefs?: AiPreferences): AiLlmProfile {
    const ai = prefs ?? getAiPreferencesSnapshot()
    if (!ai.llmProfiles?.length) return {...DEFAULT_AI_LLM_PROFILE}
    const activeId = ai.workbenchLlmId || ai.defaultLlmId
    return ai.llmProfiles.find((profile) => profile.id === activeId) ?? ai.llmProfiles[0]
}

export function resolveConsoleAiLlmProfile(prefs?: AiPreferences): AiLlmProfile {
    const ai = prefs ?? getAiPreferencesSnapshot()
    if (!ai.llmProfiles?.length) return {...DEFAULT_AI_LLM_PROFILE}
    const activeId = ai.defaultLlmId
    return ai.llmProfiles.find((profile) => profile.id === activeId) ?? ai.llmProfiles[0]
}

export function toAiDatabaseTargetPayload(target: AiDatabaseTarget): AiDatabaseTargetPayload {
    const database =
        target.level === 'connection' || target.databaseId === '__conn__'
            ? ''
            : target.databaseLabel
    return {
        connectionId: target.connectionId,
        connectionLabel: target.connectionLabel,
        database,
        databaseLabel: target.databaseLabel,
        tableLabel: target.tableLabel,
        dbType: target.dbType,
    }
}
