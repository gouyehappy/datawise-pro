package org.apache.datawise.backend.service.team;

import org.apache.datawise.backend.domain.ShareTeamSharedQueryRequest;
import org.apache.datawise.backend.domain.UpdateTeamSharedQueryRequest;
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
import static org.junit.jupiter.api.Assertions.assertTrue;

@ExtendWith(MockitoExtension.class)
class TeamSharedQueryServiceTest {

    @TempDir
    Path tempDir;

    @Mock
    private UserAccountService userAccountService;

    @Test
    void shareQuery_andToggleFavorite() {
        TeamServiceTestFixtures.stubUser(userAccountService, 2L, "alice");
        var ctx = TeamServiceTestFixtures.newContext(tempDir, userAccountService);
        String teamId = TeamServiceTestFixtures.uniqueTeamId();
        TeamServiceTestFixtures.seedTeam(ctx.teamStore(), teamId, "Ops", 1L);
        TeamServiceTestFixtures.seedMember(ctx.teamStore(), teamId, 2L, "member");

        var created = ctx.sharedQuery().shareQuery(
                teamId,
                new ShareTeamSharedQueryRequest(
                        "Daily report",
                        "desc",
                        "conn-1",
                        "Prod",
                        "app",
                        "SELECT 1",
                        List.of("report")));
        assertEquals("Daily report", created.title());
        assertTrue(!created.starredByCurrentUser());

        var favorited = ctx.sharedQuery().toggleSharedQueryFavorite(teamId, created.id());
        assertTrue(favorited.starredByCurrentUser());
        assertEquals(1, favorited.favoriteCount());
    }

    @Test
    void updateSharedQuery_deniesNonOwnerMember() {
        var ctx = TeamServiceTestFixtures.newContext(tempDir, userAccountService);
        String teamId = TeamServiceTestFixtures.uniqueTeamId();
        TeamServiceTestFixtures.seedTeam(ctx.teamStore(), teamId, "Ops", 1L);
        TeamServiceTestFixtures.seedMember(ctx.teamStore(), teamId, 2L, "member");
        TeamServiceTestFixtures.seedMember(ctx.teamStore(), teamId, 3L, "member");

        TeamServiceTestFixtures.stubUser(userAccountService, 2L, "alice");
        var created = ctx.sharedQuery().shareQuery(
                teamId,
                new ShareTeamSharedQueryRequest(
                        "Owner query",
                        null,
                        null,
                        null,
                        null,
                        "SELECT 1",
                        List.of()));

        TeamServiceTestFixtures.stubUser(userAccountService, 3L, "bob");
        assertThrows(
                IllegalArgumentException.class,
                () -> ctx.sharedQuery().updateSharedQuery(
                        teamId,
                        created.id(),
                        new UpdateTeamSharedQueryRequest(
                                "Hijacked",
                                null,
                                null,
                                null,
                                null,
                                "SELECT 2",
                                List.of(),
                                null)));
    }

    @Test
    void updateSharedQuery_rejectsStaleExpectedUpdatedAt() {
        TeamServiceTestFixtures.stubUser(userAccountService, 2L, "alice");
        var ctx = TeamServiceTestFixtures.newContext(tempDir, userAccountService);
        String teamId = TeamServiceTestFixtures.uniqueTeamId();
        TeamServiceTestFixtures.seedTeam(ctx.teamStore(), teamId, "Ops", 1L);
        TeamServiceTestFixtures.seedMember(ctx.teamStore(), teamId, 2L, "member");

        var created = ctx.sharedQuery().shareQuery(
                teamId,
                new ShareTeamSharedQueryRequest(
                        "Owner query",
                        null,
                        null,
                        null,
                        null,
                        "SELECT 1",
                        List.of()));

        assertThrows(
                IllegalArgumentException.class,
                () -> ctx.sharedQuery().updateSharedQuery(
                        teamId,
                        created.id(),
                        new UpdateTeamSharedQueryRequest(
                                "Owner query v2",
                                null,
                                null,
                                null,
                                null,
                                "SELECT 2",
                                List.of(),
                                "1970-01-01T00:00:00Z")));
    }
}
