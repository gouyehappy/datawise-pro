package org.apache.datawise.backend.service.team;

import org.apache.datawise.backend.common.support.TeamRoleSupport;
import org.apache.datawise.backend.configstore.TeamStore;
import org.apache.datawise.backend.domain.TeamAuditLogDto;
import org.apache.datawise.backend.domain.TeamInviteDto;
import org.apache.datawise.backend.domain.TeamMemberDto;
import org.apache.datawise.backend.domain.TeamSummaryDto;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.model.TeamAuditLogEntity;
import org.apache.datawise.backend.model.TeamEntity;
import org.apache.datawise.backend.model.TeamInviteEntity;
import org.apache.datawise.backend.model.TeamMemberEntity;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.UserAccountService;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

@Component
public class TeamSupport {

    static final DateTimeFormatter AUDIT_FMT =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").withZone(ZoneId.systemDefault());

    private final TeamStore teamStore;
    private final UserAccountService userAccountService;

    public TeamSupport(TeamStore teamStore, UserAccountService userAccountService) {
        this.teamStore = teamStore;
        this.userAccountService = userAccountService;
    }

    public Long requireUserId() {
        return userAccountService.requireUserId();
    }

    public TeamMemberEntity requireMember(String teamId, Long userId) {
        requireTeam(teamId);
        return teamStore.findMember(teamId, userId)
                .orElseThrow(() -> new IllegalArgumentException("Not a team member"));
    }

    public TeamMemberEntity requireManager(String teamId, Long userId) {
        TeamMemberEntity member = requireMember(teamId, userId);
        if (!TeamRoleSupport.canManageTeam(member.getRole())) {
            throw new IllegalArgumentException("Insufficient permission");
        }
        return member;
    }

    public TeamEntity requireTeam(String teamId) {
        TeamEntity team = teamStore.findTeamById(teamId)
                .orElseThrow(() -> new IllegalArgumentException("Team not found"));
        assertCurrentTenant(team.getTenantId());
        return team;
    }

    public void assertCurrentTenant(String teamTenantId) {
        if (!matchesCurrentTenant(teamTenantId)) {
            throw new IllegalArgumentException("Team not found");
        }
    }

    public boolean matchesCurrentTenant(String teamTenantId) {
        String normalizedTeam = (teamTenantId == null || teamTenantId.isBlank())
                ? TenantIds.DEFAULT
                : teamTenantId.trim();
        return TenantIds.normalizeOrDefault(UserContext.getTenantId()).equals(normalizedTeam);
    }

    public String resolveUserName(Long userId) {
        return userAccountService.resolveUserName(userId);
    }

    public TeamStore teamStore() {
        return teamStore;
    }

    public TeamMemberDto toMemberDto(TeamMemberEntity member) {
        return new TeamMemberDto(
                member.getUserId(),
                userAccountService.resolveUserName(member.getUserId()),
                TeamRoleSupport.normalizeRole(member.getRole()),
                member.getJoinedAt() != null ? AUDIT_FMT.format(member.getJoinedAt()) : "");
    }

    public TeamInviteDto toInviteDto(TeamInviteEntity invite) {
        return new TeamInviteDto(
                invite.getId(),
                invite.getUserId(),
                userAccountService.resolveUserName(invite.getUserId()),
                invite.getStatus(),
                invite.getRequestedAt() != null ? AUDIT_FMT.format(invite.getRequestedAt()) : "");
    }

    public TeamAuditLogDto toAuditDto(TeamAuditLogEntity log) {
        return new TeamAuditLogDto(
                log.getId(),
                TenantIds.normalizeOrDefault(log.getTenantId()),
                log.getActorUserId(),
                userAccountService.resolveUserName(log.getActorUserId()),
                log.getAction(),
                log.getDetail(),
                log.getCreatedAt() != null ? AUDIT_FMT.format(log.getCreatedAt()) : "");
    }

    public TeamSummaryDto toSummary(TeamEntity team, String role) {
        int count = (int) teamStore.countMembersByTeamId(team.getId());
        String normalizedRole = TeamRoleSupport.normalizeRole(role);
        String inviteCode = TeamRoleSupport.canManageTeam(normalizedRole) ? team.getInviteCode() : null;
        int pendingInviteCount = TeamRoleSupport.canManageTeam(normalizedRole)
                ? (int) teamStore.countPendingInvitesByTeamId(team.getId())
                : 0;
        return new TeamSummaryDto(
                team.getId(),
                team.getName(),
                count,
                normalizedRole,
                List.copyOf(team.getSharedConnectionIds()),
                Map.copyOf(team.getSharedConnectionAccess()),
                List.copyOf(team.getOnCallConnectionIds()),
                List.copyOf(team.getSharedConsoleIds()),
                team.isShareSqlHistory(),
                team.isRequireInviteApproval(),
                inviteCode,
                pendingInviteCount,
                List.copyOf(team.getVisibleProjectIds()));
    }

    public static String trimToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }

    public static String formatInstant(Instant instant) {
        return instant != null ? AUDIT_FMT.format(instant) : "";
    }
}
