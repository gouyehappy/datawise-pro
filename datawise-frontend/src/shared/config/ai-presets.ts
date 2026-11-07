import type {
    AiEmbeddingProviderId,
    AiEmbeddingProfile,
    AiEmbeddingSettings,
    AiLlmSettings,
    AiLlmProfile,
    AiProviderId,
} from '@/shared/config/app-config.types'
import {createId} from '@/core/utils/id'

export const AI_PROVIDER_OPTIONS: AiProviderId[] = ['mock', 'openai']

export const AI_DEFAULT_LLM_ID = 'llm-default'

export const AI_DEFAULT_BASE_URLS: Record<AiProviderId, string> = {
    mock: '',
    openai: 'https://api.openai.com',
}

export const AI_DEFAULT_COMPLETIONS_PATH = '/v1/chat/completions'
export const AI_DEFAULT_EMBEDDINGS_PATH = '/v1/embeddings'

export const AI_DEFAULT_EMBEDDING_ID = 'emb-default'

export const AI_EMBEDDING_MODEL_SUGGESTIONS = [
    'text-embedding-3-small',
    'text-embedding-3-large',
    'text-embedding-ada-002',
    'tao-8k',
]

export const AI_MODEL_SUGGESTIONS = [
    'gpt-4o-mini',
    'gpt-4o',
    'gpt-4.1-mini',
    'deepseek-chat',
    'qwen-plus',
    'qwen3-14b',
]

export const AI_EMBEDDING_PROVIDER_OPTIONS: AiEmbeddingProviderId[] = ['hash', 'openai']

export const AI_EMBEDDING_DIMENSIONS_MIN = 128
export const AI_EMBEDDING_DIMENSIONS_MAX = 4096

export const DEFAULT_AI_EMBEDDING_SETTINGS: AiEmbeddingSettings = {
    provider: 'hash',
    baseUrl: AI_DEFAULT_BASE_URLS.openai,
    apiKey: '',
    model: 'text-embedding-3-small',
    dimensions: null,
    embeddingsPath: AI_DEFAULT_EMBEDDINGS_PATH,
    useChatConnection: false,
}

export const DEFAULT_AI_EMBEDDING_PROFILE: AiEmbeddingProfile = {
    id: AI_DEFAULT_EMBEDDING_ID,
    name: 'Default',
    ...DEFAULT_AI_EMBEDDING_SETTINGS,
}

export const AI_TEMPERATURE_MIN = 0
export const AI_TEMPERATURE_MAX = 2
export const AI_MAX_TOKENS_MIN = 256
export const AI_MAX_TOKENS_MAX = 8192

export const DEFAULT_AI_LLM_SETTINGS: AiLlmSettings = {
    provider: 'mock',
    baseUrl: AI_DEFAULT_BASE_URLS.openai,
    apiKey: '',
    model: 'gpt-4o-mini',
    temperature: 0.7,
    maxTokens: 4096,
    completionsPath: AI_DEFAULT_COMPLETIONS_PATH,
}

export const DEFAULT_AI_LLM_PROFILE: AiLlmProfile = {
    id: AI_DEFAULT_LLM_ID,
    name: 'Default',
    ...DEFAULT_AI_LLM_SETTINGS,
}

export function isAiProviderId(value: unknown): value is AiProviderId {
    return value === 'mock' || value === 'openai'
}

export function isAiEmbeddingProviderId(value: unknown): value is AiEmbeddingProviderId {
    return value === 'hash' || value === 'openai'
}

export function createAiEmbeddingProfile(name: string, patch?: Partial<AiEmbeddingSettings>): AiEmbeddingProfile {
    return {
        id: createId('emb'),
        name,
        ...DEFAULT_AI_EMBEDDING_SETTINGS,
        ...patch,
    }
}

export function createAiLlmProfile(name: string, patch?: Partial<AiLlmSettings>): AiLlmProfile {
    return {
        id: createId('llm'),
        name,
        ...DEFAULT_AI_LLM_SETTINGS,
        ...patch,
    }
}
