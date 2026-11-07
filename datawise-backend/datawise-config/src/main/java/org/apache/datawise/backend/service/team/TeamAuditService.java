package org.apache.datawise.backend.service.team;

import org.apache.datawise.backend.common.DatawiseErrorCodes;
import org.apache.datawise.backend.common.UnauthorizedException;
import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.apache.datawise.backend.common.support.IdGenerator;
import org.apache.datawise.backend.common.support.TeamRoleSupport;
import org.apache.datawise.backend.configstore.TeamStore;
import org.apache.datawise.backend.domain.OutboundEventType;
import org.apache.datawise.backend.domain.TeamAuditLogDto;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.model.TeamAuditLogEntity;
import org.apache.datawise.backend.model.TeamEntity;
import org.apache.datawise.backend.model.TeamMemberEntity;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.outbound.OutboundNotifySupport;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

@Service
public class TeamAuditService {

    private static final Logger logger = LoggerFactory.getLogger(TeamAuditService.class);
    private static final int EXPORT_MAX = 50_000;

    private final TeamStore teamStore;
    private final TeamSupport support;
    private final OutboundNotifySupport outboundNotifySupport;

    public TeamAuditService(
                            TeamStore teamStore,
                            TeamSupport support,
                            OutboundNotifySupport outboundNotifySupport) {
        this.teamStore = teamStore;
        this.support = support;
        this.outboundNotifySupport = outboundNotifySupport;
    }

    public List<TeamAuditLogDto> listAuditLogs(
                                               String teamId,
                                               int limit,
                                               Long actorUserId,
                                               Instant since,
                                               Instant until) {
        TeamMemberEntity member = support.requireMember(teamId, support.requireUserId());
        if (!TeamRoleSupport.canManageTeam(member.getRole())) {
            throw new IllegalArgumentException(DatawiseErrorCodes.TEAM_AUDIT_FORBIDDEN);
        }
        return teamStore.findAuditLogsByTeamId(teamId, limit, actorUserId, since, until).stream()
                .map(support::toAuditDto)
                .toList();
    }

    public Stream<TeamAuditLogDto> exportAuditLogs(
                                                   String teamId,
                                                   Long actorUserId,
                                                   Instant since,
                                                   Instant until,
                                                   boolean includeFullSql) {
        Long userId = support.requireUserId();
        TeamMemberEntity member = support.requireMember(teamId, userId);
        if (!TeamRoleSupport.canManageTeam(member.getRole())) {
            throw new IllegalArgumentException(DatawiseErrorCodes.TEAM_AUDIT_FORBIDDEN);
        }
        if (includeFullSql && !TeamRoleSupport.canManageTeam(member.getRole())) {
            throw new IllegalArgumentException("Insufficient permission for full SQL export");
        }
        return teamStore.findAuditLogsByTeamId(teamId, EXPORT_MAX, actorUserId, since, until).stream()
                .map(support::toAuditDto);
    }

    public void recordSqlExecutionAudit(String action, String connectionId, String database, String sql) {
        if (action == null || action.isBlank() || sql == null || sql.isBlank()) {
            return;
        }
        Long userId;
        try {
            userId = support.requireUserId();
        } catch (UnauthorizedException ex) {
            return;
        } catch (RuntimeException ex) {
            ExceptionLogging.recoverable(logger, "Team SQL audit skipped", ex);
            return;
        }
        String detail = buildSqlAuditDetail(connectionId, database, sql);
        recordUserAudit(userId, action.trim(), detail);
    }

    public void recordTerminalAudit(Long userId, String action, String detail) {
        if (userId == null || action == null || action.isBlank()) {
            return;
        }
        recordUserAudit(userId, action.trim(), detail != null ? detail : "");
    }

    public void audit(String teamId, Long actorUserId, String action, String detail) {
        TeamEntity team = teamStore.findTeamById(teamId).orElse(null);
        String tenantId = team != null
                ? TenantIds.normalizeOrDefault(team.getTenantId())
                : TenantIds.normalizeOrDefault(UserContext.getTenantId());
        TeamAuditLogEntity log = new TeamAuditLogEntity();
        log.setId(IdGenerator.shortId("ta-"));
        log.setTenantId(tenantId);
        log.setTeamId(teamId);
        log.setActorUserId(actorUserId);
        log.setAction(action);
        log.setDetail(detail);
        log.setCreatedAt(Instant.now());
        teamStore.appendAuditLog(log);
        try {
            List<Long> recipients = teamStore.findMembersByTeamId(teamId).stream()
                    .map(TeamMemberEntity::getUserId)
                    .filter(id -> id != null)
                    .distinct()
                    .toList();
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("teamId", teamId);
            data.put("action", action);
            data.put("detail", detail != null ? detail : "");
            if (detail != null && detail.contains("sql:")) {
                data.put("sql", detail.substring(detail.indexOf("sql:") + 4));
            }
            outboundNotifySupport.publish(OutboundEventType.AUDIT_APPENDED, data, recipients);
        } catch (RuntimeException ex) {
            ExceptionLogging.recoverable(logger, "Team audit outbound skipped", ex);
        }
    }

    void recordUserAudit(Long userId, String action, String detail) {
        String currentTenant = TenantIds.normalizeOrDefault(UserContext.getTenantId());
        for (TeamMemberEntity member : teamStore.findMembersByUserId(userId)) {
            try {
                TeamEntity team = teamStore.findTeamById(member.getTeamId()).orElse(null);
                if (team == null) {
                    continue;
                }
                if (!currentTenant.equals(TenantIds.normalizeOrDefault(team.getTenantId()))) {
                    continue;
                }
                audit(member.getTeamId(), userId, action, detail);
            } catch (RuntimeException ex) {
                ExceptionLogging.recoverable(logger, "Team audit skipped", ex);
            }
        }
    }

    private static String buildSqlAuditDetail(String connectionId, String database, String sql) {
        StringBuilder sb = new StringBuilder();
        if (connectionId != null && !connectionId.isBlank()) {
            sb.append("connectionId=").append(connectionId.trim());
        }
        if (database != null && !database.isBlank()) {
            if (!sb.isEmpty()) {
                sb.append("; ");
            }
            sb.append("database=").append(database.trim());
        }
        if (!sb.isEmpty()) {
            sb.append(" | sql:");
        } else {
            sb.append("sql:");
        }
        sb.append(sql.trim());
        return sb.toString();
    }
}
