import {ref} from 'vue'
import {createAssistantMessage} from '@/features/ai/chat/services/ai-chat.service'
import {drainThinkTags} from '@/features/ai/chat/utils/assistant-thinking'
import {extractUrlReferences} from '@/features/ai/chat/utils/assistant-references'
import {buildAnalysisResult} from '@/features/ai/analysis/services/analysis-result.service'
import {
    reconcileTerminalAnalysisSteps,
    stripDisabledAnalysisArtifacts,
} from '@/features/ai/analysis/services/analysis-step.service'
import {useAiChatStore, type AiChatStore} from '@/features/ai/stores/ai-chat'
import type {AiSqlConfirmPending} from '@/features/ai/types/chat'
import type {
    AiAnalysisContextPayload,
    AiAnalysisInterruptPayload,
    AiAnalysisStepEvent,
    AiChatReplyPayload,
} from '@/features/ai/types/analysis'
import type {AiDatabaseTarget} from '@/features/ai/shared/utils/database-targets'
import {useAppConfigStore} from '@/features/layout/stores/app-config-store'
import {useAppToast} from '@/features/layout/composables/useAppToast'
import {formatAiAnalysisStreamError, formatAiErrorMessage} from '@/features/ai/shared/utils/ai-error'
import type {AiAnalysisErrorPayload} from '@/features/ai/shared/utils/ai-error'
import {t} from '@/i18n'
import {API_PATHS} from '@/api'
import {buildAnalysisStepLlms} from '@/features/ai/shared/services/ai-llm-routing.service'
import {
    logAiChatError,
    logAiChatRequest,
    logAiChatResponse,
    resolveWorkbenchAiLlmProfile,
    resumeAiAnalysis,
    streamAiAnalysis,
    toAiDatabaseTargetPayload,
    toAiLlmProfilePayload,
} from '@/api'
import {isAbortError} from '@/shared/api/http/ai-analysis-stream'

interface UseAnalysisStreamOptions {
    scrollToBottom: (opts?: {force?: boolean}) => Promise<void>
    /** Defaults to Agent chat store; pass assistant store for the right-rail drawer. */
    chatStore?: AiChatStore
}

