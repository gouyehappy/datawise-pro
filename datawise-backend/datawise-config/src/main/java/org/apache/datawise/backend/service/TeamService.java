package org.apache.datawise.backend.service;

import org.apache.datawise.backend.domain.AddTeamSharedQueryCommentRequest;
import org.apache.datawise.backend.domain.CreateTeamRequest;
import org.apache.datawise.backend.domain.JoinTeamRequest;
import org.apache.datawise.backend.domain.JoinTeamResultDto;
import org.apache.datawise.backend.domain.RejectTeamProductionApprovalRequest;
import org.apache.datawise.backend.domain.ShareTeamAiSessionRequest;
import org.apache.datawise.backend.domain.ShareTeamSharedQueryRequest;
import org.apache.datawise.backend.domain.SubmitTeamProductionApprovalRequest;
import org.apache.datawise.backend.domain.TeamAuditLogDto;
import org.apache.datawise.backend.domain.TeamInviteDto;
import org.apache.datawise.backend.domain.TeamJoinRequestDto;
import org.apache.datawise.backend.domain.TeamMemberDto;
import org.apache.datawise.backend.domain.TeamProductionApprovalDetailDto;
import org.apache.datawise.backend.domain.TeamProductionApprovalSummaryDto;
import org.apache.datawise.backend.domain.TeamSharedAiSessionDetailDto;
import org.apache.datawise.backend.domain.TeamSharedAiSessionDto;
import org.apache.datawise.backend.domain.TeamSharedQueryCommentDto;
import org.apache.datawise.backend.domain.TeamSharedQueryDetailDto;
import org.apache.datawise.backend.domain.TeamSharedQuerySummaryDto;
import org.apache.datawise.backend.domain.TeamSummaryDto;
import org.apache.datawise.backend.domain.UpdateOnCallConnectionsRequest;
import org.apache.datawise.backend.domain.UpdateTeamMemberRoleRequest;
import org.apache.datawise.backend.domain.UpdateTeamSettingsRequest;
import org.apache.datawise.backend.domain.UpdateTeamSharedQueryRequest;
import org.apache.datawise.backend.model.TeamProductionApprovalEntity;
import org.apache.datawise.backend.service.team.TeamAuditService;
import org.apache.datawise.backend.service.team.TeamMembershipService;
import org.apache.datawise.backend.service.team.TeamProductionApprovalService;
import org.apache.datawise.backend.service.team.TeamSharedQueryService;
import org.apache.datawise.backend.service.team.TeamSharingService;
import org.apache.datawise.backend.service.team.TeamSupport;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * 团队协作门面：委托 {@code service.team} 子服务，保持 Controller 注入点稳定。
 */
@Service
public class TeamService {

    private final TeamSupport support;
    private final TeamAuditService auditService;
    private final TeamMembershipService membershipService;
    private final TeamSharingService sharingService;
    private final TeamSharedQueryService sharedQueryService;
    private final TeamProductionApprovalService productionApprovalService;

    public TeamService(
                       TeamSupport support,
                       TeamAuditService auditService,
                       TeamMembershipService membershipService,
                       TeamSharingService sharingService,
                       TeamSharedQueryService sharedQueryService,
                       TeamProductionApprovalService productionApprovalService) {
        this.support = support;
        this.auditService = auditService;
        this.membershipService = membershipService;
        this.sharingService = sharingService;
        this.sharedQueryService = sharedQueryService;
        this.productionApprovalService = productionApprovalService;
    }

    public Long requireAuthenticatedUserId() {
        return support.requireUserId();
    }

    public List<TeamSummaryDto> listTeams() {
        return membershipService.listTeams();
    }

    public TeamSummaryDto createTeam(CreateTeamRequest request) {
        return membershipService.createTeam(request);
    }

    public JoinTeamResultDto joinTeam(JoinTeamRequest request) {
        return membershipService.joinTeam(request);
    }

    public List<TeamMemberDto> listMembers(String teamId) {
        return membershipService.listMembers(teamId);
    }

    public TeamMemberDto updateMemberRole(String teamId, Long targetUserId, UpdateTeamMemberRoleRequest request) {
        return membershipService.updateMemberRole(teamId, targetUserId, request);
    }

    public List<TeamInviteDto> listPendingInvites(String teamId) {
        return membershipService.listPendingInvites(teamId);
    }

    public List<TeamJoinRequestDto> listMyJoinRequests() {
        return membershipService.listMyJoinRequests();
    }

    public TeamSummaryDto approveInvite(String teamId, String inviteId) {
        return membershipService.approveInvite(teamId, inviteId);
    }

    public TeamSummaryDto rejectInvite(String teamId, String inviteId) {
        return membershipService.rejectInvite(teamId, inviteId);
    }

    public TeamSummaryDto updateTeamSettings(String teamId, UpdateTeamSettingsRequest request) {
        return membershipService.updateTeamSettings(teamId, request);
    }

    public List<TeamAuditLogDto> listAuditLogs(String teamId, int limit) {
        return listAuditLogs(teamId, limit, null, null, null);
    }

    public List<TeamAuditLogDto> listAuditLogs(
                                               String teamId,
                                               int limit,
                                               Long actorUserId,
                                               Instant since,
                                               Instant until) {
        return auditService.listAuditLogs(teamId, limit, actorUserId, since, until);
    }

