import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import type {TeamSummary, TreeNode} from '@/core/types'
import {
    pruneOnCallConnectionIds,
    resolveActiveTeamOnCallConnectionIds,
    resolveOnCallConnectionRefs,
    toggleOnCallConnectionId,
} from '@/features/team/services/team-on-call-pack.service'

const teams: TeamSummary[] = [
    {
        id: 'team-1',
        name: 'Ops',
        memberCount: 3,
        role: 'admin',
        sharedConnectionIds: ['conn-a', 'conn-b'],
        onCallConnectionIds: ['conn-a'],
    },
]

const tree: TreeNode[] = [
    {
        id: 'conn-a',
        label: 'Shop Prod',
        type: 'connection',
        dbType: 'mysql',
        env: 'prod',
    },
    {
        id: 'conn-b',
        label: 'Audit',
        type: 'connection',
        dbType: 'postgresql',
        env: 'staging',
    },
]

describe('team-on-call-pack.service', () => {
    it('resolves active team on-call ids', () => {
        assert.deepEqual(resolveActiveTeamOnCallConnectionIds(teams, 'team-1'), ['conn-a'])
        assert.deepEqual(resolveActiveTeamOnCallConnectionIds(teams, null), [])
    })

    it('prunes on-call ids to shared subset', () => {
        assert.deepEqual(
            pruneOnCallConnectionIds(['conn-a', 'conn-x'], ['conn-a', 'conn-b']),
            ['conn-a'],
        )
    })

    it('toggles on-call membership', () => {
        assert.deepEqual(toggleOnCallConnectionId(['conn-a'], 'conn-b'), ['conn-a', 'conn-b'])
        assert.deepEqual(toggleOnCallConnectionId(['conn-a', 'conn-b'], 'conn-a'), ['conn-b'])
    })

    it('resolves connection refs with environment', () => {
        const refs = resolveOnCallConnectionRefs(tree, ['conn-a', 'missing'])
        assert.equal(refs.length, 2)
        assert.equal(refs[0]?.label, 'Shop Prod')
        assert.equal(refs[0]?.env, 'prod')
        assert.equal(refs[1]?.found, false)
    })
})
