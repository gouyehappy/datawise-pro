package org.apache.datawise.backend.jdbc.support;

import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SqlServerCatalogSupportTest {

    @Test
    void qualifyTable_usesResolvedSchemaInThreePartName() throws Exception {
        Connection raw = mock(Connection.class);
        Statement useStatement = mock(Statement.class);
        ResultSet dbNameRs = mock(ResultSet.class);
        PreparedStatement ps = mock(PreparedStatement.class);
        ResultSet rs = mock(ResultSet.class);
        when(raw.getCatalog()).thenReturn("master");
        when(raw.createStatement()).thenReturn(useStatement);
        when(useStatement.executeQuery("SELECT DB_NAME()")).thenReturn(dbNameRs);
        when(dbNameRs.next()).thenReturn(true, false);
        when(dbNameRs.getString(1)).thenReturn("master");
        when(raw.prepareStatement(contains("sys.objects"))).thenReturn(ps);
        when(ps.executeQuery()).thenReturn(rs);
        when(rs.next()).thenReturn(true, false);
        when(rs.getString(1)).thenReturn("sales");

        String qualified = SqlServerCatalogSupport.qualifyTable(
                JdbcConnectionScopeGuard.wrap(raw, "sqlserver"),
                "mydb",
                "orders");

        assertEquals("[mydb].[sales].[orders]", qualified);
    }

    @Test
    void applyCatalog_requiresScopedConnection() {
        Connection connection = mock(Connection.class);
        assertThrows(SQLException.class, () -> SqlServerCatalogSupport.applyCatalog(connection, "mydb"));
    }

    @Test
    void applyCatalog_executesUseStatement() throws Exception {
        Connection raw = mock(Connection.class);
        Statement statement = mock(Statement.class);
        ResultSet dbNameRs = mock(ResultSet.class);
        when(raw.getCatalog()).thenReturn("master");
        when(raw.createStatement()).thenReturn(statement);
        when(statement.executeQuery("SELECT DB_NAME()")).thenReturn(dbNameRs);
        when(dbNameRs.next()).thenReturn(true, false);
        when(dbNameRs.getString(1)).thenReturn("master");

        SqlServerCatalogSupport.applyCatalog(JdbcConnectionScopeGuard.wrap(raw, "sqlserver"), "mydb");

        verify(statement).execute("USE [mydb]");
    }

    @Test
    void resolveListingScope_appliesUseAndPreservesExplicitSchema() throws Exception {
        Connection raw = mock(Connection.class);
        Statement statement = mock(Statement.class);
        ResultSet dbNameRs = mock(ResultSet.class);
        when(raw.getCatalog()).thenReturn("master");
        when(raw.createStatement()).thenReturn(statement);
        when(statement.executeQuery("SELECT DB_NAME()")).thenReturn(dbNameRs);
        when(dbNameRs.next()).thenReturn(true, false);
        when(dbNameRs.getString(1)).thenReturn("master");

        SqlServerMetadataScope scope = SqlServerCatalogSupport.resolveListingScope(
                JdbcConnectionScopeGuard.wrap(raw, "sqlserver"),
                "mydb",
                "sales");

        assertEquals("mydb", scope.catalog());
        assertEquals("sales", scope.schema());
        verify(statement).execute("USE [mydb]");
    }

    @Test
    void resolveRelationScope_fallsBackToRelationSchema() throws Exception {
        Connection raw = mock(Connection.class);
        Statement useStatement = mock(Statement.class);
        ResultSet dbNameRs = mock(ResultSet.class);
        PreparedStatement ps = mock(PreparedStatement.class);
        ResultSet rs = mock(ResultSet.class);
        when(raw.getCatalog()).thenReturn("master");
        when(raw.createStatement()).thenReturn(useStatement);
        when(useStatement.executeQuery("SELECT DB_NAME()")).thenReturn(dbNameRs);
        when(dbNameRs.next()).thenReturn(true, false);
        when(dbNameRs.getString(1)).thenReturn("master");
        when(raw.prepareStatement(contains("sys.objects"))).thenReturn(ps);
        when(ps.executeQuery()).thenReturn(rs);
        when(rs.next()).thenReturn(true, false);
        when(rs.getString(1)).thenReturn("sales");

        SqlServerMetadataScope scope = SqlServerCatalogSupport.resolveRelationScope(
                JdbcConnectionScopeGuard.wrap(raw, "sqlserver"),
                "mydb",
                "fallback",
                "orders",
                false);

        assertEquals("mydb", scope.catalog());
        assertEquals("sales", scope.schema());
        verify(useStatement).execute("USE [mydb]");
    }
}
