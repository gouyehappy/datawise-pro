import type {TeamProductionApprovalSummary, TeamSummary} from '@/core/types'
import {teamsApi} from '@/api'
import {canManageTeam} from '@/features/team/services/team-role.service'

export interface ActionablePendingApprovalOptions {
    /** Current user; own submissions are excluded (maker-checker). */
    currentUserId?: number | null
}

/** True when the current user can act on this pending row (manager + not self). */
export function isActionablePendingApproval(
    item: Pick<TeamProductionApprovalSummary, 'status' | 'requestedByUserId'>,
    options: ActionablePendingApprovalOptions,
): boolean {
    if (item.status !== 'pending') return false
    const uid = options.currentUserId
    if (uid == null) return false
    return item.requestedByUserId !== uid
}

export function countActionablePendingApprovals(
    items: readonly Pick<TeamProductionApprovalSummary, 'status' | 'requestedByUserId'>[],
    options: ActionablePendingApprovalOptions & {canManage: boolean},
): number {
    if (!options.canManage) return 0
    return items.reduce((sum, item) => sum + (isActionablePendingApproval(item, options) ? 1 : 0), 0)
}

/**
 * Cross-team count of production writes **awaiting my review**
 * (team manager/owner, excluding my own submissions).
 */
export async function countPendingProductionApprovals(
    teams: readonly TeamSummary[],
    options: ActionablePendingApprovalOptions = {},
): Promise<number> {
    if (!teams.length) return 0
    if (options.currentUserId == null) return 0

    const manageable = teams.filter((team) => canManageTeam(team.role))
    if (!manageable.length) return 0

    const counts = await Promise.all(
        manageable.map(async (team) => {
            try {
                const items = await teamsApi.fetchProductionApprovals(team.id, 'pending')
                if (!Array.isArray(items)) return 0
                return countActionablePendingApprovals(items, {
                    canManage: true,
                    currentUserId: options.currentUserId,
                })
            } catch {
                return 0
            }
        }),
    )
    return counts.reduce((sum, n) => sum + n, 0)
}
