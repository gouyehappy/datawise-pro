import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    mcpConfirmRequiresProductionApproval,
    resolveMcpProductionApprovalTeams,
} from '@/features/ai/mcp-confirm/services/mcp-confirm-governance.service'
import type {TeamSummary} from '@/core/types'

function team(partial: Partial<TeamSummary> & Pick<TeamSummary, 'id' | 'name'>): TeamSummary {
    return {
        inviteCode: '',
        role: 'member',
        memberCount: 1,
        sharedConnectionIds: [],
        sharedConsoleIds: [],
        sharedConnectionAccess: {},
        onCallConnectionIds: [],
        shareSqlHistory: false,
        requireInviteApproval: false,
        ...partial,
    }
}

describe('mcp-confirm-governance.service', () => {
    it('detects requiresApproval on execution or preview.review', () => {
        assert.equal(mcpConfirmRequiresProductionApproval({requiresApproval: true}), true)
        assert.equal(
            mcpConfirmRequiresProductionApproval(null, {
                review: {requiresApproval: true, code: 'PROD_APPROVAL'},
            }),
            true,
        )
        assert.equal(mcpConfirmRequiresProductionApproval({type: 'open_console'}), false)
    })

    it('resolves teams that share the connection', () => {
        const teams = [
            team({id: 't1', name: 'Ops', sharedConnectionIds: ['c-prod']}),
            team({id: 't2', name: 'Other', sharedConnectionIds: ['c-dev']}),
        ]
        const matches = resolveMcpProductionApprovalTeams('c-prod', teams)
        assert.equal(matches.length, 1)
        assert.equal(matches[0]?.teamId, 't1')
    })
})
