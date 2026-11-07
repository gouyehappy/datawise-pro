package org.apache.datawise.backend.database.runtime;

import org.apache.datawise.backend.database.explorer.ExplorerSchemaSessionPool;
import org.apache.datawise.backend.jdbc.support.JdbcDriverConnectionFactory;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.mockito.Mockito.inOrder;

@ExtendWith(MockitoExtension.class)
class DefaultConnectionRuntimeCleanupTest {

    @Mock
    private JdbcDriverConnectionFactory jdbcDriverConnectionFactory;
    @Mock
    private ExplorerSchemaSessionPool schemaSessionPool;

    @Test
    void onSessionCleanup_invalidatesSchemaSessionBeforeEvictingPool() {
        DefaultConnectionRuntimeCleanup cleanup = new DefaultConnectionRuntimeCleanup(
                jdbcDriverConnectionFactory,
                schemaSessionPool
        );

        cleanup.onSessionCleanup("session-1", true, List.of("conn-a", "conn-b"));

        InOrder order = inOrder(schemaSessionPool, jdbcDriverConnectionFactory);
        order.verify(schemaSessionPool).invalidate("conn-a");
        order.verify(jdbcDriverConnectionFactory).evictPool("conn-a");
        order.verify(schemaSessionPool).invalidate("conn-b");
        order.verify(jdbcDriverConnectionFactory).evictPool("conn-b");
    }
}
