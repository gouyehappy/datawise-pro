import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    filterProductionApprovalsByStatus,
    productionApprovalStatusLabelKey,
    requiresProductionApproval,
    resolveProductionApprovalTeams,
} from '@/features/team/services/production-approval-policy.service'
import type {TeamSummary} from '@/core/types'

function team(partial: Partial<TeamSummary> & Pick<TeamSummary, 'id' | 'name' | 'role'>): TeamSummary {
    return {
        inviteCode: '',
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

describe('production-approval-policy.service', () => {
    it('requires approval for prod write SQL on shared connection as member', () => {
        const teams = [
            team({
                id: 't1',
                name: 'Ops',
                role: 'member',
                sharedConnectionIds: ['conn-prod'],
            }),
        ]
        assert.equal(
            requiresProductionApproval({
                env: 'prod',
                sql: 'UPDATE users SET active = 1',
                connectionId: 'conn-prod',
                teams,
            }),
            true,
        )
    })

    it('requires approval for INSERT / ALTER on shared prod (not only dangerous DML)', () => {
        const teams = [
            team({
                id: 't1',
                name: 'Ops',
                role: 'member',
                sharedConnectionIds: ['conn-prod'],
            }),
        ]
        assert.equal(
            requiresProductionApproval({
                env: 'prod',
                sql: "INSERT INTO users (id) VALUES (1)",
                connectionId: 'conn-prod',
                teams,
            }),
            true,
        )
        assert.equal(
            requiresProductionApproval({
                env: 'prod',
                sql: 'ALTER TABLE users ADD COLUMN note VARCHAR(64)',
                connectionId: 'conn-prod',
                teams,
            }),
            true,
        )
    })

    it('requires approval for team managers too (maker-checker)', () => {
        const teams = [
            team({
                id: 't1',
                name: 'Ops',
                role: 'admin',
                sharedConnectionIds: ['conn-prod'],
            }),
        ]
        assert.equal(
            resolveProductionApprovalTeams({
                env: 'prod',
                sql: 'DELETE FROM logs',
                connectionId: 'conn-prod',
                teams,
            }).length,
            1,
        )
    })

    it('skips approval outside production', () => {
        const teams = [
            team({
                id: 't1',
                name: 'Ops',
                role: 'member',
                sharedConnectionIds: ['conn-dev'],
            }),
        ]
        assert.equal(
            requiresProductionApproval({
                env: 'dev',
                sql: 'DELETE FROM logs',
                connectionId: 'conn-dev',
                teams,
            }),
            false,
        )
    })

    it('B2-4: solo prod (connection not team-shared) stays confirm-only — no approval', () => {
        const teams = [
            team({
                id: 't1',
                name: 'Ops',
                role: 'member',
                sharedConnectionIds: ['other-conn'],
            }),
        ]
        assert.equal(
            requiresProductionApproval({
                env: 'prod',
                sql: 'DELETE FROM logs',
                connectionId: 'conn-solo-prod',
                teams,
            }),
            false,
        )
        assert.equal(
            requiresProductionApproval({
                env: 'prod',
                sql: 'DELETE FROM logs',
                connectionId: 'conn-solo-prod',
                teams: [],
            }),
            false,
        )
    })

    it('filters approvals by status', () => {
        const filtered = filterProductionApprovalsByStatus(
            [{status: 'pending'}, {status: 'executed'}],
            'pending',
        )
        assert.equal(filtered.length, 1)
        assert.equal(filtered[0]?.status, 'pending')
    })

    it('maps status label keys', () => {
        assert.equal(productionApprovalStatusLabelKey('executed'), 'team.productionApprovals.statusExecuted')
    })
})
