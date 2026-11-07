import type {TeamApi} from '@/shared/api/types'
import type {
    JoinTeamResult,
    TeamAuditLog,
    TeamInvite,
    TeamJoinRequest,
    TeamMember,
    TeamSharedAiSessionDetail,
    TeamSharedAiSessionSummary,
    TeamSharedQueryComment,
    TeamSharedQueryDetail,
    TeamSharedQuerySummary,
    TeamProductionApprovalDetail,
    TeamProductionApprovalSummary,
    SubmitTeamProductionApprovalPayload,
    TeamSummary,
} from '@/core/types'
import type {TeamSummaryDto} from '@/shared/api/generated'
import {deleteJson, downloadAttachment, getJson, postJson, putJson} from '@/shared/api/http/request'
import {API_PATHS} from '@/shared/api/http/paths'

type TeamWire = TeamSummaryDto & {
    visibleProjectIds?: string[]
}

const TEAM_ROLES = new Set(['owner', 'admin', 'member', 'viewer'])

function mapAccessLevel(
    value: string | undefined,
): 'readonly' | 'readwrite' | 'ddl' | 'read' | 'write' | undefined {
    if (value === 'readonly' || value === 'readwrite' || value === 'ddl' || value === 'read' || value === 'write') {
        return value
    }
    return undefined
}

function mapTeamSummary(wire: TeamWire): TeamSummary {
    const role = String(wire.role ?? 'member')
    const access = wire.sharedConnectionAccess ?? {}
    const sharedConnectionAccess: NonNullable<TeamSummary['sharedConnectionAccess']> = {}
    for (const [key, raw] of Object.entries(access)) {
        const mapped = mapAccessLevel(typeof raw === 'string' ? raw : undefined)
        if (mapped) sharedConnectionAccess[key] = mapped
    }
    return {
        id: String(wire.id ?? ''),
        name: String(wire.name ?? ''),
        memberCount: Number(wire.memberCount ?? 0),
        role: (TEAM_ROLES.has(role) ? role : 'member') as TeamSummary['role'],
        sharedConnectionIds: wire.sharedConnectionIds,
        sharedConnectionAccess: Object.keys(sharedConnectionAccess).length
            ? sharedConnectionAccess
            : undefined,
        onCallConnectionIds: wire.onCallConnectionIds,
        sharedConsoleIds: wire.sharedConsoleIds,
        shareSqlHistory: wire.shareSqlHistory,
        requireInviteApproval: wire.requireInviteApproval,
        inviteCode: wire.inviteCode ?? null,
        pendingInviteCount: wire.pendingInviteCount,
        visibleProjectIds: wire.visibleProjectIds,
    }
}

/**
 * Teams HTTP client — TeamSummary wire DTOs from OpenAPI;
 * maps to domain {@link TeamSummary} (incl. host-only visibleProjectIds).
 */
