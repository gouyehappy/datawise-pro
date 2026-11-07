import type {
    AiAnalysisContextPayload,
    AiAnalysisErrorPayload,
    AiAnalysisInterruptPayload,
    AiAnalysisResumeRequest,
    AiAnalysisStepEvent,
    AiChatReplyPayload,
} from '@/shared/api/ai.types'
import {resolveApiErrorMessage} from '@/shared/api/http/api-error-message'
import {ApiError, buildApiUrl, buildSessionHeaders} from '@/shared/api/http/request'
import {consumeAnalysisSseStream} from '@/shared/api/http/analysis-sse-consumer'

export interface AiAnalysisStreamRequest {
    prompt: string
    targets: unknown[]
    llm: unknown
    stepLlms?: Record<string, unknown>
    analysisContext?: AiAnalysisContextPayload
    skipSqlConfirmation?: boolean
    analysisMode?: 'quick' | 'smart' | 'custom'
    disabledAnalysisSteps?: string[]
}

export interface AiAnalysisStreamHandlers {
    onStep: (step: AiAnalysisStepEvent) => void
    onResult: (result: AiChatReplyPayload) => void
    onInterrupt?: (payload: AiAnalysisInterruptPayload) => void
    onError?: (payload: AiAnalysisErrorPayload) => void
}

export function isAbortError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false
    const name = (error as {name?: unknown}).name
    return name === 'AbortError'
}

async function postAnalysisSse(
    path: string,
    body: unknown,
    signal?: AbortSignal,
): Promise<Response> {
    let response: Response
    try {
        response = await fetch(buildApiUrl(path), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'text/event-stream',
                ...buildSessionHeaders(),
            },
            body: JSON.stringify(body),
            credentials: 'include',
            signal,
        })
    } catch (error) {
        if (isAbortError(error) || signal?.aborted) {
            throw error
        }
        throw new ApiError('HTTP API request failed. Ensure the backend is running.')
    }

    if (!response.ok || !response.body) {
        throw new ApiError(`HTTP ${response.status}`)
    }
    return response
}

/** POST SSE：数据分析流水线步骤 + 最终结果 / interrupt */
export async function streamAiAnalysis(
    path: string,
    body: AiAnalysisStreamRequest,
    handlers: AiAnalysisStreamHandlers,
    signal?: AbortSignal,
): Promise<void> {
    const response = await postAnalysisSse(path, body, signal)
    await consumeAnalysisSseStream(response.body!, handlers, signal)
}

/** POST SSE：确认/取消后恢复分析流水线 */
export async function resumeAiAnalysis(
    path: string,
    body: AiAnalysisResumeRequest,
    handlers: AiAnalysisStreamHandlers,
    signal?: AbortSignal,
): Promise<void> {
    const response = await postAnalysisSse(path, body, signal)
    await consumeAnalysisSseStream(response.body!, handlers, signal)
}

export function toAnalysisStreamError(error: unknown): string {
    if (error instanceof ApiError) return error.message
    return resolveApiErrorMessage(error)
}
