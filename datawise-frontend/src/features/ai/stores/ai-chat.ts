import {defineStore} from 'pinia'
import {computed, ref, watch} from 'vue'
import {
    buildSessionTitle,
    createWelcomeMessages,
} from '@/features/ai/chat/services/ai-chat.service'
import {
    AI_ASSISTANT_CHAT_STORAGE_KEY,
    AI_CHAT_MAX_SESSIONS,
    AI_CHAT_STORAGE_KEY,
    buildAiChatPersistenceState,
    clampAssistantHistoryLimit,
    readAiChatState,
    writeAiChatState,
} from '@/features/ai/chat/services/ai-chat-persistence.service'
import type {AiChatMessage} from '@/features/ai/types'
import type {AiChatSession} from '@/features/ai/types/session'
import {createId} from '@/core/utils/id'
import {t} from '@/i18n'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'

export type {AiChatSession} from '@/features/ai/types/session'

const PERSIST_DEBOUNCE_MS = 320

type AiChatStoreOptions = {
    /** When false, never read/write localStorage. */
    persist?: boolean
    /** Cap retained sessions (Agent default 60; assistant uses preferences). */
    resolveMaxSessions?: () => number
}

function createAiChatStore(
    storeId: string,
    storageKey: string,
    options: AiChatStoreOptions = {},
) {
    const persist = options.persist !== false

    return defineStore(storeId, () => {
        const persisted = persist ? readAiChatState(localStorage, storageKey) : null
        const sessions = ref<AiChatSession[]>(persisted?.sessions ?? [])
        const activeSessionId = ref<string | null>(persisted?.activeSessionId ?? null)
        const sendingSessionIds = ref<string[]>([])
        /** Sessions with an active token stream — skip persist until quiet ends (PERF-02). */
        const streamPersistQuietIds = new Set<string>()
        let persistTimer: ReturnType<typeof setTimeout> | null = null

        const activeSession = computed(() =>
            sessions.value.find((session) => session.id === activeSessionId.value) ?? null,
        )

        const sortedSessions = computed(() =>
            [...sessions.value].sort((a, b) => b.updatedAt - a.updatedAt),
        )

        function resolveMaxSessions(): number {
            return Math.max(1, options.resolveMaxSessions?.() ?? AI_CHAT_MAX_SESSIONS)
        }

        /** Drop oldest chats beyond the configured cap (always keep the active one). */
        function enforceSessionCap() {
            const max = resolveMaxSessions()
            if (sessions.value.length <= max) return
            const ranked = [...sessions.value].sort((a, b) => b.updatedAt - a.updatedAt)
            const keepIds = new Set<string>()
            for (const session of ranked) {
                if (keepIds.size >= max) break
                keepIds.add(session.id)
            }
            if (activeSessionId.value && !keepIds.has(activeSessionId.value)) {
                const kept = [...keepIds]
                const drop = kept[kept.length - 1]
                if (drop) keepIds.delete(drop)
                keepIds.add(activeSessionId.value)
            }
            if (keepIds.size === sessions.value.length) return
            sessions.value = sessions.value.filter((session) => keepIds.has(session.id))
        }

        function schedulePersist() {
            if (!persist) return
            if (persistTimer) clearTimeout(persistTimer)
            persistTimer = setTimeout(() => {
                persistTimer = null
                enforceSessionCap()
                const state = buildAiChatPersistenceState(
                    sessions.value,
                    activeSessionId.value,
                    resolveMaxSessions(),
                )
                writeAiChatState(state, localStorage, storageKey)
            }, PERSIST_DEBOUNCE_MS)
        }

        /** PERF-20: explicit persist requests — no deep watch over the session graph. */
        function requestPersist() {
            if (!persist) return
            if (streamPersistQuietIds.size > 0) return
            schedulePersist()
        }

        if (persist) {
            watch(activeSessionId, () => requestPersist())
        }

        function touchSession(session: AiChatSession) {
            session.updatedAt = Date.now()
            requestPersist()
        }

        /** Pause localStorage writes for a live stream; call end when the turn settles. */
        function beginStreamPersistQuiet(sessionId: string) {
            if (!sessionId) return
            streamPersistQuietIds.add(sessionId)
        }

        function endStreamPersistQuiet(sessionId: string) {
            if (!sessionId || !streamPersistQuietIds.delete(sessionId)) return
            const session = sessions.value.find((item) => item.id === sessionId)
            if (session) touchSession(session)
            schedulePersist()
        }

        function createSession(selectedTargetIds: string[] = []): AiChatSession {
            const now = Date.now()
            const session: AiChatSession = {
                id: createId('chat'),
                title: t('ai.history.newChat'),
                createdAt: now,
                updatedAt: now,
                messages: createWelcomeMessages(t('ai.welcome')),
                selectedTargetIds: [...new Set(selectedTargetIds)],
                mode: 'agent',
            }
            sessions.value.unshift(session)
            activeSessionId.value = session.id
            enforceSessionCap()
            requestPersist()
            return session
        }

        function setSessionMode(sessionId: string, mode: AiChatSession['mode']) {
            const session = sessions.value.find((item) => item.id === sessionId)
            if (!session) return
            session.mode = mode
            touchSession(session)
            schedulePersist()
        }

        function setSessionBinding(sessionId: string, binding: AiChatSession['binding'] | undefined) {
            const session = sessions.value.find((item) => item.id === sessionId)
            if (!session) return
            // Binding is sticky: only set when empty, or when explicitly replaced by caller.
            session.binding = binding
            touchSession(session)
            schedulePersist()
        }

        /** Seed binding only if the session has none yet (focus must not rewrite). */
        function seedSessionBindingIfEmpty(sessionId: string, binding: NonNullable<AiChatSession['binding']>) {
            const session = sessions.value.find((item) => item.id === sessionId)
            if (!session || session.binding?.connectionId) return
            session.binding = binding
            touchSession(session)
            schedulePersist()
        }

        function ensureInitialized(selectedTargetIds: string[] = []) {
            if (sessions.value.length) {
                if (!activeSessionId.value || !sessions.value.some((item) => item.id === activeSessionId.value)) {
                    activeSessionId.value = sessions.value[0].id
                }
                return activeSession.value
            }
            return createSession(selectedTargetIds)
        }

        /** Clear in-memory chats without creating a replacement. */
        function clearEphemeralSessions() {
            if (persistTimer) {
                clearTimeout(persistTimer)
                persistTimer = null
            }
            streamPersistQuietIds.clear()
            sessions.value = []
            activeSessionId.value = null
            sendingSessionIds.value = []
        }

        /** Wipe chats and start one fresh session (rare; prefer createSession). */
        function beginEphemeralSession(selectedTargetIds: string[] = []): AiChatSession {
            clearEphemeralSessions()
            return createSession(selectedTargetIds)
        }

        function selectSession(id: string) {
            if (!sessions.value.some((session) => session.id === id)) return
            activeSessionId.value = id
        }

        function deleteSession(id: string) {
            const index = sessions.value.findIndex((session) => session.id === id)
            if (index < 0) return

            sessions.value.splice(index, 1)
            sendingSessionIds.value = sendingSessionIds.value.filter((sessionId) => sessionId !== id)
            streamPersistQuietIds.delete(id)

            if (!sessions.value.length) {
                createSession()
                return
            }

            if (activeSessionId.value === id) {
                activeSessionId.value = sessions.value[0].id
            }
            requestPersist()
        }

        function setSelectedTargetIds(ids: string[]) {
            const session = activeSession.value
            if (!session) return
            session.selectedTargetIds = [...new Set(ids)]
            touchSession(session)
        }

        function appendMessage(message: AiChatMessage, sessionId = activeSessionId.value) {
            const session = sessions.value.find((item) => item.id === sessionId)
            if (!session) return
            session.messages.push(message)

            if (message.role === 'user' && session.title === t('ai.history.newChat')) {
                session.title = buildSessionTitle(message.content, t('ai.history.newChat'))
            }

            touchSession(session)
        }

        function patchMessage(
            messageId: string,
            patch: Partial<AiChatMessage>,
            sessionId = activeSessionId.value,
            opts?: {touch?: boolean},
        ) {
            const session = sessions.value.find((item) => item.id === sessionId)
            if (!session) return
            const target = session.messages.find((item) => item.id === messageId)
            if (!target) return
            Object.assign(target, patch)
            const quiet = sessionId ? streamPersistQuietIds.has(sessionId) : false
            if (opts?.touch === false || quiet) return
            touchSession(session)
        }

        function isSending(sessionId = activeSessionId.value): boolean {
            return sessionId ? sendingSessionIds.value.includes(sessionId) : false
        }

        function setSending(sessionId: string, sending: boolean) {
            if (sending) {
                if (!sendingSessionIds.value.includes(sessionId)) {
                    sendingSessionIds.value = [...sendingSessionIds.value, sessionId]
                }
                return
            }
            sendingSessionIds.value = sendingSessionIds.value.filter((id) => id !== sessionId)
        }

        function reloadForCurrentScope() {
            if (persistTimer) {
                clearTimeout(persistTimer)
                persistTimer = null
            }
            if (!persist) {
                sessions.value = []
                activeSessionId.value = null
                sendingSessionIds.value = []
                ensureInitialized()
                return
            }
            const next = readAiChatState(localStorage, storageKey)
            streamPersistQuietIds.clear()
            sessions.value = next?.sessions ?? []
            activeSessionId.value = next?.activeSessionId ?? null
            sendingSessionIds.value = []
            enforceSessionCap()
            if (!sessions.value.length) {
                ensureInitialized()
            }
        }

        return {
            sessions,
            activeSessionId,
            activeSession,
            sortedSessions,
            ensureInitialized,
            clearEphemeralSessions,
            beginEphemeralSession,
            createSession,
            setSessionMode,
            setSessionBinding,
            seedSessionBindingIfEmpty,
            selectSession,
            deleteSession,
            setSelectedTargetIds,
            appendMessage,
            patchMessage,
            beginStreamPersistQuiet,
            endStreamPersistQuiet,
            isSending,
            setSending,
            reloadForCurrentScope,
        }
    })
}

/** Full-page AI Agent chat history (persisted). */
export const useAiChatStore = createAiChatStore('ai-chat', AI_CHAT_STORAGE_KEY)

/** Right-rail assistant — persisted, capped by `ai.assistantHistoryLimit`. */
export const useAiAssistantChatStore = createAiChatStore(
    'ai-assistant-chat',
    AI_ASSISTANT_CHAT_STORAGE_KEY,
    {
        persist: true,
        resolveMaxSessions: () => {
            try {
                return clampAssistantHistoryLimit(
                    useAppConfigStore().aiPreferences.assistantHistoryLimit,
                )
            } catch {
                return clampAssistantHistoryLimit(undefined)
            }
        },
    },
)

export type AiChatStore = ReturnType<typeof useAiChatStore>