    public java.util.stream.Stream<TeamAuditLogDto> exportAuditLogs(
                                                                    String teamId,
                                                                    Long actorUserId,
                                                                    Instant since,
                                                                    Instant until,
                                                                    boolean includeFullSql) {
        return auditService.exportAuditLogs(teamId, actorUserId, since, until, includeFullSql);
    }

    public void recordSqlExecutionAudit(String action, String connectionId, String database, String sql) {
        auditService.recordSqlExecutionAudit(action, connectionId, database, sql);
    }

    public void recordTerminalAudit(Long userId, String action, String detail) {
        auditService.recordTerminalAudit(userId, action, detail);
    }

    public TeamSummaryDto updateSharedConnections(String teamId, List<String> connectionIds) {
        return sharingService.updateSharedConnections(teamId, connectionIds);
    }

    public TeamSummaryDto updateSharedConnections(
                                                  String teamId,
                                                  List<String> connectionIds,
                                                  Map<String, String> connectionAccess) {
        return sharingService.updateSharedConnections(teamId, connectionIds, connectionAccess);
    }

    public TeamSummaryDto updateSharedConsoles(String teamId, List<String> consoleIds) {
        return sharingService.updateSharedConsoles(teamId, consoleIds);
    }

    public TeamSummaryDto updateShareSqlHistory(String teamId, boolean enabled) {
        return sharingService.updateShareSqlHistory(teamId, enabled);
    }

    public TeamSummaryDto updateOnCallConnections(String teamId, UpdateOnCallConnectionsRequest request) {
        return sharingService.updateOnCallConnections(teamId, request);
    }

    public TeamSummaryDto updateVisibleProjects(String teamId, List<String> projectIds) {
        return sharingService.updateVisibleProjects(teamId, projectIds);
    }

    public TeamSharedAiSessionDto shareAiSession(String teamId, ShareTeamAiSessionRequest request) {
        return sharingService.shareAiSession(teamId, request);
    }

    public List<TeamSharedAiSessionDto> listSharedAiSessions(String teamId) {
        return sharingService.listSharedAiSessions(teamId);
    }

    public TeamSharedAiSessionDetailDto getSharedAiSession(String teamId, String sessionId) {
        return sharingService.getSharedAiSession(teamId, sessionId);
    }

    public TeamSharedQuerySummaryDto shareQuery(String teamId, ShareTeamSharedQueryRequest request) {
        return sharedQueryService.shareQuery(teamId, request);
    }

    public List<TeamSharedQuerySummaryDto> listSharedQueries(String teamId) {
        return sharedQueryService.listSharedQueries(teamId);
    }

    public TeamSharedQueryDetailDto getSharedQuery(String teamId, String queryId) {
        return sharedQueryService.getSharedQuery(teamId, queryId);
    }

    public SseEmitter openSharedQueryStream(String teamId, String queryId) {
        return sharedQueryService.openSharedQueryStream(teamId, queryId);
    }

    public TeamSharedQuerySummaryDto updateSharedQuery(
                                                       String teamId,
                                                       String queryId,
                                                       UpdateTeamSharedQueryRequest request) {
        return sharedQueryService.updateSharedQuery(teamId, queryId, request);
    }

    public void deleteSharedQuery(String teamId, String queryId) {
        sharedQueryService.deleteSharedQuery(teamId, queryId);
    }

    public TeamSharedQueryCommentDto addSharedQueryComment(
                                                           String teamId,
                                                           String queryId,
                                                           AddTeamSharedQueryCommentRequest request) {
        return sharedQueryService.addSharedQueryComment(teamId, queryId, request);
    }

    public void deleteSharedQueryComment(String teamId, String queryId, String commentId) {
        sharedQueryService.deleteSharedQueryComment(teamId, queryId, commentId);
    }

    public TeamSharedQuerySummaryDto toggleSharedQueryFavorite(String teamId, String queryId) {
        return sharedQueryService.toggleSharedQueryFavorite(teamId, queryId);
    }

    public TeamProductionApprovalSummaryDto submitProductionApproval(
                                                                     String teamId,
                                                                     SubmitTeamProductionApprovalRequest request) {
        return productionApprovalService.submitProductionApproval(teamId, request);
    }

    public List<TeamProductionApprovalSummaryDto> listProductionApprovals(String teamId, String status) {
        return productionApprovalService.listProductionApprovals(teamId, status);
    }

    public TeamProductionApprovalDetailDto getProductionApproval(String teamId, String approvalId) {
        return productionApprovalService.getProductionApproval(teamId, approvalId);
    }

    public TeamProductionApprovalEntity requirePendingProductionApprovalForReview(String teamId, String approvalId) {
        return productionApprovalService.requirePendingProductionApprovalForReview(teamId, approvalId);
    }

    public TeamProductionApprovalEntity claimPendingProductionApprovalForExecution(String teamId, String approvalId) {
        return productionApprovalService.claimPendingProductionApprovalForExecution(teamId, approvalId);
    }

    public TeamProductionApprovalDetailDto finalizeProductionApproval(
                                                                      String teamId,
                                                                      String approvalId,
                                                                      Long reviewerUserId,
                                                                      boolean success,
                                                                      String executionError) {
        return productionApprovalService.finalizeProductionApproval(
                teamId, approvalId, reviewerUserId, success, executionError);
    }

    public TeamProductionApprovalDetailDto rejectProductionApproval(
                                                                    String teamId,
                                                                    String approvalId,
                                                                    RejectTeamProductionApprovalRequest request) {
        return productionApprovalService.rejectProductionApproval(teamId, approvalId, request);
    }
}
