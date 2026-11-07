package org.apache.datawise.backend.configstore.team;

import org.apache.datawise.backend.model.TeamAuditLogEntity;
import org.apache.datawise.backend.model.TeamEntity;
import org.apache.datawise.backend.model.TeamInviteEntity;
import org.apache.datawise.backend.model.TeamMemberEntity;
import org.apache.datawise.backend.model.TeamProductionApprovalEntity;
import org.apache.datawise.backend.model.TeamSharedAiSessionEntity;
import org.apache.datawise.backend.model.TeamSharedQueryEntity;

import java.util.List;

public record TeamSnapshot(
        List<TeamEntity> teams,
        List<TeamMemberEntity> members,
        List<TeamInviteEntity> invites,
        List<TeamAuditLogEntity> auditLogs,
        List<TeamSharedAiSessionEntity> sharedAiSessions,
        List<TeamSharedQueryEntity> sharedQueries,
        List<TeamProductionApprovalEntity> productionApprovals) {

    public TeamSnapshot {
        sharedQueries = sharedQueries != null ? sharedQueries : List.of();
        productionApprovals = productionApprovals != null ? productionApprovals : List.of();
    }

    public static TeamSnapshot empty() {
        return new TeamSnapshot(List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of());
    }
}
