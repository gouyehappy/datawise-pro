import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    buildAiChatPersistenceState,
    normalizeAiChatState,
    trimSessions,
} from '@/features/ai/chat/services/ai-chat-persistence.service'
import type {AiChatSession} from '@/features/ai/types/session'

describe('ai-chat-persistence.service', () => {
    const sampleSession: AiChatSession = {
        id: 'chat-1',
        title: '销售趋势',
        createdAt: 1000,
        updatedAt: 2000,
        selectedTargetIds: ['t-1'],
        messages: [
            {
                id: 'u-1',
                role: 'user',
                content: '分析销售趋势',
                time: '10:00:00',
            },
            {
                id: 'a-1',
                role: 'assistant',
                content: '已完成分析',
                time: '10:00:05',
                analysis: {
                    sql: 'SELECT 1',
                    columns: [{name: 'id', type: 'INT'}],
                    rows: [{id: 1}],
                },
            },
        ],
    }

    it('normalizeAiChatState restores sessions and active id', () => {
        const normalized = normalizeAiChatState({
            version: 1,
            activeSessionId: 'chat-1',
            sessions: [sampleSession],
        })
        assert.equal(normalized?.sessions.length, 1)
        assert.equal(normalized?.activeSessionId, 'chat-1')
        assert.equal(normalized?.sessions[0]?.messages.length, 2)
    })

    it('buildAiChatPersistenceState keeps active session when valid', () => {
        const state = buildAiChatPersistenceState([sampleSession], 'chat-1')
        assert.equal(state.activeSessionId, 'chat-1')
        assert.equal(state.sessions[0]?.title, '销售趋势')
    })

    it('trimSessions keeps newest sessions only', () => {
        const sessions = Array.from({length: 3}, (_, index) => ({
            ...sampleSession,
            id: `chat-${index}`,
            updatedAt: index,
        }))
        const trimmed = trimSessions(sessions)
        assert.equal(trimmed.length, 3)
        assert.equal(trimmed[0]?.id, 'chat-2')
    })
})
