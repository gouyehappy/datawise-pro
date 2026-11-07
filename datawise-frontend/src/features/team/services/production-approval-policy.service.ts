import type {TeamSummary} from '@/core/types'
import type {ConnectionEnvironment} from '@/features/connection/services/connection-environment.service'
import {requiresWriteAccess} from '@/features/team/services/connection-access.service'

export interface ProductionApprovalTeamOption {
    teamId: string
    teamName: string
}

export function resolveProductionApprovalTeams(options: {
    env: ConnectionEnvironment
    sql: string
    connectionId?: string
    teams: readonly TeamSummary[]
}): ProductionApprovalTeamOption[] {
    if (options.env !== 'prod') return []
    if (!requiresWriteAccess(options.sql)) return []

    const connId = options.connectionId?.trim()
    if (!connId) return []

    const matches: ProductionApprovalTeamOption[] = []
    for (const team of options.teams) {
        // Managers also go through approval (maker-checker); another manager must review.
        if (!(team.sharedConnectionIds ?? []).includes(connId)) continue
        matches.push({teamId: team.id, teamName: team.name})
    }
    return matches
}

export function requiresProductionApproval(options: {
    env: ConnectionEnvironment
    sql: string
    connectionId?: string
    teams: readonly TeamSummary[]
}): boolean {
    return resolveProductionApprovalTeams(options).length > 0
}

export function filterProductionApprovalsByStatus<T extends {status: string}>(
    items: readonly T[],
    status?: string | null,
): T[] {
    const normalized = status?.trim()
    if (!normalized) return [...items]
    return items.filter((item) => item.status === normalized)
}

export function productionApprovalStatusLabelKey(status: string): string {
    switch (status) {
        case 'pending':
            return 'team.productionApprovals.statusPending'
        case 'executed':
            return 'team.productionApprovals.statusExecuted'
        case 'failed':
            return 'team.productionApprovals.statusFailed'
        case 'rejected':
            return 'team.productionApprovals.statusRejected'
        default:
            return 'team.productionApprovals.statusPending'
    }
}
