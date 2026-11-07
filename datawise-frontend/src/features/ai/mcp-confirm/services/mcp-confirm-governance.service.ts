import type {TeamSummary} from '@/core/types'
import type {ProductionApprovalTeamOption} from '@/features/team/services/production-approval-policy.service'

/** True when MCP confirm must create a production approval ticket (not direct write). */
export function mcpConfirmRequiresProductionApproval(
    execution?: Record<string, unknown> | null,
    preview?: Record<string, unknown> | null,
): boolean {
    if (execution?.requiresApproval === true) return true
    const review = preview?.review
    if (review && typeof review === 'object' && !Array.isArray(review)) {
        return (review as {requiresApproval?: unknown}).requiresApproval === true
    }
    return false
}

/** Teams that share the connection — used after MCP confirm for prod write. */
export function resolveMcpProductionApprovalTeams(
    connectionId: string | undefined,
    teams: readonly TeamSummary[],
): ProductionApprovalTeamOption[] {
    const connId = connectionId?.trim()
    if (!connId) return []
    const matches: ProductionApprovalTeamOption[] = []
    for (const team of teams) {
        if (!(team.sharedConnectionIds ?? []).includes(connId)) continue
        matches.push({teamId: team.id, teamName: team.name})
    }
    return matches
}

export function readMcpExecutionString(
    execution: Record<string, unknown> | null | undefined,
    key: string,
): string | undefined {
    const value = execution?.[key]
    return typeof value === 'string' && value.trim() ? value : undefined
}
