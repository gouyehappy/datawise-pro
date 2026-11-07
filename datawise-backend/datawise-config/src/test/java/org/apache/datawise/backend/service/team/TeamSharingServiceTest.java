package org.apache.datawise.backend.service.team;

import org.apache.datawise.backend.domain.UpdateOnCallConnectionsRequest;
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
import static org.junit.jupiter.api.Assertions.assertThrows;

@ExtendWith(MockitoExtension.class)
class TeamSharingServiceTest {

    @TempDir
    Path tempDir;

    @Mock
    private UserAccountService userAccountService;

    @Test
    void updateOnCallConnections_requiresSharedConnection() {
        TeamServiceTestFixtures.stubUser(userAccountService, 1L, "owner");
        var ctx = TeamServiceTestFixtures.newContext(tempDir, userAccountService);
        String teamId = TeamServiceTestFixtures.uniqueTeamId();
        TeamServiceTestFixtures.seedTeam(ctx.teamStore(), teamId, "Ops", 1L);
        TeamServiceTestFixtures.seedMember(ctx.teamStore(), teamId, 1L, "owner");

        assertThrows(
                IllegalArgumentException.class,
                () -> ctx.sharing().updateOnCallConnections(
                        teamId,
                        new UpdateOnCallConnectionsRequest(List.of("conn-not-shared"))));
    }

    @Test
    void updateOnCallConnections_persistsSharedIds() {
        TeamServiceTestFixtures.stubUser(userAccountService, 1L, "owner");
        var ctx = TeamServiceTestFixtures.newContext(tempDir, userAccountService);
        String teamId = TeamServiceTestFixtures.uniqueTeamId();
        TeamEntity team = TeamServiceTestFixtures.seedTeam(ctx.teamStore(), teamId, "Ops", 1L);
        team.getSharedConnectionIds().add("conn-a");
        team.getSharedConnectionIds().add("conn-b");
        ctx.teamStore().saveTeam(team);
        TeamServiceTestFixtures.seedMember(ctx.teamStore(), teamId, 1L, "owner");

        var summary = ctx.sharing().updateOnCallConnections(
                teamId,
                new UpdateOnCallConnectionsRequest(List.of("conn-b", "conn-a")));

        assertEquals(List.of("conn-b", "conn-a"), summary.onCallConnectionIds());
    }

    @Test
    void updateSharedConnections_prunesOnCallWhenConnectionRemoved() {
        TeamServiceTestFixtures.stubUser(userAccountService, 1L, "owner");
        var ctx = TeamServiceTestFixtures.newContext(tempDir, userAccountService);
        String teamId = TeamServiceTestFixtures.uniqueTeamId();
        TeamEntity team = TeamServiceTestFixtures.seedTeam(ctx.teamStore(), teamId, "Ops", 1L);
        team.getSharedConnectionIds().addAll(List.of("conn-a", "conn-b"));
        team.setOnCallConnectionIds(new java.util.ArrayList<>(List.of("conn-a", "conn-b")));
        ctx.teamStore().saveTeam(team);
        TeamServiceTestFixtures.seedMember(ctx.teamStore(), teamId, 1L, "owner");

        var summary = ctx.sharing().updateSharedConnections(teamId, List.of("conn-a"));

        assertEquals(List.of("conn-a"), summary.sharedConnectionIds());
        assertEquals(List.of("conn-a"), summary.onCallConnectionIds());
    }
}
