package org.apache.datawise.backend.service.project;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.ConnectionStore;
import org.apache.datawise.backend.configstore.FileProjectStore;
import org.apache.datawise.backend.domain.CreateProjectRequest;
import org.apache.datawise.backend.domain.MoveProjectConnectionsRequest;
import org.apache.datawise.backend.domain.ProjectDeleteModes;
import org.apache.datawise.backend.domain.ProjectDto;
import org.apache.datawise.backend.domain.ProjectIds;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.model.ConnectionGroupEntity;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.UserAccessPolicy;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ProjectServiceDeleteMoveTest {

    @TempDir
    Path tempDir;

    private ProjectService service;
    private ConnectionStore connectionStore;
    private String createdProjectId;

    @BeforeEach
    void setUp() {
        UserContext.set(1L, false, "test-session", TenantIds.DEFAULT);
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(tempDir);
        FileProjectStore projectStore = new FileProjectStore(configDirectory, new ObjectMapper().findAndRegisterModules());
        projectStore.ensureDefaultProject(TenantIds.DEFAULT);
        connectionStore = mock(ConnectionStore.class);
        when(connectionStore.findAllConnections()).thenReturn(new ArrayList<>());
        when(connectionStore.findAllGroups()).thenReturn(new ArrayList<>());
        service = new ProjectService(
                projectStore,
                connectionStore,
                mock(UserAccessPolicy.class),
                configDirectory,
                mock(org.apache.datawise.backend.configstore.TeamStore.class));
        ProjectDto created = service.createProject(new CreateProjectRequest("Pay", null, null, null, null));
        createdProjectId = created.id();
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void emptyOnlyRejectsNonEmptyProject() {
        List<ConnectionEntity> connections = new ArrayList<>();
        ConnectionEntity conn = new ConnectionEntity();
        conn.setId("c1");
        conn.setName("db");
        conn.setProjectId(createdProjectId);
        connections.add(conn);
        when(connectionStore.findAllConnections()).thenReturn(connections);
        when(connectionStore.findAllGroups()).thenReturn(List.of());

        assertThrows(IllegalArgumentException.class,
                () -> service.deleteProject(createdProjectId, ProjectDeleteModes.EMPTY_ONLY, false));
    }

    @Test
    void moveToDefaultThenDelete() {
        List<ConnectionEntity> connections = new ArrayList<>();
        ConnectionEntity conn = new ConnectionEntity();
        conn.setId("c1");
        conn.setName("db");
        conn.setProjectId(createdProjectId);
        connections.add(conn);
        when(connectionStore.findAllConnections()).thenReturn(connections);
        when(connectionStore.findAllGroups()).thenReturn(new ArrayList<>());

        service.deleteProject(createdProjectId, ProjectDeleteModes.MOVE_TO_DEFAULT, false);
        assertEquals(ProjectIds.DEFAULT, conn.getProjectId());
        assertTrue(service.listProjects(true).stream().noneMatch(p -> createdProjectId.equals(p.id())));
    }

    @Test
    void moveConnectionsBetweenProjects() {
        List<ConnectionEntity> connections = new ArrayList<>();
        ConnectionEntity conn = new ConnectionEntity();
        conn.setId("c1");
        conn.setName("db");
        conn.setProjectId(createdProjectId);
        connections.add(conn);
        when(connectionStore.findAllConnections()).thenReturn(connections);
        when(connectionStore.findAllGroups()).thenReturn(List.of());

        int moved = service.moveConnections(
                createdProjectId,
                new MoveProjectConnectionsRequest(List.of("c1"), ProjectIds.DEFAULT));
        assertEquals(1, moved);
        assertEquals(ProjectIds.DEFAULT, conn.getProjectId());
    }
}
