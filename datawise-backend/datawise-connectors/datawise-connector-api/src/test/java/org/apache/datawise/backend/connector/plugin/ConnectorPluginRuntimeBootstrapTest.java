package org.apache.datawise.backend.connector.plugin;

import org.apache.datawise.backend.connector.ConnectorPluginContributionHolder;
import org.apache.datawise.backend.connector.ConnectorRegistry;
import org.apache.datawise.backend.connector.hook.SqlExecutionHookRunner;
import org.apache.datawise.backend.connector.jdbc.JdbcConnectorOperations;
import org.apache.datawise.backend.domain.ConnectorPluginLoadStatusDto;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

class ConnectorPluginRuntimeBootstrapTest {

    @TempDir
    Path tempDir;

    @Test
    void bootstrapLoad_movesPhaseToReady() throws Exception {
        ConnectorPluginLoader loader = new ConnectorPluginLoader(tempDir.toString(), "plugins");
        ConnectorRegistry registry = new ConnectorRegistry(List.of());
        ConnectorPluginRuntime runtime = new ConnectorPluginRuntime(
                registry,
                loader,
                List.of(),
                mock(JdbcConnectorOperations.class),
                new ConnectorPluginContributionHolder(),
                new SqlExecutionHookRunner(List.of()));

        ConnectorPluginLoadStatusDto pending = runtime.status();
        assertEquals("PENDING", pending.phase());
        assertTrue(!pending.ready());

        runtime.bootstrapLoad();

        ConnectorPluginLoadStatusDto ready = runtime.status();
        assertEquals("READY", ready.phase());
        assertTrue(ready.ready());
    }
}
