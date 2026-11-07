package org.apache.datawise.backend.connector.support;

import org.apache.datawise.backend.connector.ConnectorCapability;
import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.jdbc.AbstractJdbcDataSourceConnector;
import org.apache.datawise.backend.connector.spi.ConnectorJdbcOperations;
import org.apache.datawise.backend.ops.DatabaseOpsRegistry;
import org.junit.jupiter.api.Test;

import java.util.EnumSet;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ConnectorCapabilityCatalogTest {

    @Test
    void jdbcConnectorIncludesSqlExplainAndOpsAugmentations() {
        DatabaseOpsRegistry ops = mock(DatabaseOpsRegistry.class);
        when(ops.supportsActiveSession("mysql")).thenReturn(true);
        when(ops.supportsSessionKill("mysql")).thenReturn(true);
        when(ops.supportsLockWait("mysql")).thenReturn(true);

        EnumSet<ConnectorCapability> caps = ConnectorCapabilityCatalog.resolve(
                new FakeJdbcConnector(Set.of("mysql")),
                "mysql",
                ops);

        assertTrue(caps.contains(ConnectorCapability.SQL_EXPLAIN));
        assertTrue(caps.contains(ConnectorCapability.SESSION_MONITOR));
        assertTrue(caps.contains(ConnectorCapability.SESSION_KILL));
        assertTrue(caps.contains(ConnectorCapability.LOCK_MONITOR));
        assertTrue(caps.contains(ConnectorCapability.ONLINE_DDL));
        assertTrue(caps.contains(ConnectorCapability.SSH_TUNNEL));
    }

    @Test
    void redisConnectorHasNoSqlExplainOrSessionOps() {
        EnumSet<ConnectorCapability> caps = EnumSet.of(
                ConnectorCapability.CONNECTION_TEST,
                ConnectorCapability.CATALOG,
                ConnectorCapability.KEY_VALUE);

        DataSourceConnector connector = mock(DataSourceConnector.class);
        when(connector.capabilities()).thenReturn(caps);

        DatabaseOpsRegistry ops = mock(DatabaseOpsRegistry.class);
        when(ops.supportsActiveSession("redis")).thenReturn(false);
        when(ops.supportsSessionKill("redis")).thenReturn(false);
        when(ops.supportsLockWait("redis")).thenReturn(false);

        EnumSet<ConnectorCapability> resolved = ConnectorCapabilityCatalog.resolve(
                connector,
                "redis",
                ops);

        assertFalse(resolved.contains(ConnectorCapability.SQL_EXPLAIN));
        assertFalse(resolved.contains(ConnectorCapability.SESSION_MONITOR));
        assertFalse(resolved.contains(ConnectorCapability.ONLINE_DDL));
    }

    private static final class FakeJdbcConnector extends AbstractJdbcDataSourceConnector {

        FakeJdbcConnector(Set<String> supportedDbTypes) {
            super("fake-jdbc", supportedDbTypes, mock(ConnectorJdbcOperations.class));
        }
    }
}
