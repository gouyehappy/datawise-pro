package org.apache.datawise.backend.jdbc.support;

import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SqlServerCatalogSupportTest {

    @Test
    void qualifyTable_usesResolvedSchemaInThreePartName() throws Exception {
        Connection connection = mock(Connection.class);
        Statement useStatement = mock(Statement.class);
        PreparedStatement ps = mock(PreparedStatement.class);
        ResultSet rs = mock(ResultSet.class);
        when(connection.getCatalog()).thenReturn("master");
        when(connection.createStatement()).thenReturn(useStatement);
        when(connection.prepareStatement(contains("sys.objects"))).thenReturn(ps);
        when(ps.executeQuery()).thenReturn(rs);
        when(rs.next()).thenReturn(true, false);
        when(rs.getString(1)).thenReturn("sales");

        String qualified = SqlServerCatalogSupport.qualifyTable(connection, "mydb", "orders");

        assertEquals("[mydb].[sales].[orders]", qualified);
    }

    @Test
    void applyCatalog_executesUseStatement() throws Exception {
        Connection connection = mock(Connection.class);
        Statement statement = mock(Statement.class);
        when(connection.getCatalog()).thenReturn("master");
        when(connection.createStatement()).thenReturn(statement);

        SqlServerCatalogSupport.applyCatalog(connection, "mydb");

        verify(statement).execute("USE [mydb]");
    }

    @Test
    void resolveListingScope_appliesUseAndPreservesExplicitSchema() throws Exception {
        Connection connection = mock(Connection.class);
        Statement statement = mock(Statement.class);
        when(connection.getCatalog()).thenReturn("master");
        when(connection.createStatement()).thenReturn(statement);

        SqlServerMetadataScope scope = SqlServerCatalogSupport.resolveListingScope(connection, "mydb", "sales");

        assertEquals("mydb", scope.catalog());
        assertEquals("sales", scope.schema());
        verify(statement).execute("USE [mydb]");
    }

    @Test
    void resolveRelationScope_fallsBackToRelationSchema() throws Exception {
        Connection connection = mock(Connection.class);
        Statement useStatement = mock(Statement.class);
        PreparedStatement ps = mock(PreparedStatement.class);
        ResultSet rs = mock(ResultSet.class);
        when(connection.getCatalog()).thenReturn("master");
        when(connection.createStatement()).thenReturn(useStatement);
        when(connection.prepareStatement(contains("sys.objects"))).thenReturn(ps);
        when(ps.executeQuery()).thenReturn(rs);
        when(rs.next()).thenReturn(true, false);
        when(rs.getString(1)).thenReturn("sales");

        SqlServerMetadataScope scope = SqlServerCatalogSupport.resolveRelationScope(
                connection,
                "mydb",
                "fallback",
                "orders",
                false
        );

        assertEquals("mydb", scope.catalog());
        assertEquals("sales", scope.schema());
        verify(useStatement).execute("USE [mydb]");
    }
}
