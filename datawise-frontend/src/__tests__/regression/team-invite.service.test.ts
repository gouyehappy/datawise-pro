import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import type {TeamSummary} from '@/core/types'
import {
    formatInviteStatusKey,
    resolvePendingInviteCount,
    shouldAutoOpenInvitesTab,
    shouldShowInviteApprovalBadge,
} from '@/features/team/services/team-invite.service'

describe('team-invite.service', () => {
    const adminTeam: TeamSummary = {
        id: 't1',
        name: 'Demo',
        memberCount: 2,
        role: 'admin',
        pendingInviteCount: 2,
    }

    it('resolvePendingInviteCount clamps negative values', () => {
        assert.equal(resolvePendingInviteCount(adminTeam), 2)
        assert.equal(resolvePendingInviteCount({...adminTeam, pendingInviteCount: -1}), 0)
    })

    it('shouldShowInviteApprovalBadge is limited to admin roles with pending items', () => {
        assert.equal(shouldShowInviteApprovalBadge(adminTeam), true)
        assert.equal(shouldShowInviteApprovalBadge({...adminTeam, role: 'member'}), false)
        assert.equal(shouldShowInviteApprovalBadge({...adminTeam, pendingInviteCount: 0}), false)
    })

    it('shouldAutoOpenInvitesTab only when count rises from zero', () => {
        assert.equal(shouldAutoOpenInvitesTab(0, 1, true), true)
        assert.equal(shouldAutoOpenInvitesTab(1, 2, true), false)
        assert.equal(shouldAutoOpenInvitesTab(0, 1, false), false)
    })

    it('formatInviteStatusKey normalizes status text', () => {
        assert.equal(formatInviteStatusKey('Pending'), 'pending')
        assert.equal(formatInviteStatusKey('done'), 'unknown')
    })
})
