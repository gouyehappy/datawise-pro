package org.apache.datawise.backend.platform.schedule;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.apache.datawise.backend.domain.TeamSharedQueryDetailDto;
import org.apache.datawise.backend.service.InstanceWorkspaceService;
import org.apache.datawise.backend.service.TeamService;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ScheduledSqlPayloadSupportTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void resolvesWorkspaceFileAndSplitsStatements() throws Exception {
        InstanceWorkspaceService workspace = mock(InstanceWorkspaceService.class);
        when(workspace.readSql("c1", "app", "job.sql")).thenReturn("SELECT 1; SELECT 2;");
        ObjectNode payload = mapper.createObjectNode();
        payload.put("source", "workspace_file");
        payload.put("connectionId", "c1");
        payload.put("database", "app");
        payload.put("sqlFile", "job.sql");

        ScheduledSqlPayloadSupport.ResolvedSql resolved =
                ScheduledSqlPayloadSupport.resolve(payload, workspace, mock(TeamService.class));
        List<String> statements = ScheduledSqlPayloadSupport.splitExecutableStatements(resolved.sql());

        assertEquals("workspace_file", resolved.source());
        assertEquals(2, statements.size());
        assertTrue(statements.get(0).startsWith("SELECT 1"));
    }

    @Test
    void resolvesQueryLibraryUsingSharedQueryDefaults() throws Exception {
        TeamService teamService = mock(TeamService.class);
        when(teamService.getSharedQuery("t1", "q1")).thenReturn(new TeamSharedQueryDetailDto(
                "q1",
                "t1",
                "Nightly",
                null,
                "conn-shared",
                "Shared",
                "sales",
                "SELECT 42",
                List.of(),
                null,
                null,
                null,
                null,
                0,
                false,
                List.of()
        ));
        ObjectNode payload = mapper.createObjectNode();
        payload.put("source", "query_library");
        payload.put("teamId", "t1");
        payload.put("queryId", "q1");

        ScheduledSqlPayloadSupport.ResolvedSql resolved =
                ScheduledSqlPayloadSupport.resolve(payload, mock(InstanceWorkspaceService.class), teamService);

        assertEquals("query_library", resolved.source());
        assertEquals("conn-shared", resolved.connectionId());
        assertEquals("sales", resolved.database());
        assertEquals("SELECT 42", resolved.sql());
    }

    @Test
    void infersWorkspaceFileSourceFromSqlFileField() throws Exception {
        InstanceWorkspaceService workspace = mock(InstanceWorkspaceService.class);
        when(workspace.readSql("c1", "app", "a.sql")).thenReturn("SELECT 1");
        ObjectNode payload = mapper.createObjectNode();
        payload.put("connectionId", "c1");
        payload.put("database", "app");
        payload.put("sqlFile", "a.sql");

        ScheduledSqlPayloadSupport.ResolvedSql resolved =
                ScheduledSqlPayloadSupport.resolve(payload, workspace, mock(TeamService.class));

        assertEquals("workspace_file", resolved.source());
    }
}
