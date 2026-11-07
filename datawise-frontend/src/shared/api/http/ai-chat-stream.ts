import type {AiAnalysisContextPayload, AiChatReplyPayload} from '@/shared/api/ai.types'
import {ApiError, buildApiUrl, buildSessionHeaders} from '@/shared/api/http/request'
import {API_PATHS} from '@/shared/api/http/paths'
import {consumeSseBlocks, parseSseBlock} from '@/shared/utils/sse'
import {isAbortError} from '@/shared/api/http/ai-analysis-stream'

export interface AiChatStreamRequest {
    prompt: string
    targets: unknown[]
    llm: unknown
    analysisContext?: AiAnalysisContextPayload
}

export interface AiChatStreamHandlers {
    onDelta?: (chunk: string) => void
    onThinking?: (chunk: string) => void
    onResult?: (result: AiChatReplyPayload) => void
    onError?: (message: string) => void
}

/** POST SSE: general chat token stream (`thinking` / `delta` / `result` / `error`). */
export async function streamAiChat(
    body: AiChatStreamRequest,
    handlers: AiChatStreamHandlers,
    signal?: AbortSignal,
): Promise<void> {
    let response: Response
    try {
        response = await fetch(buildApiUrl(API_PATHS.ai.chatStream), {
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

    let streamError: string | null = null
    let sawResult = false

    await consumeSseBlocks(
        response.body,
        (block) => {
            const parsed = parseSseBlock(block.trim())
            if (!parsed) return
            if (parsed.event === 'delta') {
                handlers.onDelta?.(parsed.data)
                return
            }
            if (parsed.event === 'thinking') {
                handlers.onThinking?.(parsed.data)
                return
            }
            if (parsed.event === 'result') {
                try {
                    const data = JSON.parse(parsed.data) as AiChatReplyPayload
                    sawResult = true
                    handlers.onResult?.(data)
                } catch {
                    streamError = 'AI chat stream returned invalid result'
                    handlers.onError?.(streamError)
                }
                return
            }
            if (parsed.event === 'error') {
                let message = parsed.data
                try {
                    const parsedJson = JSON.parse(parsed.data) as unknown
                    if (typeof parsedJson === 'string') message = parsedJson
                    else if (
                        parsedJson
                        && typeof parsedJson === 'object'
                        && 'message' in parsedJson
                        && typeof (parsedJson as {message: unknown}).message === 'string'
                    ) {
                        message = (parsedJson as {message: string}).message
                    }
                } catch {
                    // plain text error payload
                }
                streamError = message || 'AI chat stream failed'
                handlers.onError?.(streamError)
            }
        },
        signal,
    )

    if (signal?.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError')
    }
    if (streamError) {
        throw new ApiError(streamError)
    }
    if (!sawResult) {
        throw new ApiError('AI chat stream ended without result')
    }
}
