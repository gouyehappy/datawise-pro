package org.apache.datawise.backend.service.team;

import org.apache.datawise.backend.common.support.IdGenerator;
import org.apache.datawise.backend.common.support.TeamRoleSupport;
import org.apache.datawise.backend.domain.CreateTeamRequest;
import org.apache.datawise.backend.domain.JoinTeamRequest;
import org.apache.datawise.backend.domain.JoinTeamResultDto;
import org.apache.datawise.backend.domain.OutboundEventType;
import org.apache.datawise.backend.domain.TeamInviteDto;
import org.apache.datawise.backend.domain.TeamJoinRequestDto;
import org.apache.datawise.backend.domain.TeamMemberDto;
import org.apache.datawise.backend.domain.TeamSummaryDto;
import org.apache.datawise.backend.domain.UpdateTeamMemberRoleRequest;
import org.apache.datawise.backend.domain.UpdateTeamSettingsRequest;
import org.apache.datawise.backend.model.TeamEntity;
import org.apache.datawise.backend.model.TeamInviteEntity;
import org.apache.datawise.backend.model.TeamMemberEntity;
import org.apache.datawise.backend.service.outbound.OutboundNotifySupport;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class TeamMembershipService {

    private final TeamSupport support;
    private final TeamAuditService auditService;
    private final OutboundNotifySupport outboundNotifySupport;

    public TeamMembershipService(
                                 TeamSupport support,
                                 TeamAuditService auditService,
                                 OutboundNotifySupport outboundNotifySupport) {
        this.support = support;
        this.auditService = auditService;
        this.outboundNotifySupport = outboundNotifySupport;
    }

    public List<TeamSummaryDto> listTeams() {
        Long userId = support.requireUserId();
        return support.teamStore().findMembersByUserId(userId).stream()
                .map(member -> support.teamStore().findTeamById(member.getTeamId())
                        .filter(team -> support.matchesCurrentTenant(team.getTenantId()))
                        .map(team -> support.toSummary(team, member.getRole()))
                        .orElse(null))
                .filter(item -> item != null)
                .toList();
    }

    public TeamSummaryDto createTeam(CreateTeamRequest request) {
        Long userId = support.requireUserId();
        if (request.name() == null || request.name().isBlank()) {
            throw new IllegalArgumentException("Team name is required");
        }
        TeamEntity team = new TeamEntity();
        team.setId(IdGenerator.shortId("team-"));
        team.setName(request.name().trim());
        team.setOwnerUserId(userId);
        team.setTenantId(org.apache.datawise.backend.security.UserContext.getTenantId());
        team.setInviteCode(UUID.randomUUID().toString().substring(0, 8));
        team.setRequireInviteApproval(true);
        team.setCreatedAt(Instant.now());
        support.teamStore().saveTeam(team);

        TeamMemberEntity member = new TeamMemberEntity();
        member.setTeamId(team.getId());
        member.setUserId(userId);
        member.setRole(TeamRoleSupport.OWNER);
        member.setJoinedAt(Instant.now());
        support.teamStore().saveMember(member);
        auditService.audit(team.getId(), userId, "team.create", "Created team \"" + team.getName() + "\"");

        return support.toSummary(team, TeamRoleSupport.OWNER);
    }

    public JoinTeamResultDto joinTeam(JoinTeamRequest request) {
        Long userId = support.requireUserId();
        if (request.code() == null || request.code().isBlank()) {
            throw new IllegalArgumentException("Invite code is required");
        }
        String code = request.code().trim();
        TeamEntity team = support.teamStore().findTeamByInviteCode(code)
                .filter(candidate -> support.matchesCurrentTenant(candidate.getTenantId()))
                .orElseThrow(() -> new IllegalArgumentException("Invalid invite code"));

        if (support.teamStore().findMember(team.getId(), userId).isPresent()) {
            String role = support.teamStore().findMember(team.getId(), userId).orElseThrow().getRole();
            return new JoinTeamResultDto("already_member", support.toSummary(team, role), "Already a team member");
        }

        if (team.isRequireInviteApproval() && !userId.equals(team.getOwnerUserId())) {
            if (support.teamStore().findPendingInvite(team.getId(), userId).isPresent()) {
                return new JoinTeamResultDto("pending", null, "Invite request already pending approval");
            }
            TeamInviteEntity invite = new TeamInviteEntity();
            invite.setId(IdGenerator.shortId("inv-"));
            invite.setTeamId(team.getId());
            invite.setUserId(userId);
            invite.setStatus("pending");
            invite.setRequestedAt(Instant.now());
            support.teamStore().saveInvite(invite);
            auditService.audit(
                    team.getId(),
                    userId,
                    "invite.request",
                    support.resolveUserName(userId) + " requested to join");
            List<Long> managerUserIds = support.teamStore().findMembersByTeamId(team.getId()).stream()
                    .filter(member -> TeamRoleSupport.canManageTeam(member.getRole()))
                    .map(member -> member.getUserId())
                    .filter(managerId -> managerId != null && !managerId.equals(userId))
                    .distinct()
                    .toList();
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("teamId", team.getId());
            data.put("name", team.getName() != null ? team.getName() : "");
            data.put("requesterUserId", userId);
            data.put("message", support.resolveUserName(userId));
            outboundNotifySupport.publish(OutboundEventType.TEAM_INVITE_PENDING, data, managerUserIds);
            return new JoinTeamResultDto("pending", null, "Join request submitted for owner approval");
        }

        TeamMemberEntity member = new TeamMemberEntity();
        member.setTeamId(team.getId());
        member.setUserId(userId);
        boolean isCreator = userId.equals(team.getOwnerUserId())
                && support.teamStore().findMembersByTeamId(team.getId()).isEmpty();
        member.setRole(isCreator ? TeamRoleSupport.OWNER : TeamRoleSupport.MEMBER);
        member.setJoinedAt(Instant.now());
        support.teamStore().saveMember(member);
        auditService.audit(
                team.getId(),
                userId,
                "member.join",
                support.resolveUserName(userId) + " joined the team");
        return new JoinTeamResultDto(
                "joined",
                support.toSummary(team, member.getRole()),
                "Joined team successfully");
    }

    public List<TeamMemberDto> listMembers(String teamId) {
        support.requireMember(teamId, support.requireUserId());
        return support.teamStore().findMembersByTeamId(teamId).stream()
                .map(support::toMemberDto)
                .toList();
    }

    public TeamMemberDto updateMemberRole(String teamId, Long targetUserId, UpdateTeamMemberRoleRequest request) {
        Long userId = support.requireUserId();
        TeamMemberEntity actor = support.requireMember(teamId, userId);
        if (!TeamRoleSupport.canAssignRole(actor.getRole())) {
            throw new IllegalArgumentException("Only team owner can change member roles");
        }
        TeamMemberEntity target = support.teamStore().findMember(teamId, targetUserId)
                .orElseThrow(() -> new IllegalArgumentException("Member not found"));
        if (TeamRoleSupport.OWNER.equals(TeamRoleSupport.normalizeRole(target.getRole()))) {
            throw new IllegalArgumentException("Cannot change owner role");
        }
        String nextRole = TeamRoleSupport.normalizeRole(request.role());
        if (!TeamRoleSupport.isAssignableRole(nextRole)) {
            throw new IllegalArgumentException("Invalid role: " + request.role());
        }
        target.setRole(nextRole);
        support.teamStore().saveMember(target);
        auditService.audit(
                teamId,
                userId,
                "member.role",
                "Set " + support.resolveUserName(targetUserId) + " role to " + nextRole);
        return support.toMemberDto(target);
    }

    public List<TeamInviteDto> listPendingInvites(String teamId) {
        Long userId = support.requireUserId();
        TeamMemberEntity actor = support.requireMember(teamId, userId);
        if (!TeamRoleSupport.canManageTeam(actor.getRole())) {
            throw new IllegalArgumentException("Insufficient permission to view invites");
        }
        return support.teamStore().findInvitesByTeamId(teamId).stream()
                .filter(invite -> "pending".equalsIgnoreCase(invite.getStatus()))
                .map(support::toInviteDto)
                .toList();
    }

    public List<TeamJoinRequestDto> listMyJoinRequests() {
        Long userId = support.requireUserId();
        return support.teamStore().findInvitesByUserId(userId).stream()
                .filter(invite -> "pending".equalsIgnoreCase(invite.getStatus()))
                .map(invite -> {
                    String teamName = support.teamStore().findTeamById(invite.getTeamId())
                            .map(team -> team.getName())
                            .orElse(invite.getTeamId());
                    return new TeamJoinRequestDto(
                            invite.getTeamId(),
                            teamName,
                            invite.getStatus(),
                            TeamSupport.formatInstant(invite.getRequestedAt()));
                })
                .toList();
    }

    public TeamSummaryDto approveInvite(String teamId, String inviteId) {
        return resolveInvite(teamId, inviteId, true);
    }

    public TeamSummaryDto rejectInvite(String teamId, String inviteId) {
        resolveInvite(teamId, inviteId, false);
        TeamMemberEntity actor = support.requireMember(teamId, support.requireUserId());
        return support.toSummary(
                support.teamStore().findTeamById(teamId).orElseThrow(),
                actor.getRole());
    }

    public TeamSummaryDto updateTeamSettings(String teamId, UpdateTeamSettingsRequest request) {
        Long userId = support.requireUserId();
        TeamMemberEntity actor = support.requireManager(teamId, userId);
        TeamEntity team = support.requireTeam(teamId);
        if (request.requireInviteApproval() != null) {
            team.setRequireInviteApproval(request.requireInviteApproval());
            support.teamStore().saveTeam(team);
            auditService.audit(teamId, userId, "team.settings",
                    "requireInviteApproval=" + request.requireInviteApproval());
        }
        return support.toSummary(team, actor.getRole());
    }

    private TeamSummaryDto resolveInvite(String teamId, String inviteId, boolean approve) {
        Long userId = support.requireUserId();
        TeamMemberEntity actor = support.requireManager(teamId, userId);
        TeamInviteEntity invite = support.teamStore().findInviteById(inviteId)
                .filter(item -> teamId.equals(item.getTeamId()))
                .orElseThrow(() -> new IllegalArgumentException("Invite not found"));
        if (!"pending".equalsIgnoreCase(invite.getStatus())) {
            throw new IllegalArgumentException("Invite is not pending");
        }
        invite.setStatus(approve ? "approved" : "rejected");
        invite.setResolvedAt(Instant.now());
        invite.setResolvedByUserId(userId);
        support.teamStore().saveInvite(invite);

        if (approve) {
            if (support.teamStore().findMember(teamId, invite.getUserId()).isEmpty()) {
                TeamMemberEntity member = new TeamMemberEntity();
                member.setTeamId(teamId);
                member.setUserId(invite.getUserId());
                member.setRole(TeamRoleSupport.MEMBER);
                member.setJoinedAt(Instant.now());
                support.teamStore().saveMember(member);
            }
            auditService.audit(teamId, userId, "invite.approve",
                    "Approved " + support.resolveUserName(invite.getUserId()));
        } else {
            auditService.audit(teamId, userId, "invite.reject",
                    "Rejected " + support.resolveUserName(invite.getUserId()));
        }
        TeamEntity team = support.teamStore().findTeamById(teamId).orElseThrow();
        return support.toSummary(team, actor.getRole());
    }
}
