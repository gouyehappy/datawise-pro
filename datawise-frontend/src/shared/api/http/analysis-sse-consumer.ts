import type {
    AiAnalysisErrorPayload,
    AiAnalysisInterruptPayload,
    AiAnalysisStepEvent,
    AiChatReplyPayload,
} from '@/shared/api/ai.types'
import {parseSseBlock} from '@/shared/utils/sse'

export interface AnalysisStreamHandlers {
    onStep: (step: AiAnalysisStepEvent) => void
    onResult: (result: AiChatReplyPayload) => void
    onInterrupt?: (payload: AiAnalysisInterruptPayload) => void
    onError?: (payload: AiAnalysisErrorPayload) => void
}

/** 消费 ReadableStream SSE 体（step / interrupt / result / error） */
export async function consumeAnalysisSseStream(
    body: ReadableStream<Uint8Array>,
    handlers: AnalysisStreamHandlers,
    signal?: AbortSignal,
): Promise<void> {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    const onAbort = () => {
        void reader.cancel().catch(() => undefined)
    }
    signal?.addEventListener('abort', onAbort, {once: true})
    if (signal?.aborted) {
        onAbort()
    }

    try {
        while (!signal?.aborted) {
            const {done, value} = await reader.read()
            if (done) break

            buffer += decoder.decode(value, {stream: true})
            const blocks = buffer.split('\n\n')
            buffer = blocks.pop() ?? ''

            for (const block of blocks) {
                dispatchSseBlock(block, handlers)
            }
        }

        if (!signal?.aborted && buffer.trim()) {
            dispatchSseBlock(buffer, handlers)
        }
    } finally {
        signal?.removeEventListener('abort', onAbort)
    }

    if (signal?.aborted) {
        const abortError = new DOMException('The operation was aborted.', 'AbortError')
        throw abortError
    }
}

function dispatchSseBlock(block: string, handlers: AnalysisStreamHandlers): void {
    const parsed = parseSseBlock(block.trim())
    if (!parsed) return

    let data: unknown
    try {
        data = JSON.parse(parsed.data)
    } catch {
        // Single bad event must not tear down the whole analysis stream.
        return
    }

    if (parsed.event === 'step') {
        handlers.onStep(data as AiAnalysisStepEvent)
        return
    }
    if (parsed.event === 'interrupt') {
        handlers.onInterrupt?.(data as AiAnalysisInterruptPayload)
        return
    }
    if (parsed.event === 'result') {
        handlers.onResult(data as AiChatReplyPayload)
        return
    }
    if (parsed.event === 'error') {
        handlers.onError?.(data as AiAnalysisErrorPayload)
    }
}

/** 测试用：将 SSE 文本编码为 ReadableStream */
export function encodeSseText(text: string): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder()
    return new ReadableStream({
        start(controller) {
            controller.enqueue(encoder.encode(text))
            controller.close()
        },
    })
}
