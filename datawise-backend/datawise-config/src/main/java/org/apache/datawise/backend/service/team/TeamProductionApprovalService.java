package org.apache.datawise.backend.service.team;

import org.apache.datawise.backend.common.DatawiseErrorCodes;
import org.apache.datawise.backend.common.support.IdGenerator;
import org.apache.datawise.backend.common.support.TeamRoleSupport;
import org.apache.datawise.backend.domain.OutboundEventType;
import org.apache.datawise.backend.domain.RejectTeamProductionApprovalRequest;
import org.apache.datawise.backend.domain.SubmitTeamProductionApprovalRequest;
import org.apache.datawise.backend.domain.TeamProductionApprovalDetailDto;
import org.apache.datawise.backend.domain.TeamProductionApprovalSummaryDto;
import org.apache.datawise.backend.model.TeamEntity;
import org.apache.datawise.backend.model.TeamMemberEntity;
import org.apache.datawise.backend.model.TeamProductionApprovalEntity;
import org.apache.datawise.backend.service.outbound.OutboundNotifySupport;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class TeamProductionApprovalService {

    static final String STATUS_PENDING = "pending";
    static final String STATUS_EXECUTING = "executing";
    static final String STATUS_EXECUTED = "executed";
    static final String STATUS_FAILED = "failed";
    static final String STATUS_REJECTED = "rejected";

    private final TeamSupport support;
    private final TeamAuditService auditService;
    private final OutboundNotifySupport outboundNotifySupport;

    public TeamProductionApprovalService(
                                         TeamSupport support,
                                         TeamAuditService auditService,
                                         OutboundNotifySupport outboundNotifySupport) {
        this.support = support;
        this.auditService = auditService;
        this.outboundNotifySupport = outboundNotifySupport;
    }

    public TeamProductionApprovalSummaryDto submitProductionApproval(
                                                                     String teamId,
                                                                     SubmitTeamProductionApprovalRequest request) {
        Long userId = support.requireUserId();
        support.requireMember(teamId, userId);
        if (request.connectionId() == null || request.connectionId().isBlank()) {
            throw new IllegalArgumentException("connectionId is required");
        }
        if (request.sql() == null || request.sql().isBlank()) {
            throw new IllegalArgumentException("sql is required");
        }
        TeamEntity team = support.requireTeam(teamId);
        if (!team.getSharedConnectionIds().contains(request.connectionId().trim())) {
            throw new IllegalArgumentException("Connection is not shared with this team");
        }
        support.requireMember(teamId, userId);
        Instant now = Instant.now();
        TeamProductionApprovalEntity entity = new TeamProductionApprovalEntity();
        entity.setId(IdGenerator.shortId("tpa-"));
        entity.setTeamId(teamId);
        entity.setConnectionId(request.connectionId().trim());
        entity.setConnectionName(TeamSupport.trimToNull(request.connectionName()));
        entity.setDatabase(TeamSupport.trimToNull(request.database()));
        entity.setSql(request.sql().trim());
        entity.setStatus(STATUS_PENDING);
        entity.setRequestedByUserId(userId);
        entity.setRequestedAt(now);
        support.teamStore().saveProductionApproval(entity);
        auditService.audit(teamId, userId, "prod.approval.submit",
                "Submitted production SQL on " + entity.getConnectionId());
        outboundNotifySupport.publish(
                OutboundEventType.PROD_APPROVAL_PENDING,
                productionApprovalData(teamId, entity.getId(), entity.getConnectionId(), userId),
                managerUserIds(teamId));
        return toProductionApprovalSummaryDto(entity);
    }

    public List<TeamProductionApprovalSummaryDto> listProductionApprovals(String teamId, String status) {
        Long userId = support.requireUserId();
        TeamMemberEntity member = support.requireMember(teamId, userId);
        String normalizedStatus = status != null && !status.isBlank() ? status.trim() : null;
        return support.teamStore().findProductionApprovalsByTeamId(teamId, normalizedStatus).stream()
                .filter(entity -> TeamRoleSupport.canManageTeam(member.getRole())
                        || userId.equals(entity.getRequestedByUserId()))
                .map(this::toProductionApprovalSummaryDto)
                .toList();
    }

    public TeamProductionApprovalDetailDto getProductionApproval(String teamId, String approvalId) {
        Long userId = support.requireUserId();
        TeamMemberEntity member = support.requireMember(teamId, userId);
        TeamProductionApprovalEntity entity = support.teamStore().findProductionApprovalById(teamId, approvalId)
                .orElseThrow(() -> new IllegalArgumentException("Production approval not found"));
        requireProductionApprovalReadAccess(entity, member, userId);
        return toProductionApprovalDetailDto(entity);
    }

    public TeamProductionApprovalEntity requirePendingProductionApprovalForReview(String teamId, String approvalId) {
        Long userId = support.requireUserId();
        TeamMemberEntity member = support.requireMember(teamId, userId);
        if (!TeamRoleSupport.canManageTeam(member.getRole())) {
            throw new IllegalArgumentException("Insufficient permission to review production approvals");
        }
        TeamProductionApprovalEntity entity = support.teamStore().findProductionApprovalById(teamId, approvalId)
                .orElseThrow(() -> new IllegalArgumentException("Production approval not found"));
        if (!STATUS_PENDING.equals(entity.getStatus())) {
            throw new IllegalArgumentException("Production approval is not pending");
        }
        if (userId.equals(entity.getRequestedByUserId())) {
            throw new IllegalArgumentException(DatawiseErrorCodes.MAKER_CHECKER_SELF_APPROVE);
        }
        return entity;
    }

    public TeamProductionApprovalEntity claimPendingProductionApprovalForExecution(String teamId, String approvalId) {
        Long userId = support.requireUserId();
        TeamMemberEntity member = support.requireMember(teamId, userId);
        if (!TeamRoleSupport.canManageTeam(member.getRole())) {
            throw new IllegalArgumentException("Insufficient permission to review production approvals");
        }
        return support.teamStore().claimProductionApprovalExecution(teamId, approvalId, userId)
                .orElseThrow(() -> {
                    TeamProductionApprovalEntity existing = support.teamStore()
                            .findProductionApprovalById(teamId, approvalId)
                            .orElse(null);
                    if (existing == null) {
                        return new IllegalArgumentException("Production approval not found");
                    }
                    if (userId.equals(existing.getRequestedByUserId())) {
                        return new IllegalArgumentException(DatawiseErrorCodes.MAKER_CHECKER_SELF_APPROVE);
                    }
                    return new IllegalArgumentException("Production approval is not pending");
                });
    }

    public TeamProductionApprovalDetailDto finalizeProductionApproval(
                                                                      String teamId,
                                                                      String approvalId,
                                                                      Long reviewerUserId,
                                                                      boolean success,
                                                                      String executionError) {
        TeamProductionApprovalEntity entity = support.teamStore().findProductionApprovalById(teamId, approvalId)
                .orElseThrow(() -> new IllegalArgumentException("Production approval not found"));
        String status = entity.getStatus();
        if (STATUS_EXECUTED.equals(status) || STATUS_FAILED.equals(status) || STATUS_REJECTED.equals(status)) {
            throw new IllegalArgumentException("Production approval already finalized: " + status);
        }
        if (!STATUS_EXECUTING.equals(status) && !STATUS_PENDING.equals(status)) {
            throw new IllegalArgumentException("Production approval is not executable: " + status);
        }
        Instant now = Instant.now();
        entity.setStatus(success ? STATUS_EXECUTED : STATUS_FAILED);
        entity.setReviewedByUserId(reviewerUserId);
        entity.setReviewedAt(now);
        entity.setExecutionError(TeamSupport.trimToNull(executionError));
        support.teamStore().saveProductionApproval(entity);
        auditService.audit(teamId, reviewerUserId, success ? "prod.approval.execute" : "prod.approval.failed",
                (success ? "Executed" : "Failed to execute") + " production SQL on " + entity.getConnectionId());
        List<Long> recipients = new ArrayList<>(managerUserIds(teamId));
        if (entity.getRequestedByUserId() != null && !recipients.contains(entity.getRequestedByUserId())) {
            recipients.add(entity.getRequestedByUserId());
        }
        outboundNotifySupport.publish(
                OutboundEventType.PROD_APPROVAL_DECIDED,
                productionApprovalDecisionData(teamId, approvalId, success ? STATUS_EXECUTED : STATUS_FAILED, entity.getRequestedByUserId()),
                recipients);
        return toProductionApprovalDetailDto(entity);
    }

    public TeamProductionApprovalDetailDto rejectProductionApproval(
                                                                    String teamId,
                                                                    String approvalId,
                                                                    RejectTeamProductionApprovalRequest request) {
        Long userId = support.requireUserId();
        support.requireManager(teamId, userId);
        TeamProductionApprovalEntity entity = support.teamStore().findProductionApprovalById(teamId, approvalId)
                .orElseThrow(() -> new IllegalArgumentException("Production approval not found"));
        if (!STATUS_PENDING.equals(entity.getStatus())) {
            throw new IllegalArgumentException("Production approval is not pending");
        }
        if (userId.equals(entity.getRequestedByUserId())) {
            throw new IllegalArgumentException(DatawiseErrorCodes.MAKER_CHECKER_SELF_APPROVE);
        }
        entity.setStatus(STATUS_REJECTED);
        entity.setReviewedByUserId(userId);
        entity.setReviewedAt(Instant.now());
        entity.setReviewComment(TeamSupport.trimToNull(request != null ? request.comment() : null));
        support.teamStore().saveProductionApproval(entity);
        auditService.audit(teamId, userId, "prod.approval.reject",
                "Rejected production SQL on " + entity.getConnectionId());
        List<Long> recipients = new ArrayList<>(managerUserIds(teamId));
        if (entity.getRequestedByUserId() != null && !recipients.contains(entity.getRequestedByUserId())) {
            recipients.add(entity.getRequestedByUserId());
        }
        outboundNotifySupport.publish(
                OutboundEventType.PROD_APPROVAL_DECIDED,
                productionApprovalDecisionData(teamId, approvalId, STATUS_REJECTED, entity.getRequestedByUserId()),
                recipients);
        return toProductionApprovalDetailDto(entity);
    }

    private static Map<String, Object> productionApprovalData(
                                                              String teamId,
                                                              String approvalId,
                                                              String connectionId,
                                                              Long requesterUserId) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("teamId", teamId);
        data.put("approvalId", approvalId);
        data.put("connectionId", connectionId);
        data.put("requesterUserId", requesterUserId);
        return data;
    }

    private static Map<String, Object> productionApprovalDecisionData(
                                                                      String teamId,
                                                                      String approvalId,
                                                                      String status,
                                                                      Long requesterUserId) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("teamId", teamId);
        data.put("approvalId", approvalId);
        data.put("status", status);
        data.put("requesterUserId", requesterUserId);
        return data;
    }

    private List<Long> managerUserIds(String teamId) {
        return support.teamStore().findMembersByTeamId(teamId).stream()
                .filter(member -> TeamRoleSupport.canManageTeam(member.getRole()))
                .map(TeamMemberEntity::getUserId)
                .filter(id -> id != null)
                .distinct()
                .toList();
    }

    private void requireProductionApprovalReadAccess(
                                                     TeamProductionApprovalEntity entity,
                                                     TeamMemberEntity member,
                                                     Long userId) {
        if (TeamRoleSupport.canManageTeam(member.getRole())) {
            return;
        }
        if (userId.equals(entity.getRequestedByUserId())) {
            return;
        }
        throw new IllegalArgumentException("Insufficient permission to view production approval");
    }

    private TeamProductionApprovalSummaryDto toProductionApprovalSummaryDto(TeamProductionApprovalEntity entity) {
        return new TeamProductionApprovalSummaryDto(
                entity.getId(),
                entity.getTeamId(),
                entity.getConnectionId(),
                entity.getConnectionName(),
                entity.getDatabase(),
                entity.getStatus(),
                support.resolveUserName(entity.getRequestedByUserId()),
                entity.getRequestedByUserId(),
                support.resolveUserName(entity.getReviewedByUserId()),
                TeamSupport.formatInstant(entity.getRequestedAt()),
                TeamSupport.formatInstant(entity.getReviewedAt()));
    }

    private TeamProductionApprovalDetailDto toProductionApprovalDetailDto(TeamProductionApprovalEntity entity) {
        return new TeamProductionApprovalDetailDto(
                entity.getId(),
                entity.getTeamId(),
                entity.getConnectionId(),
                entity.getConnectionName(),
                entity.getDatabase(),
                entity.getSql(),
                entity.getStatus(),
                support.resolveUserName(entity.getRequestedByUserId()),
                entity.getRequestedByUserId(),
                support.resolveUserName(entity.getReviewedByUserId()),
                entity.getReviewedByUserId(),
                entity.getReviewComment(),
                entity.getExecutionError(),
                TeamSupport.formatInstant(entity.getRequestedAt()),
                TeamSupport.formatInstant(entity.getReviewedAt()));
    }
}
