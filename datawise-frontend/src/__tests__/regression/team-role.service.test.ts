import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    ASSIGNABLE_TEAM_ROLES,
    canAssignTeamRole,
    canManageTeam,
    isAssignableTeamRole,
    isTeamOwner,
    isTeamViewer,
    normalizeTeamRole,
    TEAM_ROLE_MEMBER,
    TEAM_ROLE_OWNER,
} from '@/features/team/services/team-role.service'

describe('team-role.service', () => {
    it('normalizeTeamRole defaults unknown to member', () => {
        assert.equal(normalizeTeamRole(null), TEAM_ROLE_MEMBER)
        assert.equal(normalizeTeamRole('unknown'), TEAM_ROLE_MEMBER)
        assert.equal(normalizeTeamRole(' Admin '), 'admin')
    })

    it('canManageTeam only for owner and admin', () => {
        assert.equal(canManageTeam('owner'), true)
        assert.equal(canManageTeam('admin'), true)
        assert.equal(canManageTeam('member'), false)
        assert.equal(canManageTeam('viewer'), false)
    })

    it('canAssignTeamRole only for owner', () => {
        assert.equal(canAssignTeamRole('owner'), true)
        assert.equal(canAssignTeamRole('admin'), false)
    })

    it('isAssignableTeamRole excludes owner', () => {
        assert.equal(isAssignableTeamRole('admin'), true)
        assert.equal(isAssignableTeamRole('owner'), false)
        assert.deepEqual(ASSIGNABLE_TEAM_ROLES, ['admin', 'member', 'viewer'])
    })

    it('isTeamViewer and isTeamOwner', () => {
        assert.equal(isTeamViewer('viewer'), true)
        assert.equal(isTeamOwner(TEAM_ROLE_OWNER), true)
    })
})
