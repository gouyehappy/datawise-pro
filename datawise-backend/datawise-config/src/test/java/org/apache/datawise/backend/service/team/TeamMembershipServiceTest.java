package org.apache.datawise.backend.service.team;

import org.apache.datawise.backend.domain.CreateTeamRequest;
import org.apache.datawise.backend.domain.JoinTeamRequest;
import org.apache.datawise.backend.domain.UpdateTeamMemberRoleRequest;
import org.apache.datawise.backend.model.TeamMemberEntity;
import org.apache.datawise.backend.service.UserAccountService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

@ExtendWith(MockitoExtension.class)
class TeamMembershipServiceTest {

    @TempDir
    Path tempDir;

    @Mock
    private UserAccountService userAccountService;

    @Test
    void createTeam_persistsOwnerMember() {
        TeamServiceTestFixtures.stubUser(userAccountService, 1L, "owner");
        var ctx = TeamServiceTestFixtures.newContext(tempDir, userAccountService);

        var summary = ctx.membership().createTeam(new CreateTeamRequest("Platform"));

        assertEquals("Platform", summary.name());
        assertEquals("owner", summary.role());
        assertEquals(1, summary.memberCount());
        assertTrue(ctx.teamStore().findMember(summary.id(), 1L).isPresent());
    }

    @Test
    void joinTeam_rejectsInvalidInviteCode() {
        TeamServiceTestFixtures.stubUser(userAccountService, 2L, "alice");
        var ctx = TeamServiceTestFixtures.newContext(tempDir, userAccountService);

        assertThrows(
                IllegalArgumentException.class,
                () -> ctx.membership().joinTeam(new JoinTeamRequest("bad-code")));
    }

    @Test
    void joinTeam_addsMemberWhenInviteApprovalDisabled() {
        TeamServiceTestFixtures.stubUser(userAccountService, 2L, "alice");
        var ctx = TeamServiceTestFixtures.newContext(tempDir, userAccountService);
        String teamId = TeamServiceTestFixtures.uniqueTeamId();
        TeamServiceTestFixtures.seedTeam(ctx.teamStore(), teamId, "Ops", 1L);
        TeamServiceTestFixtures.seedMember(ctx.teamStore(), teamId, 1L, "owner");

        var result = ctx.membership().joinTeam(new JoinTeamRequest("invite01"));

        assertEquals("joined", result.status());
        assertEquals("member", result.team().role());
        assertTrue(ctx.teamStore().findMember(teamId, 2L).isPresent());
    }

    @Test
    void updateMemberRole_requiresOwner() {
        TeamServiceTestFixtures.stubUser(userAccountService, 2L, "alice");
        var ctx = TeamServiceTestFixtures.newContext(tempDir, userAccountService);
        String teamId = TeamServiceTestFixtures.uniqueTeamId();
        TeamServiceTestFixtures.seedTeam(ctx.teamStore(), teamId, "Ops", 1L);
        TeamServiceTestFixtures.seedMember(ctx.teamStore(), teamId, 1L, "owner");
        TeamServiceTestFixtures.seedMember(ctx.teamStore(), teamId, 2L, "member");
        TeamServiceTestFixtures.seedMember(ctx.teamStore(), teamId, 3L, "member");

        assertThrows(
                IllegalArgumentException.class,
                () -> ctx.membership().updateMemberRole(teamId, 3L, new UpdateTeamMemberRoleRequest("viewer")));
    }

    @Test
    void updateMemberRole_ownerCanAssignViewer() {
        TeamServiceTestFixtures.stubUser(userAccountService, 1L, "owner");
        var ctx = TeamServiceTestFixtures.newContext(tempDir, userAccountService);
        String teamId = TeamServiceTestFixtures.uniqueTeamId();
        TeamServiceTestFixtures.seedTeam(ctx.teamStore(), teamId, "Ops", 1L);
        TeamServiceTestFixtures.seedMember(ctx.teamStore(), teamId, 1L, "owner");
        TeamServiceTestFixtures.seedMember(ctx.teamStore(), teamId, 2L, "member");

        var updated = ctx.membership().updateMemberRole(teamId, 2L, new UpdateTeamMemberRoleRequest("viewer"));

        assertEquals("viewer", updated.role());
        TeamMemberEntity stored = ctx.teamStore().findMember(teamId, 2L).orElseThrow();
        assertEquals("viewer", stored.getRole());
    }
}
