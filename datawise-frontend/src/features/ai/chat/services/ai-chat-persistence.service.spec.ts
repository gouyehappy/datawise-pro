import {describe, expect, it} from 'vitest'
import {
    ASSISTANT_HISTORY_LIMIT_DEFAULT,
    buildAiChatPersistenceState,
    clampAssistantHistoryLimit,
    trimSessions,
} from './ai-chat-persistence.service'
import type {AiChatSession} from '@/features/ai/types/session'

function session(id: string, updatedAt: number): AiChatSession {
    return {
        id,
        title: id,
        createdAt: updatedAt,
        updatedAt,
        messages: [{id: `m-${id}`, role: 'user', content: 'hi', time: ''}],
        selectedTargetIds: [],
    }
}

describe('clampAssistantHistoryLimit', () => {
    it('defaults and clamps', () => {
        expect(clampAssistantHistoryLimit(undefined)).toBe(ASSISTANT_HISTORY_LIMIT_DEFAULT)
        expect(clampAssistantHistoryLimit(0)).toBe(1)
        expect(clampAssistantHistoryLimit(99)).toBe(50)
        expect(clampAssistantHistoryLimit(12.7)).toBe(12)
    })
})

describe('trimSessions', () => {
    it('keeps newest within max', () => {
        const sessions = [
            session('a', 1),
            session('b', 3),
            session('c', 2),
        ]
        expect(trimSessions(sessions, 2).map((item) => item.id)).toEqual(['b', 'c'])
    })
})

describe('buildAiChatPersistenceState', () => {
    it('honors maxSessions and strips streaming', () => {
        const state = buildAiChatPersistenceState(
            [
                {
                    ...session('old', 1),
                    messages: [
                        {id: 'm1', role: 'assistant', content: 'x', time: '', streaming: true},
                    ],
                },
                session('new', 9),
            ],
            'old',
            1,
        )
        expect(state.sessions).toHaveLength(1)
        expect(state.sessions[0].id).toBe('new')
        expect(state.sessions[0].messages[0]).not.toHaveProperty('streaming')
        expect(state.activeSessionId).toBe('new')
    })
})
