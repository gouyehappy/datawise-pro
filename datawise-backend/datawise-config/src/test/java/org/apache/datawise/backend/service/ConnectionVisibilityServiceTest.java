package org.apache.datawise.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.common.UnauthorizedException;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.ConnectionStore;
import org.apache.datawise.backend.configstore.FileConnectionStore;
import org.apache.datawise.backend.configstore.SessionEphemeralCatalogStore;
import org.apache.datawise.backend.configstore.TeamStore;
import org.apache.datawise.backend.configstore.FileTeamStore;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.model.ConnectionGroupEntity;
import org.apache.datawise.backend.model.TeamEntity;
import org.apache.datawise.backend.model.TeamMemberEntity;
import org.apache.datawise.backend.domain.ProjectIds;
import org.apache.datawise.backend.security.SecretTestSupport;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.project.ProjectService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ConnectionVisibilityServiceTest {

    @TempDir
    Path tempDir;

    @AfterEach
    void tearDown() {
        UserContext.clear();
        org.apache.datawise.backend.domain.ProjectRequestContext.clear();
    }

    @Test
    void registeredUserSeesOwnedLegacyAndTeamSharedConnections() {
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(tempDir);
        ObjectMapper objectMapper = new ObjectMapper();
        ConnectionStore store = new FileConnectionStore(configDirectory, objectMapper, SecretTestSupport.testCodec());
        TeamStore teamStore = new FileTeamStore(configDirectory, objectMapper);
        SessionEphemeralCatalogStore ephemeralStore = new SessionEphemeralCatalogStore();
        ConnectionVisibilityService service = new ConnectionVisibilityService(
                store, ephemeralStore, teamStore, mockProjectService());

        ConnectionGroupEntity group = new ConnectionGroupEntity();
        group.setId("group-1");
        group.setLabel("Shared");
        group.setSortOrder(0);
        group.setExpanded(true);
        store.saveGroup(group);

        ConnectionEntity owned = connection("conn-owned", 2L);
        ConnectionEntity legacy = connection("conn-legacy", null);
        ConnectionEntity foreign = connection("conn-foreign", 99L);
        ConnectionEntity teamShared = connection("conn-team", 5L);
        store.saveConnection(owned);
        store.saveConnection(legacy);
        store.saveConnection(foreign);
        store.saveConnection(teamShared);

        TeamEntity team = new TeamEntity();
        team.setId("team-1");
        team.setName("Ops");
        team.setOwnerUserId(5L);
        team.getSharedConnectionIds().add("conn-team");
        teamStore.saveTeam(team);
        TeamMemberEntity member = new TeamMemberEntity();
        member.setTeamId("team-1");
        member.setUserId(2L);
        member.setRole("member");
        teamStore.saveMember(member);

        UserContext.set(2L, false, "session-user");
        ConnectionVisibilityService.VisibleCatalog visible = service.visibleCatalogForCurrentUser();

        assertEquals(3, visible.connections().size());
        assertTrue(visible.connections().stream().anyMatch(item -> "conn-owned".equals(item.getId())));
        assertTrue(visible.connections().stream().anyMatch(item -> "conn-legacy".equals(item.getId())));
        assertTrue(visible.connections().stream().anyMatch(item -> "conn-team".equals(item.getId())));
        assertFalse(visible.connections().stream().anyMatch(item -> "conn-foreign".equals(item.getId())));
    }

    @Test
    void legacyConnectionsAreVisibleButNotMutableByRegisteredUsers() {
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(tempDir);
        ObjectMapper objectMapper = new ObjectMapper();
        ConnectionStore store = new FileConnectionStore(configDirectory, objectMapper, SecretTestSupport.testCodec());
        ConnectionVisibilityService service = new ConnectionVisibilityService(
                store,
                new SessionEphemeralCatalogStore(),
                new FileTeamStore(configDirectory, objectMapper),
                mockProjectService());
        saveDefaultGroup(store);

        ConnectionEntity legacy = connection("conn-legacy", null);
        store.saveConnection(legacy);

        UserContext.set(2L, false, "session-user");
        assertTrue(service.visibleCatalogForCurrentUser().connections().stream()
                .anyMatch(item -> "conn-legacy".equals(item.getId())));
        assertFalse(service.canMutateConnection(2L, "conn-legacy"));
    }

    @Test
    void ownedConnectionsRemainMutableByOwner() {
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(tempDir);
        ObjectMapper objectMapper = new ObjectMapper();
        ConnectionStore store = new FileConnectionStore(configDirectory, objectMapper, SecretTestSupport.testCodec());
        ConnectionVisibilityService service = new ConnectionVisibilityService(
                store,
                new SessionEphemeralCatalogStore(),
                new FileTeamStore(configDirectory, objectMapper),
                mockProjectService());
        saveDefaultGroup(store);

        ConnectionEntity owned = connection("conn-owned", 2L);
        store.saveConnection(owned);

        UserContext.set(2L, false, "session-user");
        assertTrue(service.canMutateConnection(2L, "conn-owned"));
    }

    @Test
    void guestDefaultGroupIdRequiresSessionId() {
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(tempDir);
        ConnectionVisibilityService service = new ConnectionVisibilityService(
                new FileConnectionStore(configDirectory, new ObjectMapper(), SecretTestSupport.testCodec()),
                new SessionEphemeralCatalogStore(),
                new FileTeamStore(configDirectory, new ObjectMapper()),
                mockProjectService());

        UserContext.set(3L, true, null);

        UnauthorizedException ex = assertThrows(
                UnauthorizedException.class,
                service::defaultGroupIdForCurrentUser);
        assertEquals(UnauthorizedException.CODE, ex.getMessage());
    }

    @Test
    void guestUsesEphemeralCatalogOnly(@TempDir Path guestDir) {
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(guestDir);
        ObjectMapper objectMapper = new ObjectMapper();
        SessionEphemeralCatalogStore ephemeralStore = new SessionEphemeralCatalogStore();
        ConnectionVisibilityService service = new ConnectionVisibilityService(
                new FileConnectionStore(configDirectory, objectMapper, SecretTestSupport.testCodec()),
                ephemeralStore,
                new FileTeamStore(configDirectory, objectMapper),
                mockProjectService());

        UserContext.set(3L, true, "session-guest");
        String groupId = ephemeralStore.ensureDefaultGroupId("session-guest");
        ConnectionEntity guestConn = connection("conn-guest", 3L);
        guestConn.setGroupId(groupId);
        ephemeralStore.saveConnection("session-guest", guestConn);

        ConnectionVisibilityService.VisibleCatalog visible = service.visibleCatalogForCurrentUser();
        assertEquals(1, visible.connections().size());
        assertEquals("conn-guest", visible.connections().get(0).getId());
    }

    @Test
    void resolveConnectionEntityRespectsActiveProjectUnlessScopeAll() {
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(tempDir);
        ObjectMapper objectMapper = new ObjectMapper();
        ConnectionStore store = new FileConnectionStore(configDirectory, objectMapper, SecretTestSupport.testCodec());
        ConnectionVisibilityService service = new ConnectionVisibilityService(
                store,
                new SessionEphemeralCatalogStore(),
                new FileTeamStore(configDirectory, objectMapper),
                mockProjectService());
        saveDefaultGroup(store);

        ConnectionEntity inDefault = connection("conn-default", 2L);
        inDefault.setProjectId(ProjectIds.DEFAULT);
        ConnectionEntity inOther = connection("conn-other", 2L);
        inOther.setProjectId("proj_other");
        store.saveConnection(inDefault);
        store.saveConnection(inOther);

        UserContext.set(2L, false, "session-user");
        assertTrue(service.resolveConnectionEntity("conn-default").isPresent());
        assertTrue(service.resolveConnectionEntity("conn-other").isEmpty());

        org.apache.datawise.backend.domain.ProjectRequestContext.set(null, true);
        assertTrue(service.resolveConnectionEntity("conn-other").isPresent());
    }

    private static ProjectService mockProjectService() {
        ProjectService projectService = mock(ProjectService.class);
        when(projectService.resolveActiveProjectId()).thenReturn(ProjectIds.DEFAULT);
        return projectService;
    }

    private static void saveDefaultGroup(ConnectionStore store) {
        ConnectionGroupEntity group = new ConnectionGroupEntity();
        group.setId("group-1");
        group.setLabel("Default");
        group.setSortOrder(0);
        group.setExpanded(true);
        store.saveGroup(group);
    }

    private static ConnectionEntity connection(String id, Long userId) {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setId(id);
        entity.setGroupId("group-1");
        entity.setUserId(userId);
        entity.setName(id);
        entity.setDbType("mysql");
        entity.setSortOrder(0);
        return entity;
    }
}
