package org.apache.datawise.backend.connector.sqlserver.support;

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

class SqlServerSchemaMetadataSupportTest {

    private final SqlServerSchemaMetadataSupport support = new SqlServerSchemaMetadataSupport();

    @Test
    void listProcedures_queriesSysObjects() throws Exception {
        Connection connection = mock(Connection.class);
        Statement useStatement = mock(Statement.class);
        PreparedStatement ps = mock(PreparedStatement.class);
        ResultSet rs = mock(ResultSet.class);
        when(connection.getCatalog()).thenReturn("master");
        when(connection.createStatement()).thenReturn(useStatement);
        when(connection.prepareStatement(contains("sys.objects"))).thenReturn(ps);
        when(ps.executeQuery()).thenReturn(rs);
        when(rs.next()).thenReturn(true, false);
        when(rs.getString(1)).thenReturn("save_order");

        var nodes = support.listProcedures(connection, "conn-1", "mydb", "sales", "sqlserver");

        assertEquals(1, nodes.size());
        assertEquals("procedure", nodes.get(0).getType());
        assertEquals("save_order", nodes.get(0).getLabel());
        verify(ps).setString(1, "sales");
        verify(useStatement).execute("USE [mydb]");
    }

    @Test
    void listViews_queriesInformationSchemaViews() throws Exception {
        Connection connection = mock(Connection.class);
        Statement useStatement = mock(Statement.class);
        PreparedStatement ps = mock(PreparedStatement.class);
        ResultSet rs = mock(ResultSet.class);
        when(connection.getCatalog()).thenReturn("master");
        when(connection.createStatement()).thenReturn(useStatement);
        when(connection.prepareStatement(contains("INFORMATION_SCHEMA.VIEWS"))).thenReturn(ps);
        when(ps.executeQuery()).thenReturn(rs);
        when(rs.next()).thenReturn(true, true, false);
        when(rs.getString(1)).thenReturn("order_detail_full", "order_detail_snapshot");

        var nodes = support.listViews(connection, "conn-1", "mydb", "sales", "sqlserver");

        assertEquals(2, nodes.size());
        assertEquals("view", nodes.get(0).getType());
        assertEquals("order_detail_full", nodes.get(0).getLabel());
        verify(ps).setString(1, "sales");
        verify(useStatement).execute("USE [mydb]");
    }
}
