package org.apache.datawise.backend.controller.workspace.support;

import org.apache.datawise.backend.database.explorer.ExplorerSchemaService;
import org.apache.datawise.backend.domain.SaveInstanceSqlRequest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.slf4j.Logger;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class InstanceSqlTreeSyncSupportTest {

    @Mock
    private ExplorerSchemaService schemaService;

    @Mock
    private Logger log;

    @Test
    void resolveInstanceName_prefersInstanceName() {
        SaveInstanceSqlRequest request = new SaveInstanceSqlRequest(
                "conn-1",
                "inst-id",
                "my-instance",
                "SELECT 1",
                "console.sql"
        );
        org.junit.jupiter.api.Assertions.assertEquals("my-instance", InstanceSqlTreeSyncSupport.resolveInstanceName(request));
    }

    @Test
    void resolveInstanceName_fallsBackToInstanceId() {
        SaveInstanceSqlRequest request = new SaveInstanceSqlRequest(
                "conn-1",
                "inst-id",
                null,
                "SELECT 1",
                "console.sql"
        );
        org.junit.jupiter.api.Assertions.assertEquals("inst-id", InstanceSqlTreeSyncSupport.resolveInstanceName(request));
    }

    @Test
    void syncExplorerTree_skipsBlankInstanceName() throws Exception {
        InstanceSqlTreeSyncSupport.syncExplorerTree(schemaService, log, "conn-1", "  ", "test-op");
        verify(schemaService, never()).syncWorkspacesInCache(eq("conn-1"), eq(""));
    }

    @Test
    void syncExplorerTree_callsExplorerOnValidInstance() throws Exception {
        InstanceSqlTreeSyncSupport.syncExplorerTree(schemaService, log, "conn-1", " db1 ", "test-op");
        verify(schemaService).syncWorkspacesInCache("conn-1", "db1");
    }

    @Test
    void syncExplorerTree_swallowsSyncFailure() throws Exception {
        doThrow(new RuntimeException("cache unavailable"))
                .when(schemaService)
                .syncWorkspacesInCache("conn-1", "db1");
        InstanceSqlTreeSyncSupport.syncExplorerTree(schemaService, log, "conn-1", "db1", "test-op");
        verify(log).warn(
                eq("{} tree sync skipped connectionId={} instanceName={}: {}"),
                eq("test-op"),
                eq("conn-1"),
                eq("db1"),
                eq("cache unavailable")
        );
    }
}
