import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {parseSseBlock} from '@/features/ai/analysis/services/analysis-stream-parser.service'
import {
    resolveActiveTeamId,
    resolveActiveTeamSharedConnectionIds,
    resolveSharedConnectionRefs,
} from '@/features/team/services/team-shared-explorer.service'
import type {TreeNode} from '@/core/types'

describe('analysis-stream-parser.service', () => {
    it('parses SSE event and data lines', () => {
        const parsed = parseSseBlock('event: step\ndata: {"step":"intent","status":"ok"}')
        assert.equal(parsed?.event, 'step')
        assert.equal(parsed?.data, '{"step":"intent","status":"ok"}')
    })

    it('joins multiline data fields', () => {
        const parsed = parseSseBlock('event: result\ndata: line1\ndata: line2')
        assert.equal(parsed?.data, 'line1\nline2')
    })

    it('returns null when data is missing', () => {
        assert.equal(parseSseBlock('event: ping'), null)
    })
})

describe('team-shared-explorer.service', () => {
    const teams = [
        {id: 'team-1', name: 'A', memberCount: 2, role: 'owner' as const, sharedConnectionIds: ['c1', 'c2']},
    ]

    it('resolves active team shared connection ids', () => {
        assert.deepEqual(resolveActiveTeamSharedConnectionIds(teams, 'team-1'), ['c1', 'c2'])
        assert.deepEqual(resolveActiveTeamSharedConnectionIds(teams, null), [])
    })

    it('drops stale active team id after account switch', () => {
        assert.equal(resolveActiveTeamId(teams, 'team-old'), 'team-1')
        assert.equal(resolveActiveTeamId([], 'team-old'), null)
        assert.equal(resolveActiveTeamId(teams, 'team-1'), 'team-1')
    })

    it('maps shared ids to tree connection labels', () => {
        const tree: TreeNode[] = [
            {
                id: 'g1',
                label: 'Group',
                type: 'group',
                children: [
                    {id: 'c1', label: 'MySQL Host', type: 'connection', dbType: 'mysql'},
                ],
            },
        ]
        const refs = resolveSharedConnectionRefs(tree, ['c1', 'missing'])
        assert.equal(refs[0]?.label, 'MySQL Host')
        assert.equal(refs[0]?.found, true)
        assert.equal(refs[1]?.found, false)
    })
})
