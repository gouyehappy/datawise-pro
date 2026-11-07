import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    consumeTeamSharedQuerySseStreamForTest,
    encodeTeamSharedQuerySseText,
} from '@/features/team/services/team-shared-query-stream'

describe('team-shared-query-stream', () => {
    it('dispatches connected and updated SSE events', async () => {
        const events: string[] = []
        const body = encodeTeamSharedQuerySseText(
            [
                'event: connected',
                'data: {"teamId":"team-1","queryId":"query-1","updatedAt":"2026-07-07T10:00:00Z"}',
                '',
                'event: updated',
                'data: {"teamId":"team-1","queryId":"query-1","updatedAt":"2026-07-07T10:05:00Z","updatedByUserId":2,"updatedByUserName":"alice"}',
                '',
            ].join('\n'),
        )

        await consumeTeamSharedQuerySseStreamForTest(body, {
            onConnected: (event) => events.push(`connected:${event.updatedAt}`),
            onUpdated: (event) => events.push(`updated:${event.updatedByUserName}`),
        })

        assert.deepEqual(events, ['connected:2026-07-07T10:00:00Z', 'updated:alice'])
    })

    it('dispatches presence SSE events', async () => {
        const viewers: string[] = []
        const body = encodeTeamSharedQuerySseText(
            [
                'event: presence',
                'data: {"teamId":"team-1","queryId":"query-1","viewers":[{"userId":1,"userName":"alice"},{"userId":2,"userName":"bob"}]}',
                '',
            ].join('\n'),
        )

        await consumeTeamSharedQuerySseStreamForTest(body, {
            onPresence: (event) => {
                viewers.push(event.viewers.map((viewer) => viewer.userName).join(','))
            },
        })

        assert.deepEqual(viewers, ['alice,bob'])
    })
})
