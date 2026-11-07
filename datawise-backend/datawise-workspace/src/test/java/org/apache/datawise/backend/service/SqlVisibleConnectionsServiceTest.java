package org.apache.datawise.backend.service;

import org.apache.datawise.backend.common.support.ConnectionAccessLevel;
import org.apache.datawise.backend.configstore.TeamStore;
import org.apache.datawise.backend.domain.SqlVisibleConnectionDto;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.model.TeamEntity;
import org.apache.datawise.backend.model.TeamMemberEntity;
import org.apache.datawise.backend.security.UserContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SqlVisibleConnectionsServiceTest {

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void listsVisibleConnectionsWithAccessAndSharedFlag() {
        ConnectionVisibilityService visibility = mock(ConnectionVisibilityService.class);
        ConnectionAccessService access = mock(ConnectionAccessService.class);
        TeamStore teamStore = mock(TeamStore.class);

        ConnectionEntity owned = new ConnectionEntity();
        owned.setId("c-own");
        owned.setName("Mine");
        owned.setDbType("mysql");
        owned.setEnv("dev");

        ConnectionEntity shared = new ConnectionEntity();
        shared.setId("c-shared");
        shared.setName("Team Prod");
        shared.setDbType("mysql");
        shared.setEnv("prod");

        when(visibility.visibleCatalogForCurrentUser())
                .thenReturn(new ConnectionVisibilityService.VisibleCatalog(List.of(), List.of(owned, shared)));
        when(access.resolveAccess(9L, "c-own")).thenReturn(ConnectionAccessLevel.DDL);
        when(access.resolveAccess(9L, "c-shared")).thenReturn(ConnectionAccessLevel.READONLY);

        TeamMemberEntity membership = new TeamMemberEntity();
        membership.setTeamId("team-1");
        membership.setUserId(9L);
        TeamEntity team = new TeamEntity();
        team.setId("team-1");
        team.getSharedConnectionIds().add("c-shared");
        when(teamStore.findMembersByUserId(9L)).thenReturn(List.of(membership));
        when(teamStore.findTeamById("team-1")).thenReturn(Optional.of(team));

        UserContext.set(9L, false, "session-1");
        SqlVisibleConnectionsService service =
                new SqlVisibleConnectionsService(visibility, access, teamStore);

        List<SqlVisibleConnectionDto> rows = service.listForCurrentUser();
        assertEquals(2, rows.size());
        assertEquals("ddl", rows.get(0).access());
        assertEquals(false, rows.get(0).shared());
        assertEquals("readonly", rows.get(1).access());
        assertTrue(rows.get(1).shared());
        assertEquals("prod", rows.get(1).env());
    }
}
