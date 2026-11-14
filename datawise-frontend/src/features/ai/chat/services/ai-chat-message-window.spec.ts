import {describe, expect, it} from 'vitest'
import {
    AI_CHAT_MESSAGE_WINDOW_TAIL,
    AI_CHAT_MESSAGE_WINDOW_THRESHOLD,
    resolveAiChatMessageWindow,
} from '@/features/ai/chat/services/ai-chat-message-window'

describe('resolveAiChatMessageWindow (PERF-05)', () => {
    it('keeps short threads fully visible', () => {
        expect(resolveAiChatMessageWindow(10)).toEqual({start: 0, hiddenCount: 0})
        expect(resolveAiChatMessageWindow(AI_CHAT_MESSAGE_WINDOW_THRESHOLD)).toEqual({
            start: 0,
            hiddenCount: 0,
        })
    })

    it('windows long threads to the newest tail', () => {
        const total = AI_CHAT_MESSAGE_WINDOW_THRESHOLD + 20
        const win = resolveAiChatMessageWindow(total)
        expect(win.hiddenCount).toBe(total - AI_CHAT_MESSAGE_WINDOW_TAIL)
        expect(win.start).toBe(total - AI_CHAT_MESSAGE_WINDOW_TAIL)
    })

    it('expands the window when the user reveals older messages', () => {
        const total = 120
        const win = resolveAiChatMessageWindow(total, 40)
        expect(win.start).toBe(total - (AI_CHAT_MESSAGE_WINDOW_TAIL + 40))
        expect(win.hiddenCount).toBe(win.start)
    })

    it('reveals the entire thread when extraReveal is large enough', () => {
        const total = 100
        const win = resolveAiChatMessageWindow(total, 999)
        expect(win).toEqual({start: 0, hiddenCount: 0})
    })
})
