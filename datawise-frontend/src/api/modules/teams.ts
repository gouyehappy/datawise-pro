import {api} from '@/shared/api'
import type {
    ShareTeamSharedQueryPayload,
    SubmitTeamProductionApprovalPayload,
    TeamAuditLogQuery,
    TeamMember,
    TeamProductionApprovalSummary,
} from '@/core/types'

export const teamsApi = {
    fetchAll: () => api.teams.fetchAll(),
    create: (name: string) => api.teams.create(name),
    join: (code: string) => api.teams.join(code),
    fetchJoinRequests: () => api.teams.fetchJoinRequests(),
    fetchMembers: (teamId: string) => api.teams.fetchMembers(teamId),
    updateMemberRole: (teamId: string, userId: number, role: TeamMember['role']) =>
        api.teams.updateMemberRole(teamId, userId, role),
    fetchInvites: (teamId: string) => api.teams.fetchInvites(teamId),
    approveInvite: (teamId: string, inviteId: string) => api.teams.approveInvite(teamId, inviteId),
    rejectInvite: (teamId: string, inviteId: string) => api.teams.rejectInvite(teamId, inviteId),
    updateSettings: (teamId: string, requireInviteApproval: boolean) =>
        api.teams.updateSettings(teamId, requireInviteApproval),
    fetchAuditLogs: (teamId: string, query?: TeamAuditLogQuery) =>
        api.teams.fetchAuditLogs(teamId, query),
    exportAuditLogs: (
        teamId: string,
        options: {
            format: 'csv' | 'json'
            actorUserId?: number
            since?: string
            until?: string
            includeFullSql?: boolean
            fileName?: string
        },
    ) => api.teams.exportAuditLogs(teamId, options),
    updateSharedConnections: (
        teamId: string,
        connectionIds: string[],
        connectionAccess?: Record<string, 'readonly' | 'readwrite' | 'ddl' | 'read' | 'write'>,
    ) => api.teams.updateSharedConnections(teamId, connectionIds, connectionAccess),
    updateOnCallConnections: (teamId: string, connectionIds: string[]) =>
        api.teams.updateOnCallConnections(teamId, connectionIds),
    updateSharedConsoles: (teamId: string, consoleIds: string[]) =>
        api.teams.updateSharedConsoles(teamId, consoleIds),
    updateVisibleProjects: (teamId: string, projectIds: string[]) =>
        api.teams.updateVisibleProjects(teamId, projectIds),
    updateShareSqlHistory: (teamId: string, enabled: boolean) =>
        api.teams.updateShareSqlHistory(teamId, enabled),
    fetchSharedAiSessions: (teamId: string) => api.teams.fetchSharedAiSessions(teamId),
    getSharedAiSession: (teamId: string, sessionId: string) =>
        api.teams.getSharedAiSession(teamId, sessionId),
    shareAiSession: (teamId: string, title: string, payloadJson: string) =>
        api.teams.shareAiSession(teamId, title, payloadJson),
    fetchSharedQueries: (teamId: string) => api.teams.fetchSharedQueries(teamId),
    getSharedQuery: (teamId: string, queryId: string) => api.teams.getSharedQuery(teamId, queryId),
    shareQuery: (teamId: string, payload: ShareTeamSharedQueryPayload) =>
        api.teams.shareQuery(teamId, payload),
    updateSharedQuery: (teamId: string, queryId: string, payload: ShareTeamSharedQueryPayload) =>
        api.teams.updateSharedQuery(teamId, queryId, payload),
    deleteSharedQuery: (teamId: string, queryId: string) => api.teams.deleteSharedQuery(teamId, queryId),
    addSharedQueryComment: (teamId: string, queryId: string, content: string) =>
        api.teams.addSharedQueryComment(teamId, queryId, content),
    deleteSharedQueryComment: (teamId: string, queryId: string, commentId: string) =>
        api.teams.deleteSharedQueryComment(teamId, queryId, commentId),
    toggleSharedQueryFavorite: (teamId: string, queryId: string) =>
        api.teams.toggleSharedQueryFavorite(teamId, queryId),
    fetchProductionApprovals: (teamId: string, status?: TeamProductionApprovalSummary['status']) =>
        api.teams.fetchProductionApprovals(teamId, status),
    getProductionApproval: (teamId: string, approvalId: string) =>
        api.teams.getProductionApproval(teamId, approvalId),
    submitProductionApproval: (teamId: string, payload: SubmitTeamProductionApprovalPayload) =>
        api.teams.submitProductionApproval(teamId, payload),
    approveProductionApproval: (teamId: string, approvalId: string) =>
        api.teams.approveProductionApproval(teamId, approvalId),
    rejectProductionApproval: (teamId: string, approvalId: string, comment?: string) =>
        api.teams.rejectProductionApproval(teamId, approvalId, comment),
}
