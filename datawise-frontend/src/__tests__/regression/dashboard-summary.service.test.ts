import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import type {TreeNode} from '@/core/types'
import {
    buildDashboardQuickActions,
    buildDashboardStats,
    extractDashboardConnections,
    pickEnabledPlugins,
    pickRecentSqlLogs,
} from '@/features/dashboard/services/dashboard-summary.service'

describe('dashboard-summary.service', () => {
    it('buildDashboardStats maps counts and nav targets', () => {
        const stats = buildDashboardStats({
            connectionCount: 2,
            sqlLogCount: 10,
            savedConsoleCount: 3,
            enabledPluginCount: 1,
        })
        assert.equal(stats.length, 4)
        assert.equal(stats[0]?.key, 'connections')
        assert.equal(stats[0]?.navTarget, 'database')
        assert.equal(stats[3]?.key, 'plugins')
        assert.equal(stats[3]?.navTarget, 'plugin')
    })

    it('extractDashboardConnections walks tree and resolves health', () => {
        const tree: TreeNode[] = [
            {
                id: 'g1',
                label: 'Default',
                type: 'group',
                children: [
                    {id: 'c1', label: 'Local MySQL', type: 'connection', dbType: 'mysql'},
                    {id: 'c2', label: 'Redis', type: 'connection', dbType: 'redis'},
                ],
            },
        ]
        const rows = extractDashboardConnections(tree, {c1: 'ok', c2: 'error'})
        assert.equal(rows.length, 2)
        assert.equal(rows[0]?.status, 'ok')
        assert.equal(rows[1]?.status, 'error')
    })

    it('pickRecentSqlLogs respects limit', () => {
        const logs = pickRecentSqlLogs(
            [
                {id: '1', sql: 'a', time: 't', duration: '1ms', status: 'success'},
                {id: '2', sql: 'b', time: 't', duration: '1ms', status: 'success'},
            ],
            1,
        )
        assert.equal(logs.length, 1)
        assert.equal(logs[0]?.id, '1')
    })

    it('buildDashboardQuickActions hides continueWork without tabs', () => {
        const hidden = buildDashboardQuickActions(false).find((a) => a.id === 'continueWork')
        assert.equal(hidden?.hidden, true)
        const visible = buildDashboardQuickActions(true).find((a) => a.id === 'continueWork')
        assert.equal(visible?.hidden, false)
    })

    it('pickEnabledPlugins filters enabled items', () => {
        const items = [
            {id: 'a', enabled: true},
            {id: 'b', enabled: false},
            {id: 'c', enabled: true},
        ]
        const picked = pickEnabledPlugins(items, 1)
        assert.equal(picked.length, 1)
        assert.equal(picked[0]?.id, 'a')
    })
})