export function useAnalysisStream(options: UseAnalysisStreamOptions) {
    const toast = useAppToast()
    const aiChat = options.chatStore ?? useAiChatStore()
    const appConfig = useAppConfigStore()

    const analysisSteps = ref<AiAnalysisStepEvent[]>([])
    const analysisStreaming = ref(false)
    const sqlConfirmPending = ref<AiSqlConfirmPending | null>(null)
    const resumingSql = ref(false)
    /** Same assistant turn for live steps → final report (avoids ephemeral thinking flicker). */
    let streamingMessageId: string | null = null
    let streamAbort: AbortController | null = null

    function resetPipeline() {
        analysisSteps.value = []
        sqlConfirmPending.value = null
        streamingMessageId = null
    }

    function abortActiveStream() {
        streamAbort?.abort()
        streamAbort = null
    }

    function beginStreamSignal(): AbortSignal {
        abortActiveStream()
        const controller = new AbortController()
        streamAbort = controller
        return controller.signal
    }

    function clearStreamAbort(signal: AbortSignal) {
        if (streamAbort?.signal === signal) {
            streamAbort = null
        }
    }

    function messageExists(messageId: string, sessionId: string): boolean {
        const session = aiChat.sessions.find((item) => item.id === sessionId)
        return !!session?.messages.some((item) => item.id === messageId)
    }

    function ensureStreamingMessage(sessionId: string): string {
        if (streamingMessageId && messageExists(streamingMessageId, sessionId)) {
            return streamingMessageId
        }
        // Mark as analysis turn from the first frame so UI stays on the report shell.
        const placeholder = createAssistantMessage('', {
            streaming: true,
            thinkingSource: 'pipeline',
        })
        aiChat.appendMessage(placeholder, sessionId)
        streamingMessageId = placeholder.id
        return placeholder.id
    }

    /** Patch the same assistant turn with live pipeline steps (no fake model-thinking text). */
    function syncLiveProgress(sessionId: string) {
        const messageId = ensureStreamingMessage(sessionId)
        aiChat.patchMessage(
            messageId,
            {
                thinking: undefined,
                thinkingSource: 'pipeline',
                analysisSteps: [...analysisSteps.value],
                streaming: true,
            },
            sessionId,
        )
    }

    function finalizeMessage(
        sessionId: string,
        patch: Parameters<typeof aiChat.patchMessage>[1],
    ) {
        const messageId = ensureStreamingMessage(sessionId)
        aiChat.patchMessage(
            messageId,
            {
                ...patch,
                streaming: false,
            },
            sessionId,
        )
        streamingMessageId = null
    }

    function upsertAnalysisStep(step: AiAnalysisStepEvent) {
        const index = analysisSteps.value.findIndex((item) => item.step === step.step)
        if (index >= 0) {
            analysisSteps.value[index] = step
            analysisSteps.value = [...analysisSteps.value]
            return
        }
        analysisSteps.value = [...analysisSteps.value, step]
    }

    function appendAnalysisReply(
        result: AiChatReplyPayload,
        sessionId: string,
        started: number,
    ) {
        const steps = analysisSteps.value
        const sanitizedResult = stripDisabledAnalysisArtifacts(result, steps)
        const analysis = buildAnalysisResult(sanitizedResult)
        const rawReply = sanitizedResult.reply?.trim() || (analysis ? t('ai.analysis.done') : '')
        const split = drainThinkTags(rawReply)
        const replyText = split.content || rawReply
        const references = extractUrlReferences(replyText)
        logAiChatResponse(
            {
                reply: replyText,
                mode: 'analysis',
                sql: sanitizedResult.sql,
                columns: sanitizedResult.columns,
                rows: sanitizedResult.rows,
                chart: sanitizedResult.chart,
            },
            Math.round(performance.now() - started),
        )
        finalizeMessage(sessionId, {
            content: replyText,
            analysis: analysis ?? undefined,
            analysisSteps: steps.length ? [...steps] : undefined,
            // Only keep real model reasoning here; pipeline steps render via AiAnalysisProgress.
            thinking: split.thinking || undefined,
            thinkingSource: split.thinking ? 'model' : 'pipeline',
            references: references.length ? references : undefined,
        })
    }

    function appendFailureReply(text: string, sessionId: string) {
        const steps = analysisSteps.value
        const replyText = text.trim() || t('ai.generateFailedGeneric')
        finalizeMessage(sessionId, {
            content: replyText,
            analysisSteps: steps.length ? [...steps] : undefined,
            thinking: undefined,
            thinkingSource: 'pipeline',
            analysis: undefined,
            references: undefined,
        })
    }

    function buildStreamHandlers(sessionId: string, started: number) {
        return {
            onStep: (step: AiAnalysisStepEvent) => {
                upsertAnalysisStep(step)
                if (step.step === 'sql_execute' && step.status === 'failed') {
                    sqlConfirmPending.value = null
                }
                syncLiveProgress(sessionId)
                void options.scrollToBottom()
            },
            onInterrupt: (payload: AiAnalysisInterruptPayload) => {
                sqlConfirmPending.value = {
                    sessionId,
                    threadId: payload.threadId,
                    checkpointId: payload.checkpointId,
                    sql: payload.sql,
                }
                // Keep the same analysis turn visible while waiting for SQL confirm.
                const messageId = ensureStreamingMessage(sessionId)
                aiChat.patchMessage(
                    messageId,
                    {
                        thinking: undefined,
                        thinkingSource: 'pipeline',
                        analysisSteps: [...analysisSteps.value],
                        streaming: false,
                    },
                    sessionId,
                )
            },
            onResult: (result: AiChatReplyPayload) => {
                analysisSteps.value = reconcileTerminalAnalysisSteps(analysisSteps.value, result)
                if (result.mode === 'chat' && (
                    result.reply?.includes('数据分析失败')
                    || result.reply?.includes('Data analysis failed')
                )) {
                    appendFailureReply(result.reply, sessionId)
                    return
                }
                appendAnalysisReply(result, sessionId, started)
            },
            onError: (payload: AiAnalysisErrorPayload) => {
                appendFailureReply(formatAiAnalysisStreamError(payload), sessionId)
            },
        }
    }

    async function streamAnalysis(
        text: string,
        targets: AiDatabaseTarget[],
        sessionId: string,
        analysisContext?: AiAnalysisContextPayload,
    ) {
        const profile = resolveWorkbenchAiLlmProfile(appConfig.aiPreferences)
        logAiChatRequest(text, targets.length)
        const started = performance.now()
        const signal = beginStreamSignal()
        ensureStreamingMessage(sessionId)

        try {
            await streamAiAnalysis(
                API_PATHS.ai.analyzeStream,
                {
                    prompt: text,
                    targets: targets.map(toAiDatabaseTargetPayload),
                    llm: toAiLlmProfilePayload(profile),
                    stepLlms: buildAnalysisStepLlms(appConfig.aiPreferences),
                    analysisContext,
                    skipSqlConfirmation: appConfig.aiPreferences.skipSqlConfirmation === true,
                    analysisMode: appConfig.aiPreferences.analysisMode ?? 'smart',
                    disabledAnalysisSteps:
                        (appConfig.aiPreferences.analysisMode ?? 'smart') === 'custom'
                            ? (appConfig.aiPreferences.disabledAnalysisSteps ?? [])
                            : [],
                },
                buildStreamHandlers(sessionId, started),
                signal,
            )
        } catch (error) {
            if (isAbortError(error)) {
                appendFailureReply(t('ai.analysis.cancelled'), sessionId)
            }
            throw error
        } finally {
            clearStreamAbort(signal)
        }
    }

    async function resumeSqlConfirmation(approved: boolean) {
        const pending = sqlConfirmPending.value
        if (!pending || resumingSql.value) return

        const sessionId = pending.sessionId
        resumingSql.value = true
        analysisStreaming.value = true
        aiChat.setSending(sessionId, true)
        const started = performance.now()
        const signal = beginStreamSignal()
        ensureStreamingMessage(sessionId)
        syncLiveProgress(sessionId)

        try {
            await resumeAiAnalysis(
                API_PATHS.ai.analyzeResume,
                {
                    threadId: pending.threadId,
                    checkpointId: pending.checkpointId,
                    approved,
                },
                buildStreamHandlers(sessionId, started),
                signal,
            )
        } catch (error) {
            if (isAbortError(error)) {
                appendFailureReply(t('ai.analysis.cancelled'), sessionId)
            } else {
                logAiChatError(error, 0)
                appendFailureReply(formatAiErrorMessage(error), sessionId)
                toast.error(formatAiErrorMessage(error))
            }
        } finally {
            clearStreamAbort(signal)
            sqlConfirmPending.value = null
            analysisSteps.value = []
            analysisStreaming.value = false
            resumingSql.value = false
            aiChat.setSending(sessionId, false)
            if (aiChat.activeSessionId === sessionId) await options.scrollToBottom()
        }
    }

    function finishStreaming(sessionId: string) {
        if (!sqlConfirmPending.value) {
            analysisSteps.value = []
            analysisStreaming.value = false
            aiChat.setSending(sessionId, false)
            if (streamingMessageId && messageExists(streamingMessageId, sessionId)) {
                aiChat.patchMessage(streamingMessageId, {streaming: false}, sessionId)
            }
        } else {
            analysisStreaming.value = false
            aiChat.setSending(sessionId, false)
        }
    }

    function stopAnalysis() {
        abortActiveStream()
    }

    return {
        analysisSteps,
        analysisStreaming,
        sqlConfirmPending,
        resumingSql,
        resetPipeline,
        streamAnalysis,
        finishStreaming,
        stopAnalysis,
        confirmSqlExecution: () => resumeSqlConfirmation(true),
        cancelSqlExecution: () => resumeSqlConfirmation(false),
    }
}
