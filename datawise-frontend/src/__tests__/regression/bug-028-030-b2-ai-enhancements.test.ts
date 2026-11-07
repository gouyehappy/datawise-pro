import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    FEDERATED_SOURCE_COLUMN,
    isFederatedSourceColumn,
    shouldShowFederatedHint,
} from '@/features/ai/analysis/services/analysis-federated.service'
import {
    buildTeamAiSessionSharePayload,
    parseTeamAiSessionSharePayload,
    serializeTeamAiSessionSharePayload,
} from '@/features/ai/chat/services/ai-session-share.service'

describe('analysis federated helpers', () => {
    it('detects federated source column', () => {
        assert.equal(isFederatedSourceColumn(FEDERATED_SOURCE_COLUMN), true)
        assert.equal(isFederatedSourceColumn('id'), false)
    })

    it('shows hint for multi-target or source column', () => {
        assert.equal(shouldShowFederatedHint(2, []), true)
        assert.equal(
            shouldShowFederatedHint(1, [{name: FEDERATED_SOURCE_COLUMN, key: FEDERATED_SOURCE_COLUMN}]),
            true,
        )
        assert.equal(shouldShowFederatedHint(1, [{name: 'id', key: 'id'}]), false)
    })
})

describe('team ai session share payload', () => {
    it('round-trips share payload json', () => {
        const payload = buildTeamAiSessionSharePayload({
            id: 's-1',
            title: 'Sales review',
            createdAt: 1,
            updatedAt: 2,
            selectedTargetIds: ['t-1'],
            messages: [
                {id: 'm-1', role: 'user', content: 'Analyze sales', time: '10:00'},
                {id: 'm-2', role: 'assistant', content: 'Done', time: '10:01'},
            ],
        })
        const json = serializeTeamAiSessionSharePayload(payload)
        const parsed = parseTeamAiSessionSharePayload(json)
        assert.ok(parsed)
        assert.equal(parsed?.title, 'Sales review')
        assert.equal(parsed?.messages.length, 2)
    })
})
