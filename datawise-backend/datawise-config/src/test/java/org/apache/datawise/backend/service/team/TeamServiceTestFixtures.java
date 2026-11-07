package org.apache.datawise.backend.service.team;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.FileProjectStore;
import org.apache.datawise.backend.configstore.TeamStore;
import org.apache.datawise.backend.configstore.FileTeamStore;
import org.apache.datawise.backend.model.TeamEntity;
import org.apache.datawise.backend.model.TeamMemberEntity;
import org.apache.datawise.backend.service.UserAccountService;

import org.apache.datawise.backend.service.outbound.OutboundNotifySupport;

import java.nio.file.Path;
import java.time.Instant;
import java.util.UUID;

import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;

final class TeamServiceTestFixtures {

    private TeamServiceTestFixtures() {
    }

    static TeamContext newContext(Path tempDir, UserAccountService userAccountService) {
        ObjectMapper objectMapper = testObjectMapper();
        TeamStore teamStore = new FileTeamStore(new ConfigDirectoryService(tempDir), objectMapper);
        TeamSupport support = new TeamSupport(teamStore, userAccountService);
        OutboundNotifySupport outboundNotifySupport = mock(OutboundNotifySupport.class);
        TeamAuditService auditService = new TeamAuditService(teamStore, support, outboundNotifySupport);
        TeamSharedQueryStreamHub streamHub = new TeamSharedQueryStreamHub();
        return new TeamContext(
                teamStore,
                support,
                auditService,
                new TeamMembershipService(support, auditService, outboundNotifySupport),
                new TeamSharingService(support, auditService, objectMapper, new FileProjectStore(
                        new ConfigDirectoryService(tempDir), objectMapper)),
                new TeamSharedQueryService(support, auditService, streamHub),
                new TeamProductionApprovalService(support, auditService, outboundNotifySupport));
    }

    static void stubUser(UserAccountService userAccountService, long userId, String displayName) {
        lenient().when(userAccountService.requireUserId()).thenReturn(userId);
        lenient().when(userAccountService.resolveUserName(userId)).thenReturn(displayName);
    }

    static TeamEntity seedTeam(TeamStore teamStore, String teamId, String name, long ownerUserId) {
        TeamEntity team = new TeamEntity();
        team.setId(teamId);
        team.setName(name);
        team.setOwnerUserId(ownerUserId);
        team.setInviteCode("invite01");
        team.setRequireInviteApproval(false);
        team.setCreatedAt(Instant.now());
        teamStore.saveTeam(team);
        return team;
    }

    static TeamMemberEntity seedMember(
                                       TeamStore teamStore,
                                       String teamId,
                                       long userId,
                                       String role) {
        TeamMemberEntity member = new TeamMemberEntity();
        member.setTeamId(teamId);
        member.setUserId(userId);
        member.setRole(role);
        member.setJoinedAt(Instant.now());
        teamStore.saveMember(member);
        return member;
    }

    static String uniqueTeamId() {
        return "team-" + UUID.randomUUID().toString().substring(0, 8);
    }

    private static ObjectMapper testObjectMapper() {
        return new ObjectMapper().registerModule(new JavaTimeModule());
    }

    record TeamContext(
            TeamStore teamStore,
            TeamSupport support,
            TeamAuditService auditService,
            TeamMembershipService membership,
            TeamSharingService sharing,
            TeamSharedQueryService sharedQuery,
            TeamProductionApprovalService productionApproval) {
    }
}
