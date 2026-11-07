import type {TeamSummary} from '@/core/types'

/** 与后端 {@code TeamRoleSupport} 对齐的团队角色。 */
export type TeamRole = TeamSummary['role']

export const TEAM_ROLE_OWNER = 'owner' as const
export const TEAM_ROLE_ADMIN = 'admin' as const
export const TEAM_ROLE_MEMBER = 'member' as const
export const TEAM_ROLE_VIEWER = 'viewer' as const

const MANAGE_ROLES = new Set<TeamRole>([TEAM_ROLE_OWNER, TEAM_ROLE_ADMIN])
const ASSIGNABLE_ROLES = new Set<TeamRole>([TEAM_ROLE_ADMIN, TEAM_ROLE_MEMBER, TEAM_ROLE_VIEWER])

/** 可分配给非 owner 成员的角色（不含 owner）。 */
export const ASSIGNABLE_TEAM_ROLES: readonly TeamRole[] = [
    TEAM_ROLE_ADMIN,
    TEAM_ROLE_MEMBER,
    TEAM_ROLE_VIEWER,
]

export function normalizeTeamRole(role: string | null | undefined): TeamRole {
    if (!role?.trim()) {
        return TEAM_ROLE_MEMBER
    }
    const normalized = role.trim().toLowerCase()
    switch (normalized) {
        case TEAM_ROLE_OWNER:
        case TEAM_ROLE_ADMIN:
        case TEAM_ROLE_MEMBER:
        case TEAM_ROLE_VIEWER:
            return normalized
        default:
            return TEAM_ROLE_MEMBER
    }
}

/** owner / admin 可管理团队设置、共享、审批等。 */
export function canManageTeam(role: string | null | undefined): boolean {
    return MANAGE_ROLES.has(normalizeTeamRole(role))
}

/** 仅 owner 可调整成员角色。 */
export function canAssignTeamRole(role: string | null | undefined): boolean {
    return normalizeTeamRole(role) === TEAM_ROLE_OWNER
}

export function isAssignableTeamRole(role: string | null | undefined): boolean {
    return ASSIGNABLE_ROLES.has(normalizeTeamRole(role))
}

export function isTeamViewer(role: string | null | undefined): boolean {
    return normalizeTeamRole(role) === TEAM_ROLE_VIEWER
}

export function isTeamOwner(role: string | null | undefined): boolean {
    return normalizeTeamRole(role) === TEAM_ROLE_OWNER
}
