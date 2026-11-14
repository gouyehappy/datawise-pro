import type {AiChatMessage} from '@/features/ai/types/messages'
import type {AiChatMode, AiChatSession, AiConversationBinding} from '@/features/ai/types/session'
import {UserResource} from '@/features/auth/types/user-resource.types'
import {
    canPersistLocalResource,
    canReadResource,
    resolveResourceStorageKey,
} from '@/features/auth/services/user-resource-policy'
import {t} from '@/i18n'

export const AI_CHAT_STORAGE_KEY = 'dw-cli-ai-chat'
/** Right-rail assistant — isolated from full-page Agent history. */
export const AI_ASSISTANT_CHAT_STORAGE_KEY = 'dw-cli-ai-assistant-chat'
export const AI_CHAT_STATE_VERSION = 1 as const
export const AI_CHAT_MAX_SESSIONS = 60
/** Defaults / bounds for right-rail assistant history (overridable via AiPreferences). */
export const ASSISTANT_HISTORY_LIMIT_DEFAULT = 10
export const ASSISTANT_HISTORY_LIMIT_MIN = 1
export const ASSISTANT_HISTORY_LIMIT_MAX = 50

export function clampAssistantHistoryLimit(value: unknown): number {
    const n = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : ASSISTANT_HISTORY_LIMIT_DEFAULT
    return Math.min(ASSISTANT_HISTORY_LIMIT_MAX, Math.max(ASSISTANT_HISTORY_LIMIT_MIN, n))
}

function fallbackSessionTitle(): string {
    return t('ai.history.fallbackTitle')
}

function createPersistedWelcomeFallback(): AiChatMessage[] {
    return [{id: 'welcome', role: 'assistant', content: '', time: '', kind: 'welcome'}]
}

