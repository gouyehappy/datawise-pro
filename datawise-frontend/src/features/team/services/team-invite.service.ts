import type {TeamSummary} from '@/core/types'
import {canManageTeam} from '@/features/team/services/team-role.service'

export function resolvePendingInviteCount(team: TeamSummary | null | undefined): number {
    return Math.max(0, team?.pendingInviteCount ?? 0)
}

export function shouldShowInviteApprovalBadge(team: TeamSummary | null | undefined): boolean {
    if (!team) return false
    if (!canManageTeam(team.role)) return false
    return resolvePendingInviteCount(team) > 0
}

export function formatInviteStatusKey(status: string): 'pending' | 'approved' | 'rejected' | 'unknown' {
    const normalized = status.trim().toLowerCase()
    if (normalized === 'pending') return 'pending'
    if (normalized === 'approved') return 'approved'
    if (normalized === 'rejected') return 'rejected'
    return 'unknown'
}

export function shouldAutoOpenInvitesTab(
    previousCount: number,
    nextCount: number,
    canManage: boolean,
): boolean {
    return canManage && previousCount === 0 && nextCount > 0
}
