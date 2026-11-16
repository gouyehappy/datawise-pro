package org.apache.datawise.backend.service.team;

import org.apache.datawise.backend.common.DatawiseErrorCodes;
import org.apache.datawise.backend.domain.UpdateOnCallConnectionsRequest;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.model.TeamEntity;
import org.apache.datawise.backend.service.UserAccountService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;

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
        TeamServiceTestFixtures.seedOwnedConnection(ctx.connectionStore(), "conn-a", 1L);

        var summary = ctx.sharing().updateSharedConnections(teamId, List.of("conn-a"));

        assertEquals(List.of("conn-a"), summary.sharedConnectionIds());
        assertEquals(List.of("conn-a"), summary.onCallConnectionIds());
    }

    @Test
    void updateSharedConnections_rejectsUnknownConnection() {
        TeamServiceTestFixtures.stubUser(userAccountService, 1L, "owner");
        var ctx = TeamServiceTestFixtures.newContext(tempDir, userAccountService);
        String teamId = TeamServiceTestFixtures.uniqueTeamId();
        TeamServiceTestFixtures.seedTeam(ctx.teamStore(), teamId, "Ops", 1L);
        TeamServiceTestFixtures.seedMember(ctx.teamStore(), teamId, 1L, "owner");

        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> ctx.sharing().updateSharedConnections(teamId, List.of("missing-conn")));
        assertEquals(DatawiseErrorCodes.CONNECTION_SHARE_NOT_FOUND, ex.getMessage());
    }

    @Test
    void updateSharedConnections_rejectsForeignOwnedConnection() {
        TeamServiceTestFixtures.stubUser(userAccountService, 1L, "owner");
        var ctx = TeamServiceTestFixtures.newContext(tempDir, userAccountService);
        String teamId = TeamServiceTestFixtures.uniqueTeamId();
        TeamServiceTestFixtures.seedTeam(ctx.teamStore(), teamId, "Ops", 1L);
        TeamServiceTestFixtures.seedMember(ctx.teamStore(), teamId, 1L, "owner");
        TeamServiceTestFixtures.seedOwnedConnection(ctx.connectionStore(), "bob-conn", 99L);

        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> ctx.sharing().updateSharedConnections(teamId, List.of("bob-conn")));
        assertEquals(DatawiseErrorCodes.CONNECTION_SHARE_FORBIDDEN, ex.getMessage());
    }

    @Test
    void updateSharedConnections_rejectsUnownedLegacyConnection() {
        TeamServiceTestFixtures.stubUser(userAccountService, 1L, "owner");
        var ctx = TeamServiceTestFixtures.newContext(tempDir, userAccountService);
        String teamId = TeamServiceTestFixtures.uniqueTeamId();
        TeamServiceTestFixtures.seedTeam(ctx.teamStore(), teamId, "Ops", 1L);
        TeamServiceTestFixtures.seedMember(ctx.teamStore(), teamId, 1L, "owner");
        ConnectionEntity legacy = new ConnectionEntity();
        legacy.setId("legacy-conn");
        legacy.setUserId(null);
        legacy.setName("legacy");
        legacy.setDbType("mysql");
        ctx.connectionStore().put(legacy);

        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> ctx.sharing().updateSharedConnections(teamId, List.of("legacy-conn")));
        assertEquals(DatawiseErrorCodes.CONNECTION_SHARE_FORBIDDEN, ex.getMessage());
    }

    @Test
    void updateSharedConnections_allowsOwnedConnectionAndPersistsDdlAccess() {
        TeamServiceTestFixtures.stubUser(userAccountService, 1L, "owner");
        var ctx = TeamServiceTestFixtures.newContext(tempDir, userAccountService);
        String teamId = TeamServiceTestFixtures.uniqueTeamId();
        TeamServiceTestFixtures.seedTeam(ctx.teamStore(), teamId, "Ops", 1L);
        TeamServiceTestFixtures.seedMember(ctx.teamStore(), teamId, 1L, "owner");
        TeamServiceTestFixtures.seedOwnedConnection(ctx.connectionStore(), "mine", 1L);

        var summary = ctx.sharing().updateSharedConnections(
                teamId,
                List.of("mine"),
                Map.of("mine", "ddl"));

        assertEquals(List.of("mine"), summary.sharedConnectionIds());
        assertEquals("ddl", summary.sharedConnectionAccess().get("mine"));
    }

    @Test
    void updateSharedConnections_keepsAlreadySharedWithoutReowning() {
        TeamServiceTestFixtures.stubUser(userAccountService, 2L, "admin");
        var ctx = TeamServiceTestFixtures.newContext(tempDir, userAccountService);
        String teamId = TeamServiceTestFixtures.uniqueTeamId();
        TeamEntity team = TeamServiceTestFixtures.seedTeam(ctx.teamStore(), teamId, "Ops", 1L);
        team.getSharedConnectionIds().add("owner-conn");
        ctx.teamStore().saveTeam(team);
        TeamServiceTestFixtures.seedMember(ctx.teamStore(), teamId, 2L, "admin");
        TeamServiceTestFixtures.seedOwnedConnection(ctx.connectionStore(), "owner-conn", 1L);

        var summary = ctx.sharing().updateSharedConnections(
                teamId,
                List.of("owner-conn"),
                Map.of("owner-conn", "readonly"));

        assertEquals(List.of("owner-conn"), summary.sharedConnectionIds());
    }
}