export interface AiChatPersistenceState {
    version: typeof AI_CHAT_STATE_VERSION
    activeSessionId: string | null
    sessions: AiChatSession[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeMessage(raw: unknown): AiChatMessage | null {
    if (!isRecord(raw)) return null
    const role = raw.role
    if (role !== 'user' && role !== 'assistant') return null
    const content = typeof raw.content === 'string' ? raw.content : ''
    const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id : `m-${Date.now()}`
    const time = typeof raw.time === 'string' ? raw.time : ''
    const message: AiChatMessage = {id, role, content, time}
    if (raw.kind === 'welcome') message.kind = 'welcome'
    if (isRecord(raw.analysis) || raw.analysis) {
        message.analysis = raw.analysis as AiChatMessage['analysis']
    }
    if (Array.isArray(raw.analysisSteps)) {
        message.analysisSteps = raw.analysisSteps as AiChatMessage['analysisSteps']
    }
    if (Array.isArray(raw.databases)) {
        message.databases = raw.databases as AiChatMessage['databases']
    }
    if (typeof raw.thinking === 'string' && raw.thinking.trim()) {
        message.thinking = raw.thinking
    }
    if (raw.thinkingSource === 'model' || raw.thinkingSource === 'pipeline') {
        message.thinkingSource = raw.thinkingSource
    }
    if (Array.isArray(raw.references)) {
        message.references = raw.references
            .filter((item): item is Record<string, unknown> => isRecord(item))
            .map((item) => {
                const url = typeof item.url === 'string' ? item.url.trim() : ''
                if (!url) return null
                const title = typeof item.title === 'string' ? item.title.trim() : undefined
                return title ? {url, title} : {url}
            })
            .filter((item): item is NonNullable<typeof item> => item !== null)
        if (!message.references.length) delete message.references
    }
    // Never persist ephemeral stream flag.
    return message
}

function normalizeSession(raw: unknown): AiChatSession | null {
    if (!isRecord(raw)) return null
    const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id : null
    if (!id) return null
    const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title : fallbackSessionTitle()
    const createdAt = typeof raw.createdAt === 'number' ? raw.createdAt : Date.now()
    const updatedAt = typeof raw.updatedAt === 'number' ? raw.updatedAt : createdAt
    const messages = Array.isArray(raw.messages)
        ? raw.messages.map(normalizeMessage).filter((item): item is AiChatMessage => item !== null)
        : []
    const selectedTargetIds = Array.isArray(raw.selectedTargetIds)
        ? [...new Set(raw.selectedTargetIds.filter((item): item is string => typeof item === 'string'))]
        : []
    const mode: AiChatMode = raw.mode === 'ask' ? 'ask' : 'agent'
    let binding: AiConversationBinding | undefined
    if (isRecord(raw.binding) && typeof raw.binding.connectionId === 'string' && raw.binding.connectionId.trim()) {
        const source = raw.binding.source
        binding = {
            connectionId: raw.binding.connectionId.trim(),
            connectionName: typeof raw.binding.connectionName === 'string' ? raw.binding.connectionName : undefined,
            database: typeof raw.binding.database === 'string' ? raw.binding.database : undefined,
            schema: typeof raw.binding.schema === 'string' ? raw.binding.schema : undefined,
            dialect: typeof raw.binding.dialect === 'string' ? raw.binding.dialect : undefined,
            environment: typeof raw.binding.environment === 'string' ? raw.binding.environment : undefined,
            source:
                source === 'workbench_focus'
                || source === 'tagged_scope'
                || source === 'manual'
                || source === 'editor_send'
                    ? source
                    : 'manual',
        }
    }
    return {
        id,
        title,
        createdAt,
        updatedAt,
        messages: messages.length ? messages : createPersistedWelcomeFallback(),
        selectedTargetIds,
        mode,
        binding,
    }
}

export function normalizeAiChatState(raw: unknown): AiChatPersistenceState | null {
    if (!isRecord(raw)) return null
    const sessions = Array.isArray(raw.sessions)
        ? raw.sessions.map(normalizeSession).filter((item): item is AiChatSession => item !== null)
        : []
    if (!sessions.length) return null

    const trimmed = trimSessions(sessions)
    const activeSessionId =
        typeof raw.activeSessionId === 'string' && trimmed.some((item) => item.id === raw.activeSessionId)
            ? raw.activeSessionId
            : trimmed[0]?.id ?? null

    return {
        version: AI_CHAT_STATE_VERSION,
        activeSessionId,
        sessions: trimmed,
    }
}

export function trimSessions(
    sessions: AiChatSession[],
    maxSessions: number = AI_CHAT_MAX_SESSIONS,
): AiChatSession[] {
    const limit = Math.max(1, Math.trunc(maxSessions) || AI_CHAT_MAX_SESSIONS)
    const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)
    return sorted.slice(0, limit)
}

function stripEphemeralMessageFields(message: AiChatMessage): AiChatMessage {
    if (!message.streaming) return message
    const {streaming: _streaming, ...rest} = message
    return rest
}

export function buildAiChatPersistenceState(
    sessions: AiChatSession[],
    activeSessionId: string | null,
    maxSessions: number = AI_CHAT_MAX_SESSIONS,
): AiChatPersistenceState {
    const trimmed = trimSessions(sessions, maxSessions).map((session) => ({
        ...session,
        messages: session.messages.map(stripEphemeralMessageFields),
    }))
    const resolvedActive =
        activeSessionId && trimmed.some((item) => item.id === activeSessionId)
            ? activeSessionId
            : trimmed[0]?.id ?? null
    return {
        version: AI_CHAT_STATE_VERSION,
        activeSessionId: resolvedActive,
        sessions: trimmed,
    }
}

function resolveAiChatStorageKey(baseKey: string = AI_CHAT_STORAGE_KEY): string {
    return resolveResourceStorageKey(UserResource.AiChat, baseKey) ?? baseKey
}

export function readAiChatState(
    storage: Storage = localStorage,
    baseKey: string = AI_CHAT_STORAGE_KEY,
): AiChatPersistenceState | null {
    if (!canReadResource(UserResource.AiChat)) return null
    if (!canPersistLocalResource(UserResource.AiChat)) return null
    try {
        const raw = storage.getItem(resolveAiChatStorageKey(baseKey))
        if (!raw) return null
        return normalizeAiChatState(JSON.parse(raw))
    } catch {
        return null
    }
}

export function writeAiChatState(
    state: AiChatPersistenceState,
    storage: Storage = localStorage,
    baseKey: string = AI_CHAT_STORAGE_KEY,
): boolean {
    if (!canPersistLocalResource(UserResource.AiChat)) return true
    let payload = buildAiChatPersistenceState(state.sessions, state.activeSessionId)
    const storageKey = resolveAiChatStorageKey(baseKey)
    for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
            storage.setItem(storageKey, JSON.stringify(payload))
            return true
        } catch {
            if (payload.sessions.length <= 1) return false
            const nextSessions = payload.sessions.slice(0, Math.max(1, payload.sessions.length - 5))
            payload = {
                ...payload,
                sessions: nextSessions,
                activeSessionId:
                    payload.activeSessionId &&
                    nextSessions.some((item) => item.id === payload.activeSessionId)
                        ? payload.activeSessionId
                        : nextSessions[0]?.id ?? null,
            }
        }
    }
    return false
}
