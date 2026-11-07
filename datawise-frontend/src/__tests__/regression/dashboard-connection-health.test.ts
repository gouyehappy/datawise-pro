import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {
    extractDashboardConnections,
    summarizeConnectionHealth,
} from '@/features/dashboard/services/dashboard-summary.service'
import type {TreeNode} from '@/core/types'

describe('dashboard-summary.service connection health', () => {
    it('summarizes ok/error/unknown connection rows', () => {
        const tree: TreeNode[] = [
            {
                id: 'g1',
                label: 'Group',
                type: 'group',
                children: [
                    {id: 'c1', label: 'MySQL', type: 'connection', dbType: 'mysql'},
                    {id: 'c2', label: 'PG', type: 'connection', dbType: 'postgresql'},
                    {id: 'c3', label: 'Redis', type: 'connection', dbType: 'redis'},
                ],
            },
        ]
        const rows = extractDashboardConnections(tree, {c1: 'ok', c2: 'error'})
        const summary = summarizeConnectionHealth(rows)

        assert.equal(summary.total, 3)
        assert.equal(summary.ok, 1)
        assert.equal(summary.error, 1)
        assert.equal(summary.unknown, 1)
    })
})
