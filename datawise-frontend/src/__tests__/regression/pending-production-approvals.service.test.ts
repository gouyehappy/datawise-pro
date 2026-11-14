import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    countActionablePendingApprovals,
    isActionablePendingApproval,
} from '@/features/team/services/pending-production-approvals.service'

describe('pending-production-approvals.service', () => {
    it('counts only pending items the current manager can review (excludes self)', () => {
        const items = [
            {status: 'pending' as const, requestedByUserId: 2},
            {status: 'pending' as const, requestedByUserId: 1},
            {status: 'executed' as const, requestedByUserId: 2},
            {status: 'pending' as const, requestedByUserId: 3},
        ]
        assert.equal(
            countActionablePendingApprovals(items, {canManage: true, currentUserId: 1}),
            2,
        )
        assert.equal(
            countActionablePendingApprovals(items, {canManage: false, currentUserId: 1}),
            0,
        )
        assert.equal(
            isActionablePendingApproval(items[1]!, {currentUserId: 1}),
            false,
        )
        assert.equal(
            isActionablePendingApproval(items[0]!, {currentUserId: null}),
            false,
        )
    })
})
