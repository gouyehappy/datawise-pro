package org.apache.datawise.backend.connector.sqlserver.support;

import org.apache.datawise.backend.model.ConnectionEntity;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SqlServerTableIntrospectorTest {

    @Test
    void loadViewDdl_readsDefinitionFromInformationSchemaViews() throws Exception {
        Connection connection = mock(Connection.class);
        Statement useStatement = mock(Statement.class);
        PreparedStatement viewPs = mock(PreparedStatement.class);
        ResultSet viewRs = mock(ResultSet.class);
        when(connection.getCatalog()).thenReturn("master");
        when(connection.createStatement()).thenReturn(useStatement);
        when(connection.prepareStatement(contains("INFORMATION_SCHEMA.VIEWS"))).thenReturn(viewPs);
        when(viewPs.executeQuery()).thenReturn(viewRs);
        when(viewRs.next()).thenReturn(true);
        when(viewRs.getString("VIEW_DEFINITION")).thenReturn("CREATE VIEW [order_detail_full] AS SELECT 1");

        ConnectionEntity entity = new ConnectionEntity();
        entity.setId("conn-1");
        entity.setDbType("sqlserver");

        SqlServerTableIntrospector introspector = new SqlServerTableIntrospector();
        var result = introspector.loadViewDdl(
                connection,
                entity,
                "mydb.sdp_ent_0x1y2z_fhs5xgej_a",
                "order_detail_full"
        );

        verify(useStatement).execute("USE [mydb]");
        verify(viewPs).setString(1, "sdp_ent_0x1y2z_fhs5xgej_a");
        verify(viewPs).setString(2, "order_detail_full");
        assertTrue(result.ddl().contains("CREATE VIEW"));
    }

    @Test
    void loadDdl_searchesAnySchemaWhenPreferredSchemaMisses() throws Exception {
        Connection connection = mock(Connection.class);
        Statement useStatement = mock(Statement.class);
        PreparedStatement preferredPs = mock(PreparedStatement.class);
        PreparedStatement fallbackPs = mock(PreparedStatement.class);
        PreparedStatement viewPs = mock(PreparedStatement.class);
        ResultSet emptyRs = mock(ResultSet.class);
        ResultSet fallbackRs = mock(ResultSet.class);
        ResultSet viewRs = mock(ResultSet.class);
        when(connection.getCatalog()).thenReturn("master");
        when(connection.createStatement()).thenReturn(useStatement);
        when(connection.prepareStatement(contains("INFORMATION_SCHEMA.VIEWS"))).thenReturn(viewPs);
        when(viewPs.executeQuery()).thenReturn(viewRs);
        when(viewRs.next()).thenReturn(false);
        when(connection.prepareStatement(contains("OBJECT_ID"))).thenReturn(preferredPs);
        when(connection.prepareStatement(contains("WHERE s.name = ? AND o.name = ?"))).thenReturn(preferredPs);
        when(connection.prepareStatement(contains("TOP 1"))).thenReturn(fallbackPs);
        when(preferredPs.executeQuery()).thenReturn(emptyRs, emptyRs, emptyRs);
        when(emptyRs.next()).thenReturn(false);
        when(fallbackPs.executeQuery()).thenReturn(fallbackRs);
        when(fallbackRs.next()).thenReturn(true);
        when(fallbackRs.getString("schema_name")).thenReturn("dbo");
        when(fallbackRs.getString("object_type")).thenReturn("V");
        when(fallbackRs.getString("definition")).thenReturn("CREATE VIEW [order_detail_full] AS SELECT 3");

        ConnectionEntity entity = new ConnectionEntity();
        entity.setId("conn-1");
        entity.setDbType("sqlserver");

        SqlServerTableIntrospector introspector = new SqlServerTableIntrospector();
        var result = introspector.loadDdl(
                connection,
                entity,
                "mydb.sdp_ent_0x1y2z_fhs5xgej_a",
                "order_detail_full"
        );

        verify(fallbackPs).setString(1, "order_detail_full");
        assertEquals("CREATE VIEW [order_detail_full] AS SELECT 3", result.ddl());
    }

    @Test
    void loadDdl_generatesCreateTableForBaseTable() throws Exception {
        Connection connection = mock(Connection.class);
        Statement useStatement = mock(Statement.class);
        PreparedStatement objectPs = mock(PreparedStatement.class);
        PreparedStatement columnsPs = mock(PreparedStatement.class);
        ResultSet objectRs = mock(ResultSet.class);
        ResultSet columnsRs = mock(ResultSet.class);
        when(connection.getCatalog()).thenReturn("master");
        when(connection.createStatement()).thenReturn(useStatement);
        PreparedStatement viewPs = mock(PreparedStatement.class);
        ResultSet viewRs = mock(ResultSet.class);
        when(connection.prepareStatement(contains("INFORMATION_SCHEMA.VIEWS"))).thenReturn(viewPs);
        when(viewPs.executeQuery()).thenReturn(viewRs);
        when(viewRs.next()).thenReturn(false);
        when(connection.prepareStatement(contains("OBJECT_ID"))).thenReturn(objectPs);
        when(connection.prepareStatement(contains("INFORMATION_SCHEMA.COLUMNS"))).thenReturn(columnsPs);
        when(objectPs.executeQuery()).thenReturn(objectRs);
        when(columnsPs.executeQuery()).thenReturn(columnsRs);
        when(objectRs.next()).thenReturn(true);
        when(objectRs.getString("schema_name")).thenReturn("dbo");
        // sys.objects.type is char(2); drivers may still return a padded value.
        when(objectRs.getString("object_type")).thenReturn("U ");
        when(objectRs.getString("definition")).thenReturn(null);
        when(columnsRs.next()).thenReturn(true, false);
        when(columnsRs.getInt("ORDINAL_POSITION")).thenReturn(1);
        when(columnsRs.getString("COLUMN_NAME")).thenReturn("id");
        when(columnsRs.getString("DATA_TYPE")).thenReturn("int");
        when(columnsRs.getString("IS_NULLABLE")).thenReturn("NO");
        when(columnsRs.getString("COLUMN_DEFAULT")).thenReturn(null);
        when(columnsRs.getObject("CHARACTER_MAXIMUM_LENGTH")).thenReturn(null);
        when(columnsRs.getObject("NUMERIC_PRECISION")).thenReturn(10);
        when(columnsRs.getObject("NUMERIC_SCALE")).thenReturn(0);
        when(columnsRs.getString("COLUMN_COMMENT")).thenReturn(null);

        ConnectionEntity entity = new ConnectionEntity();
        entity.setId("conn-1");
        entity.setDbType("sqlserver");

        SqlServerTableIntrospector introspector = new SqlServerTableIntrospector();
        var result = introspector.loadDdl(connection, entity, "mydb.dbo", "demo3");

        verify(useStatement).execute("USE [mydb]");
        verify(objectPs).setString(1, "[dbo].[demo3]");
        assertTrue(result.ddl().contains("CREATE TABLE [mydb].[dbo].[demo3]"));
        assertTrue(result.ddl().contains("[id] int"));
    }
}