export function createHttpTeamApi(): TeamApi {
    return {
        fetchAll: async () => {
            const list = await getJson<TeamWire[]>(API_PATHS.teams.list)
            return (list ?? []).map(mapTeamSummary)
        },

        create: async (name) => mapTeamSummary(await postJson<TeamWire>(API_PATHS.teams.create, {name})),

        join: (code) => postJson<JoinTeamResult>(API_PATHS.teams.join, {code}),

        fetchJoinRequests: () => getJson<TeamJoinRequest[]>(API_PATHS.teams.joinRequests),

        fetchMembers: (teamId) => getJson<TeamMember[]>(API_PATHS.teams.members(teamId)),

        updateMemberRole: (teamId, userId, role) =>
            putJson<TeamMember>(API_PATHS.teams.memberRole(teamId, userId), {role}),

        fetchInvites: (teamId) => getJson<TeamInvite[]>(API_PATHS.teams.invites(teamId)),

        approveInvite: async (teamId, inviteId) =>
            mapTeamSummary(await postJson<TeamWire>(API_PATHS.teams.approveInvite(teamId, inviteId), {})),

        rejectInvite: async (teamId, inviteId) =>
            mapTeamSummary(await postJson<TeamWire>(API_PATHS.teams.rejectInvite(teamId, inviteId), {})),

        updateSettings: async (teamId, requireInviteApproval) =>
            mapTeamSummary(
                await putJson<TeamWire>(API_PATHS.teams.settings(teamId), {requireInviteApproval}),
            ),

        fetchAuditLogs: (teamId, query) => {
            const params: Record<string, string | undefined> = {
                limit: query?.limit != null ? String(query.limit) : undefined,
                actorUserId: query?.actorUserId != null ? String(query.actorUserId) : undefined,
                since: query?.since,
                until: query?.until,
            }
            return getJson<TeamAuditLog[]>(API_PATHS.teams.auditLogs(teamId), params)
        },

        exportAuditLogs: async (teamId, options) => {
            const {blob, fileName} = await downloadAttachment(API_PATHS.teams.auditLogsExport(teamId), {
                format: options.format,
                actorUserId: options.actorUserId != null ? String(options.actorUserId) : undefined,
                since: options.since,
                until: options.until,
                includeFullSql: options.includeFullSql ? 'true' : 'false',
            })
            const url = URL.createObjectURL(blob)
            const anchor = document.createElement('a')
            anchor.href = url
            anchor.download = options.fileName
                || fileName
                || `team-audit.${options.format}`
            anchor.click()
            URL.revokeObjectURL(url)
        },

        updateSharedConnections: async (teamId, connectionIds, connectionAccess) =>
            mapTeamSummary(
                await putJson<TeamWire>(API_PATHS.teams.sharedConnections(teamId), {
                    connectionIds,
                    connectionAccess,
                }),
            ),

        updateOnCallConnections: async (teamId, connectionIds) =>
            mapTeamSummary(
                await putJson<TeamWire>(API_PATHS.teams.onCallConnections(teamId), {connectionIds}),
            ),

        updateSharedConsoles: async (teamId, consoleIds) =>
            mapTeamSummary(
                await putJson<TeamWire>(API_PATHS.teams.sharedConsoles(teamId), {consoleIds}),
            ),

        updateVisibleProjects: async (teamId, projectIds) =>
            mapTeamSummary(
                await putJson<TeamWire>(API_PATHS.teams.visibleProjects(teamId), {projectIds}),
            ),

        updateShareSqlHistory: async (teamId, enabled) =>
            mapTeamSummary(
                await putJson<TeamWire>(API_PATHS.teams.shareSqlHistory(teamId), {enabled}),
            ),

        fetchSharedAiSessions: (teamId) =>
            getJson<TeamSharedAiSessionSummary[]>(API_PATHS.teams.aiSessions(teamId)),

        getSharedAiSession: (teamId, sessionId) =>
            getJson<TeamSharedAiSessionDetail>(API_PATHS.teams.aiSession(teamId, sessionId)),

        shareAiSession: (teamId, title, payloadJson) =>
            postJson<TeamSharedAiSessionSummary>(API_PATHS.teams.aiSessions(teamId), {title, payloadJson}),

        fetchSharedQueries: (teamId) =>
            getJson<TeamSharedQuerySummary[]>(API_PATHS.teams.sharedQueries(teamId)),

        getSharedQuery: (teamId, queryId) =>
            getJson<TeamSharedQueryDetail>(API_PATHS.teams.sharedQuery(teamId, queryId)),

        shareQuery: (teamId, payload) =>
            postJson<TeamSharedQuerySummary>(API_PATHS.teams.sharedQueries(teamId), payload),

        updateSharedQuery: (teamId, queryId, payload) =>
            putJson<TeamSharedQuerySummary>(API_PATHS.teams.sharedQuery(teamId, queryId), payload),

        deleteSharedQuery: (teamId, queryId) =>
            deleteJson<void>(API_PATHS.teams.sharedQuery(teamId, queryId)),

        addSharedQueryComment: (teamId, queryId, content) =>
            postJson<TeamSharedQueryComment>(
                API_PATHS.teams.sharedQueryComment(teamId, queryId),
                {content},
            ),

        deleteSharedQueryComment: (teamId, queryId, commentId) =>
            deleteJson<void>(API_PATHS.teams.sharedQueryCommentById(teamId, queryId, commentId)),

        toggleSharedQueryFavorite: (teamId, queryId) =>
            postJson<TeamSharedQuerySummary>(API_PATHS.teams.sharedQueryFavorite(teamId, queryId), {}),

        fetchProductionApprovals: (teamId, status) =>
            getJson<TeamProductionApprovalSummary[]>(API_PATHS.teams.productionApprovals(teamId), {
                status,
            }),

        getProductionApproval: (teamId, approvalId) =>
            getJson<TeamProductionApprovalDetail>(API_PATHS.teams.productionApproval(teamId, approvalId)),

        submitProductionApproval: (teamId, payload: SubmitTeamProductionApprovalPayload) =>
            postJson<TeamProductionApprovalSummary>(API_PATHS.teams.productionApprovals(teamId), payload),

        approveProductionApproval: (teamId, approvalId) =>
            postJson<TeamProductionApprovalDetail>(
                API_PATHS.teams.productionApprovalApprove(teamId, approvalId),
                {},
            ),

        rejectProductionApproval: (teamId, approvalId, comment) =>
            postJson<TeamProductionApprovalDetail>(
                API_PATHS.teams.productionApprovalReject(teamId, approvalId),
                {comment},
            ),
    }
}
