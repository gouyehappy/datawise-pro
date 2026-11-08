package org.apache.datawise.backend.configstore;

import org.apache.datawise.backend.model.TeamAuditLogEntity;
import org.apache.datawise.backend.model.TeamEntity;
import org.apache.datawise.backend.model.TeamInviteEntity;
import org.apache.datawise.backend.model.TeamMemberEntity;
import org.apache.datawise.backend.model.TeamProductionApprovalEntity;
import org.apache.datawise.backend.model.TeamSharedAiSessionEntity;
import org.apache.datawise.backend.model.TeamSharedQueryEntity;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

/** Team catalog scoped to the current tenant (file or jdbc backend). */
public interface TeamStore {

    void ensureTenantFiles(String tenantId);

    List<TeamMemberEntity> findMembersByUserId(Long userId);

    List<TeamMemberEntity> findMembersByTeamId(String teamId);

    Optional<TeamMemberEntity> findMember(String teamId, Long userId);

    Optional<TeamEntity> findTeamById(String teamId);

    List<TeamEntity> listAllTeams();

    long countMembersByTeamId(String teamId);

    TeamEntity saveTeam(TeamEntity team);

    TeamMemberEntity saveMember(TeamMemberEntity member);

    void removeMember(String teamId, Long userId);

    List<TeamInviteEntity> findInvitesByTeamId(String teamId);

    Optional<TeamInviteEntity> findInviteById(String inviteId);

    Optional<TeamInviteEntity> findPendingInvite(String teamId, Long userId);

    List<TeamInviteEntity> findInvitesByUserId(Long userId);

    long countPendingInvitesByTeamId(String teamId);

    TeamInviteEntity saveInvite(TeamInviteEntity invite);

    List<TeamAuditLogEntity> findAuditLogsByTeamId(String teamId, int limit);

    List<TeamAuditLogEntity> findAuditLogsByTeamId(
                                                   String teamId,
                                                   int limit,
                                                   Long actorUserId,
                                                   Instant since,
                                                   Instant until);

    TeamAuditLogEntity appendAuditLog(TeamAuditLogEntity log);

    Optional<TeamEntity> findTeamByInviteCode(String code);

    TeamSharedAiSessionEntity saveSharedAiSession(TeamSharedAiSessionEntity session);

    List<TeamSharedAiSessionEntity> findSharedAiSessionsByTeamId(String teamId);

    Optional<TeamSharedAiSessionEntity> findSharedAiSessionById(String teamId, String sessionId);

    TeamSharedQueryEntity saveSharedQuery(TeamSharedQueryEntity query);

    void deleteSharedQuery(String teamId, String queryId);

    List<TeamSharedQueryEntity> findSharedQueriesByTeamId(String teamId);

    Optional<TeamSharedQueryEntity> findSharedQueryById(String teamId, String queryId);

    TeamProductionApprovalEntity saveProductionApproval(TeamProductionApprovalEntity approval);

    List<TeamProductionApprovalEntity> findProductionApprovalsByTeamId(String teamId, String status);

    Optional<TeamProductionApprovalEntity> findProductionApprovalById(String teamId, String approvalId);

    /**
     * Atomically claim a pending production approval for execution.
     * Returns empty when not found, not pending, or reviewer is the requester.
     */
    Optional<TeamProductionApprovalEntity> claimProductionApprovalExecution(
                                                                            String teamId,
                                                                            String approvalId,
                                                                            Long reviewerUserId);
}
