import {describe, expect, it, vi} from 'vitest'
import {encodeSseText} from '@/shared/utils/sse'

vi.mock('@/shared/api/http/request', () => ({
    ApiError: class ApiError extends Error {
        constructor(message: string) {
            super(message)
            this.name = 'ApiError'
        }
    },
    buildApiUrl: (path: string) => path,
    buildSessionHeaders: () => ({}),
}))

vi.mock('@/shared/api/http/paths', () => ({
    API_PATHS: {ai: {chatStream: '/api/ai/chat/stream'}},
}))

import {streamAiChat} from './ai-chat-stream'

describe('streamAiChat', () => {
    it('dispatches thinking, delta, and result events', async () => {
        const body = encodeSseText(
            [
                'event: thinking\ndata: reason\n\n',
                'event: delta\ndata: Hello\n\n',
                'event: result\ndata: {"reply":"Hello","mode":"chat"}\n\n',
            ].join(''),
        )
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => ({
                ok: true,
                body,
            })),
        )

        const onDelta = vi.fn()
        const onThinking = vi.fn()
        const onResult = vi.fn()
        await streamAiChat(
            {prompt: 'hi', targets: [], llm: {}},
            {onDelta, onThinking, onResult},
        )

        expect(onThinking).toHaveBeenCalledWith('reason')
        expect(onDelta).toHaveBeenCalledWith('Hello')
        expect(onResult).toHaveBeenCalledWith({reply: 'Hello', mode: 'chat'})
    })
})
