import type {SystemJdbcPoolMetrics, SystemMetricsSnapshot} from '@/shared/api/types'
import type {DashboardConnectionRow} from '@/features/dashboard/services/dashboard-summary.service'

export interface DashboardConnectionPoolStats {
    active: number | null
    idle: number | null
    pending: number | null
    max: number | null
}

export interface DashboardConnectionHealthRow extends DashboardConnectionRow {
    pool?: DashboardConnectionPoolStats
    poolLabel?: string
}

export interface DashboardRuntimeOverview {
    jdbcPoolsActive: number
    schemaSessionsActive: number
    failedProbes: number
    metricsCollectedAt: string | null
    metricsError: string | null
}

export function formatConnectionPoolLabel(pool: SystemJdbcPoolMetrics): string | undefined {
    const active = pool.activeConnections
    const max = pool.maxConnections
    if (active == null && max == null) return undefined
    if (max != null && active != null) return `${active}/${max}`
    if (active != null) return String(active)
    if (max != null) return `0/${max}`
    return undefined
}

function toPoolStats(pool: SystemJdbcPoolMetrics): DashboardConnectionPoolStats {
    return {
        active: pool.activeConnections ?? null,
        idle: pool.idleConnections ?? null,
        pending: pool.pendingThreads ?? null,
        max: pool.maxConnections ?? null,
    }
}

const HEALTH_RANK: Record<DashboardConnectionRow['status'], number> = {
    error: 0,
    unknown: 1,
    ok: 2,
}

export function enrichDashboardConnections(
    rows: readonly DashboardConnectionRow[],
    metrics: SystemMetricsSnapshot | null,
): DashboardConnectionHealthRow[] {
    const poolByConnectionId = new Map(
        (metrics?.jdbcPools ?? []).map((pool) => [pool.connectionId, pool]),
    )

    return [...rows]
        .map((row) => {
            const pool = poolByConnectionId.get(row.id)
            if (!pool) return {...row}
            return {
                ...row,
                pool: toPoolStats(pool),
                poolLabel: formatConnectionPoolLabel(pool),
            }
        })
        .sort((left, right) => {
            const rankDiff = HEALTH_RANK[left.status] - HEALTH_RANK[right.status]
            if (rankDiff !== 0) return rankDiff
            return left.name.localeCompare(right.name)
        })
}

export function buildDashboardRuntimeOverview(
    rows: readonly DashboardConnectionRow[],
    metrics: SystemMetricsSnapshot | null,
    metricsError: string | null = null,
): DashboardRuntimeOverview {
    return {
        jdbcPoolsActive: metrics?.datawise.jdbcPoolsActive ?? 0,
        schemaSessionsActive: metrics?.datawise.explorerSchemaSessionsActive ?? 0,
        failedProbes: rows.filter((row) => row.status === 'error').length,
        metricsCollectedAt: metrics?.collectedAt ?? null,
        metricsError,
    }
}
