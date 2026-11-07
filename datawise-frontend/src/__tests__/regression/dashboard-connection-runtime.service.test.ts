import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {
    buildDashboardRuntimeOverview,
    enrichDashboardConnections,
    formatConnectionPoolLabel,
} from '@/features/dashboard/services/dashboard-connection-runtime.service'
import type {DashboardConnectionRow} from '@/features/dashboard/services/dashboard-summary.service'
import type {SystemMetricsSnapshot} from '@/shared/api/types'

const rows: DashboardConnectionRow[] = [
    {id: 'c1', name: 'MySQL', dbType: 'mysql', status: 'ok'},
    {id: 'c2', name: 'Postgres', dbType: 'postgresql', status: 'error'},
    {id: 'c3', name: 'Redis', dbType: 'redis', status: 'unknown'},
]

const metrics: SystemMetricsSnapshot = {
    collectedAt: '2026-06-26T12:00:00Z',
    healthStatus: 'UP',
    uptimeMs: 1000,
    jvm: {
        availableProcessors: 8,
        heapUsedBytes: 1,
        heapMaxBytes: 2,
        heapUsagePercent: 50,
    },
    datawise: {
        jdbcPoolsActive: 2,
        explorerSchemaSessionsActive: 1,
        explorerLoadChildrenNotModifiedShortCircuit: 0,
        explorerLoadChildrenNotModifiedAfterLoad: 0,
        explorerLoadChildrenModified: 0,
    },
    jdbcPools: [
        {
            poolName: 'dw-c1',
            connectionId: 'c1',
            activeConnections: 2,
            idleConnections: 1,
            pendingThreads: 0,
            maxConnections: 4,
            minConnections: 1,
        },
    ],
}

describe('dashboard-connection-runtime.service', () => {
    it('formats pool usage labels', () => {
        assert.equal(
            formatConnectionPoolLabel({
                poolName: 'dw-c1',
                connectionId: 'c1',
                activeConnections: 2,
                maxConnections: 4,
            }),
            '2/4',
        )
    })

    it('merges jdbc pool stats and sorts failed probes first', () => {
        const enriched = enrichDashboardConnections(rows, metrics)
        assert.equal(enriched[0]?.id, 'c2')
        assert.equal(enriched.find((row) => row.id === 'c1')?.poolLabel, '2/4')
        assert.equal(enriched.find((row) => row.id === 'c3')?.poolLabel, undefined)
    })

    it('builds runtime overview from metrics and probe results', () => {
        const overview = buildDashboardRuntimeOverview(rows, metrics)
        assert.equal(overview.jdbcPoolsActive, 2)
        assert.equal(overview.schemaSessionsActive, 1)
        assert.equal(overview.failedProbes, 1)
        assert.equal(overview.metricsCollectedAt, metrics.collectedAt)
    })
})
