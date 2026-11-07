package org.apache.datawise.backend.service.team;

import org.apache.datawise.backend.domain.RejectTeamProductionApprovalRequest;
import org.apache.datawise.backend.domain.SubmitTeamProductionApprovalRequest;
import org.apache.datawise.backend.model.TeamEntity;
import org.apache.datawise.backend.service.UserAccountService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

@ExtendWith(MockitoExtension.class)
class TeamProductionApprovalServiceTest {

    @TempDir
    Path tempDir;

    @Mock
    private UserAccountService userAccountService;

    @Test
    void submit_allowsTeamManager() {
        TeamServiceTestFixtures.stubUser(userAccountService, 1L, "owner");
        var ctx = TeamServiceTestFixtures.newContext(tempDir, userAccountService);
        String teamId = seedTeamWithSharedConnection(ctx, 1L);

        var summary = ctx.productionApproval().submitProductionApproval(
                teamId,
                new SubmitTeamProductionApprovalRequest("conn-prod", "Prod", "app", "UPDATE t SET x=1"));

        assertEquals(TeamProductionApprovalService.STATUS_PENDING, summary.status());
        assertEquals(1L, summary.requestedByUserId());
    }

    @Test
    void submit_createsPendingForMember() {
        TeamServiceTestFixtures.stubUser(userAccountService, 2L, "alice");
        var ctx = TeamServiceTestFixtures.newContext(tempDir, userAccountService);
        String teamId = seedTeamWithSharedConnection(ctx, 1L);
        TeamServiceTestFixtures.seedMember(ctx.teamStore(), teamId, 2L, "member");

        var summary = ctx.productionApproval().submitProductionApproval(
                teamId,
                new SubmitTeamProductionApprovalRequest("conn-prod", "Prod", "app", "UPDATE t SET x=1"));

        assertEquals(TeamProductionApprovalService.STATUS_PENDING, summary.status());
        assertEquals(2L, summary.requestedByUserId());
    }

    @Test
    void reject_changesStatusToRejected() {
        TeamServiceTestFixtures.stubUser(userAccountService, 1L, "owner");
        var ctx = TeamServiceTestFixtures.newContext(tempDir, userAccountService);
        String teamId = seedTeamWithSharedConnection(ctx, 1L);
        TeamServiceTestFixtures.seedMember(ctx.teamStore(), teamId, 2L, "member");

        TeamServiceTestFixtures.stubUser(userAccountService, 2L, "alice");
        var pending = ctx.productionApproval().submitProductionApproval(
                teamId,
                new SubmitTeamProductionApprovalRequest("conn-prod", "Prod", "app", "DELETE FROM t"));

        TeamServiceTestFixtures.stubUser(userAccountService, 1L, "owner");
        var rejected = ctx.productionApproval().rejectProductionApproval(
                teamId,
                pending.id(),
                new RejectTeamProductionApprovalRequest("too risky"));

        assertEquals(TeamProductionApprovalService.STATUS_REJECTED, rejected.status());
        assertEquals("too risky", rejected.reviewComment());
    }

    private static String seedTeamWithSharedConnection(
                                                       TeamServiceTestFixtures.TeamContext ctx,
                                                       long ownerUserId) {
        String teamId = TeamServiceTestFixtures.uniqueTeamId();
        TeamEntity team = TeamServiceTestFixtures.seedTeam(ctx.teamStore(), teamId, "Ops", ownerUserId);
        team.getSharedConnectionIds().add("conn-prod");
        ctx.teamStore().saveTeam(team);
        TeamServiceTestFixtures.seedMember(ctx.teamStore(), teamId, ownerUserId, "owner");
        return teamId;
    }
}
