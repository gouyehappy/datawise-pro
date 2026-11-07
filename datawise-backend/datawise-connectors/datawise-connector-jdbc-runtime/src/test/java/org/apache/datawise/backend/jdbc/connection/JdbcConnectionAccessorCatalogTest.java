package org.apache.datawise.backend.jdbc.connection;

import org.junit.jupiter.api.Test;

import java.sql.Connection;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class JdbcConnectionAccessorCatalogTest {

    @Test
    void catalogAlreadyApplied_mysqlSkipsWhenCatalogMatches() throws Exception {
        Connection connection = mock(Connection.class);
        when(connection.getCatalog()).thenReturn("shop");

        assertTrue(JdbcConnectionAccessor.catalogAlreadyApplied(connection, "mysql", "shop"));
    }

    @Test
    void catalogAlreadyApplied_mysqlDetectsCatalogChange() throws Exception {
        Connection connection = mock(Connection.class);
        when(connection.getCatalog()).thenReturn("shop");

        assertFalse(JdbcConnectionAccessor.catalogAlreadyApplied(connection, "mysql", "warehouse"));
    }

    @Test
    void catalogAlreadyApplied_postgresqlUsesSchema() throws Exception {
        Connection connection = mock(Connection.class);
        when(connection.getSchema()).thenReturn("public");

        assertTrue(JdbcConnectionAccessor.catalogAlreadyApplied(connection, "postgresql", "public"));
    }

    @Test
    void applyCatalog_skipsSetCatalogWhenAlreadyApplied() throws Exception {
        JdbcConnectionAccessor accessor = new JdbcConnectionAccessor(
                mock(org.apache.datawise.backend.jdbc.support.JdbcDriverConnectionFactory.class),
                mock(ConnectionActivityRegistry.class)
        );
        Connection connection = mock(Connection.class);
        when(connection.isClosed()).thenReturn(false);
        when(connection.getCatalog()).thenReturn("shop");

        accessor.applyCatalog(connection, "mysql", "shop");

        verify(connection).isClosed();
        verify(connection).getCatalog();
        verify(connection, org.mockito.Mockito.never()).setCatalog(org.mockito.ArgumentMatchers.anyString());
    }
}
