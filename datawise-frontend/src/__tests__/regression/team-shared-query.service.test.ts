import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import type {TeamSharedQueryComment, TeamSharedQuerySummary} from '@/core/types'
import {
    canDeleteTeamSharedQueryComment,
    collectTeamSharedQueryTags,
    filterTeamSharedQueries,
    mergeSharedQuerySummary,
} from '@/features/team/services/team-shared-query.service'

const items: TeamSharedQuerySummary[] = [
    {
        id: 'tq-1',
        teamId: 'team-1',
        title: 'Daily orders',
        description: 'Count open orders',
        connectionId: 'conn-1',
        connectionName: 'Shop DB',
        database: 'shop',
        tags: ['daily', 'orders'],
        sharedByUserName: 'alice',
        sharedByUserId: 1,
        sharedAt: '2026-06-15 10:00:00',
        updatedAt: '2026-06-15 10:00:00',
        commentCount: 2,
        favoriteCount: 1,
        starredByCurrentUser: true,
    },
    {
        id: 'tq-2',
        teamId: 'team-1',
        title: 'User audit',
        description: '',
        connectionId: 'conn-2',
        connectionName: 'Audit DB',
        database: 'audit',
        tags: ['audit'],
        sharedByUserName: 'bob',
        sharedByUserId: 2,
        sharedAt: '2026-06-14 09:00:00',
        updatedAt: '2026-06-14 09:00:00',
        commentCount: 0,
        favoriteCount: 0,
        starredByCurrentUser: false,
    },
]

describe('team-shared-query.service', () => {
    it('filters by text and tag', () => {
        assert.equal(filterTeamSharedQueries(items, 'orders').length, 1)
        assert.equal(filterTeamSharedQueries(items, '', 'audit').length, 1)
        assert.equal(filterTeamSharedQueries(items, 'shop').length, 1)
    })

    it('filters starred queries only', () => {
        assert.equal(filterTeamSharedQueries(items, '', null, true).length, 1)
        assert.equal(filterTeamSharedQueries(items, '', null, true)[0]?.id, 'tq-1')
    })

    it('collects unique tags', () => {
        assert.deepEqual(collectTeamSharedQueryTags(items), ['audit', 'daily', 'orders'])
    })

    it('allows comment author, query owner, or manager to delete', () => {
        const comment: TeamSharedQueryComment = {
            id: 'c-1',
            userId: 3,
            userName: 'carol',
            content: 'Looks good',
            createdAt: '2026-06-15 11:00:00',
        }
        assert.equal(canDeleteTeamSharedQueryComment({
            comment,
            queryOwnerUserId: 1,
            currentUserId: 3,
        }), true)
        assert.equal(canDeleteTeamSharedQueryComment({
            comment,
            queryOwnerUserId: 1,
            currentUserId: 1,
        }), true)
        assert.equal(canDeleteTeamSharedQueryComment({
            comment,
            queryOwnerUserId: 1,
            currentUserId: 9,
            canManage: true,
        }), true)
        assert.equal(canDeleteTeamSharedQueryComment({
            comment,
            queryOwnerUserId: 1,
            currentUserId: 9,
        }), false)
    })

    it('merges summary patches', () => {
        const merged = mergeSharedQuerySummary(items[0], {commentCount: 3})
        assert.equal(merged.commentCount, 3)
        assert.equal(merged.title, items[0].title)
    })
})
