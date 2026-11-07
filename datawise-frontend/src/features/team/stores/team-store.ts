import {defineStore} from 'pinia'
import {ref} from 'vue'
import type {
    JoinTeamResult,
    TeamAuditLog,
    TeamAuditLogQuery,
    TeamInvite,
    TeamJoinRequest,
    TeamMember,
    TeamSharedAiSessionDetail,
    TeamSharedAiSessionSummary,
    TeamSharedQueryComment,
    TeamSharedQueryDetail,
    TeamSharedQuerySummary,
    ShareTeamSharedQueryPayload,
    TeamProductionApprovalSummary,
    TeamSummary,
} from '@/core/types'
import {teamsApi} from '@/api'
import {resolveActiveTeamId} from '@/features/team/services/team-shared-explorer.service'

/** 团队列表、详情与协作 API 统一入口 */
export const useTeamStore = defineStore('team', () => {
    const teams = ref<TeamSummary[]>([])
    const activeTeamId = ref<string | null>(null)
    const ready = ref(false)
    const joinRequests = ref<TeamJoinRequest[]>([])
    const membersByTeamId = ref<Record<string, TeamMember[]>>({})
    const invitesByTeamId = ref<Record<string, TeamInvite[]>>({})
    const auditLogsByTeamId = ref<Record<string, TeamAuditLog[]>>({})
    const sharedAiSessionsByTeamId = ref<Record<string, TeamSharedAiSessionSummary[]>>({})
    const sharedQueriesByTeamId = ref<Record<string, TeamSharedQuerySummary[]>>({})

    async function load() {
        teams.value = await teamsApi.fetchAll()
        activeTeamId.value = resolveActiveTeamId(teams.value, activeTeamId.value)
        ready.value = true
    }

    /** 登录/退出/切换账号时清空内存缓存，避免沿用上一用户的团队 ID。 */
    function resetForSession() {
        teams.value = []
        activeTeamId.value = null
        ready.value = false
        joinRequests.value = []
        membersByTeamId.value = {}
        invitesByTeamId.value = {}
        auditLogsByTeamId.value = {}
        sharedAiSessionsByTeamId.value = {}
        sharedQueriesByTeamId.value = {}
    }

    async function createTeam(name: string) {
        const team = await teamsApi.create(name)
        teams.value.unshift(team)
        activeTeamId.value = team.id
        return team
    }

    async function joinTeam(code: string): Promise<JoinTeamResult> {
        const result = await teamsApi.join(code)
        if (result.status === 'joined' && result.team) {
            const existing = teams.value.find((item) => item.id === result.team!.id)
            if (!existing) {
                teams.value.unshift(result.team)
            } else {
                replaceTeam(result.team)
            }
            activeTeamId.value = result.team.id
        }
        return result
    }

    async function loadJoinRequests() {
        try {
            joinRequests.value = await teamsApi.fetchJoinRequests()
        } catch {
            joinRequests.value = []
        }
        return joinRequests.value
    }

    async function fetchMembers(teamId: string) {
        const list = await teamsApi.fetchMembers(teamId)
        membersByTeamId.value = {...membersByTeamId.value, [teamId]: list}
        return list
    }

    async function fetchInvites(teamId: string) {
        const list = await teamsApi.fetchInvites(teamId)
        invitesByTeamId.value = {...invitesByTeamId.value, [teamId]: list}
        return list
    }

    async function fetchAuditLogs(teamId: string, query?: TeamAuditLogQuery) {
        const list = await teamsApi.fetchAuditLogs(teamId, query)
        auditLogsByTeamId.value = {...auditLogsByTeamId.value, [teamId]: list}
        return list
    }

    async function exportAuditLogs(
        teamId: string,
        options: {
            format: 'csv' | 'json'
            actorUserId?: number
            since?: string
            until?: string
            includeFullSql?: boolean
            fileName?: string
        },
    ) {
        await teamsApi.exportAuditLogs(teamId, options)
    }

    async function fetchSharedAiSessions(teamId: string) {
        const list = await teamsApi.fetchSharedAiSessions(teamId)
        sharedAiSessionsByTeamId.value = {...sharedAiSessionsByTeamId.value, [teamId]: list}
        return list
    }

    async function getSharedAiSession(teamId: string, sessionId: string) {
        return teamsApi.getSharedAiSession(teamId, sessionId)
    }

    async function updateMemberRole(teamId: string, userId: number, role: TeamMember['role']) {
        const member = await teamsApi.updateMemberRole(teamId, userId, role)
        const current = membersByTeamId.value[teamId] ?? []
        membersByTeamId.value = {
            ...membersByTeamId.value,
            [teamId]: current.map((item) => (item.userId === userId ? member : item)),
        }
        return member
    }

    async function approveInvite(teamId: string, inviteId: string) {
        const team = await teamsApi.approveInvite(teamId, inviteId)
        replaceTeam(team)
        await Promise.all([fetchInvites(teamId), fetchMembers(teamId), load()])
        return team
    }

    async function rejectInvite(teamId: string, inviteId: string) {
        const team = await teamsApi.rejectInvite(teamId, inviteId)
        replaceTeam(team)
        await fetchInvites(teamId)
        return team
    }

    async function shareAiSession(teamId: string, title: string, payloadJson: string) {
        const session = await teamsApi.shareAiSession(teamId, title, payloadJson)
        const current = sharedAiSessionsByTeamId.value[teamId] ?? []
        sharedAiSessionsByTeamId.value = {
            ...sharedAiSessionsByTeamId.value,
            [teamId]: [session, ...current.filter((item) => item.id !== session.id)],
        }
        return session
    }

    async function fetchSharedQueries(teamId: string) {
        const list = await teamsApi.fetchSharedQueries(teamId)
        sharedQueriesByTeamId.value = {...sharedQueriesByTeamId.value, [teamId]: list}
        return list
    }

    async function getSharedQuery(teamId: string, queryId: string) {
        return teamsApi.getSharedQuery(teamId, queryId)
    }

    async function shareQuery(teamId: string, payload: ShareTeamSharedQueryPayload) {
        const created = await teamsApi.shareQuery(teamId, payload)
        const current = sharedQueriesByTeamId.value[teamId] ?? []
        sharedQueriesByTeamId.value = {
            ...sharedQueriesByTeamId.value,
            [teamId]: [created, ...current.filter((item) => item.id !== created.id)],
        }
        return created
    }

    async function updateSharedQuery(
        teamId: string,
        queryId: string,
        payload: ShareTeamSharedQueryPayload,
    ) {
        const updated = await teamsApi.updateSharedQuery(teamId, queryId, payload)
        const list = sharedQueriesByTeamId.value[teamId] ?? []
        sharedQueriesByTeamId.value = {
            ...sharedQueriesByTeamId.value,
            [teamId]: list.map((item) => (item.id === queryId ? updated : item)),
        }
        return updated
    }

    async function deleteSharedQuery(teamId: string, queryId: string) {
        await teamsApi.deleteSharedQuery(teamId, queryId)
        const list = sharedQueriesByTeamId.value[teamId] ?? []
        sharedQueriesByTeamId.value = {
            ...sharedQueriesByTeamId.value,
            [teamId]: list.filter((item) => item.id !== queryId),
        }
    }

    function replaceSharedQuerySummary(teamId: string, summary: TeamSharedQuerySummary) {
        const list = sharedQueriesByTeamId.value[teamId] ?? []
        sharedQueriesByTeamId.value = {
            ...sharedQueriesByTeamId.value,
            [teamId]: list.map((item) => (item.id === summary.id ? summary : item)),
        }
    }

    async function addSharedQueryComment(teamId: string, queryId: string, content: string) {
        return teamsApi.addSharedQueryComment(teamId, queryId, content)
    }

    async function deleteSharedQueryComment(teamId: string, queryId: string, commentId: string) {
        await teamsApi.deleteSharedQueryComment(teamId, queryId, commentId)
    }

    async function toggleSharedQueryFavorite(teamId: string, queryId: string) {
        const summary = await teamsApi.toggleSharedQueryFavorite(teamId, queryId)
        replaceSharedQuerySummary(teamId, summary)
        return summary
    }

    async function fetchProductionApprovals(teamId: string, status?: string) {
        return teamsApi.fetchProductionApprovals(teamId, status as TeamProductionApprovalSummary['status'] | undefined)
    }

    async function getProductionApproval(teamId: string, approvalId: string) {
        return teamsApi.getProductionApproval(teamId, approvalId)
    }

    async function submitProductionApproval(
        teamId: string,
        payload: Parameters<typeof teamsApi.submitProductionApproval>[1],
    ) {
        return teamsApi.submitProductionApproval(teamId, payload)
    }

    async function approveProductionApproval(teamId: string, approvalId: string) {
        return teamsApi.approveProductionApproval(teamId, approvalId)
    }

    async function rejectProductionApproval(teamId: string, approvalId: string, comment?: string) {
        return teamsApi.rejectProductionApproval(teamId, approvalId, comment)
    }

    async function updateSharedConnections(
        teamId: string,
        connectionIds: string[],
        connectionAccess?: Record<string, 'readonly' | 'readwrite' | 'ddl' | 'read' | 'write'>,
    ) {
        return replaceTeam(await teamsApi.updateSharedConnections(teamId, connectionIds, connectionAccess))
    }

    async function updateOnCallConnections(teamId: string, connectionIds: string[]) {
        return replaceTeam(await teamsApi.updateOnCallConnections(teamId, connectionIds))
    }

    async function updateSharedConsoles(teamId: string, consoleIds: string[]) {
        return replaceTeam(await teamsApi.updateSharedConsoles(teamId, consoleIds))
    }

    async function updateVisibleProjects(teamId: string, projectIds: string[]) {
        return replaceTeam(await teamsApi.updateVisibleProjects(teamId, projectIds))
    }

    async function updateShareSqlHistory(teamId: string, enabled: boolean) {
        return replaceTeam(await teamsApi.updateShareSqlHistory(teamId, enabled))
    }

    async function updateSettings(teamId: string, requireInviteApproval: boolean) {
        return replaceTeam(await teamsApi.updateSettings(teamId, requireInviteApproval))
    }

    function replaceTeam(team: TeamSummary) {
        const index = teams.value.findIndex((item) => item.id === team.id)
        if (index >= 0) {
            teams.value[index] = team
        }
        return team
    }

    return {
        teams,
        activeTeamId,
        ready,
        joinRequests,
        membersByTeamId,
        invitesByTeamId,
        auditLogsByTeamId,
        sharedAiSessionsByTeamId,
        sharedQueriesByTeamId,
        load,
        resetForSession,
        createTeam,
        joinTeam,
        loadJoinRequests,
        fetchMembers,
        fetchInvites,
        fetchAuditLogs,
        exportAuditLogs,
        fetchSharedAiSessions,
        getSharedAiSession,
        updateMemberRole,
        approveInvite,
        rejectInvite,
        shareAiSession,
        fetchSharedQueries,
        getSharedQuery,
        shareQuery,
        updateSharedQuery,
        deleteSharedQuery,
        addSharedQueryComment,
        deleteSharedQueryComment,
        toggleSharedQueryFavorite,
        fetchProductionApprovals,
        getProductionApproval,
        submitProductionApproval,
        approveProductionApproval,
        rejectProductionApproval,
        replaceSharedQuerySummary,
        updateSharedConnections,
        updateOnCallConnections,
        updateSharedConsoles,
        updateVisibleProjects,
        updateShareSqlHistory,
        updateSettings,
    }
})
