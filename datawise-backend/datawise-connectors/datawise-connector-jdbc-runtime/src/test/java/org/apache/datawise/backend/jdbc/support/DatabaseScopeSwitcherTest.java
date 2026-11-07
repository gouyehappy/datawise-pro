package org.apache.datawise.backend.jdbc.support;

import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DatabaseScopeSwitcherTest {

    @Test
    void applySqlServerUsesCatalogAndSchema() throws SQLException {
        Connection connection = mock(Connection.class);
        Statement statement = mock(Statement.class);
        when(connection.isClosed()).thenReturn(false);
        when(connection.getCatalog()).thenReturn("master");
        when(connection.createStatement()).thenReturn(statement);

        DatabaseScopeSwitcher.apply(connection, "sqlserver", "mydb.dbo");

        verify(statement).execute("USE [mydb]");
        verify(connection).setSchema("dbo");
    }

    @Test
    void applyTrinoUsesJdbcCatalogAndSchema() throws SQLException {
        Connection connection = mock(Connection.class);
        when(connection.isClosed()).thenReturn(false);
        when(connection.getCatalog()).thenReturn("");

        DatabaseScopeSwitcher.apply(connection, "trino", "hive.default");

        verify(connection).setCatalog("hive");
        verify(connection).setSchema("default");
    }

    @Test
    void isAlreadyAppliedMatchesCatalogSchemaScope() throws SQLException {
        Connection connection = mock(Connection.class);
        when(connection.getCatalog()).thenReturn("mydb");
        when(connection.getSchema()).thenReturn("dbo");

        assertTrue(DatabaseScopeSwitcher.isAlreadyApplied(connection, "sqlserver", "mydb.dbo"));
        assertFalse(DatabaseScopeSwitcher.isAlreadyApplied(connection, "sqlserver", "mydb.sales"));
    }
}
