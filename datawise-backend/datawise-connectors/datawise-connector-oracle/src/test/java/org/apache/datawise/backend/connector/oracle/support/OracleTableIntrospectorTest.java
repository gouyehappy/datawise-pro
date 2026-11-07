package org.apache.datawise.backend.connector.oracle.support;

import org.apache.datawise.backend.model.ConnectionEntity;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class OracleTableIntrospectorTest {

    @Test
    void loadProperties_usesDictionaryViewsInsteadOfJdbcIndexInfo() throws Exception {
        Connection connection = mock(Connection.class);
        PreparedStatement commentPs = mock(PreparedStatement.class);
        PreparedStatement columnsPs = mock(PreparedStatement.class);
        PreparedStatement indexPs = mock(PreparedStatement.class);
        PreparedStatement fkPs = mock(PreparedStatement.class);
        ResultSet commentRs = mock(ResultSet.class);
        ResultSet columnsRs = mock(ResultSet.class);
        ResultSet indexRs = mock(ResultSet.class);
        ResultSet fkRs = mock(ResultSet.class);

        when(connection.prepareStatement(contains("all_tab_comments"))).thenReturn(commentPs);
        when(connection.prepareStatement(contains("all_tab_columns"))).thenReturn(columnsPs);
        when(connection.prepareStatement(contains("all_indexes"))).thenReturn(indexPs);
        when(connection.prepareStatement(contains("all_constraints"))).thenReturn(fkPs);
        when(commentPs.executeQuery()).thenReturn(commentRs);
        when(columnsPs.executeQuery()).thenReturn(columnsRs);
        when(indexPs.executeQuery()).thenReturn(indexRs);
        when(fkPs.executeQuery()).thenReturn(fkRs);

        when(commentRs.next()).thenReturn(true);
        when(commentRs.getString("comments")).thenReturn("spatial table");

        when(columnsRs.next()).thenReturn(true, false);
        when(columnsRs.getInt("column_id")).thenReturn(1);
        when(columnsRs.getString("column_name")).thenReturn("ID");
        when(columnsRs.getString("data_type")).thenReturn("NUMBER");
        when(columnsRs.getObject("data_length")).thenReturn(22);
        when(columnsRs.getObject("data_precision")).thenReturn(10);
        when(columnsRs.getObject("data_scale")).thenReturn(0);
        when(columnsRs.getString("nullable")).thenReturn("N");
        when(columnsRs.getString("data_default")).thenReturn(null);
        when(columnsRs.getString("comments")).thenReturn(null);

        when(indexRs.next()).thenReturn(true, false);
        when(indexRs.getString("index_name")).thenReturn("ANIMATION_PK");
        when(indexRs.getString("uniqueness")).thenReturn("UNIQUE");
        when(indexRs.getString("column_name")).thenReturn("ID");

        when(fkRs.next()).thenReturn(false);

        ConnectionEntity entity = new ConnectionEntity();
        entity.setId("conn-1");
        entity.setDbType("oracle");

        OracleTableIntrospector introspector = new OracleTableIntrospector();
        var result = introspector.loadProperties(connection, entity, "MDSYS", "Animation3d235_TAB");

        assertEquals("Animation3d235_TAB", result.tableName());
        assertEquals("spatial table", result.comment());
        assertEquals(1, result.columns().size());
        assertEquals("ID", result.columns().get(0).name());
        assertEquals(1, result.indexes().size());
        assertEquals("ANIMATION_PK", result.indexes().get(0).name());
        assertTrue(result.indexes().get(0).unique());
        assertEquals("ID", result.indexes().get(0).columns());
        assertTrue(result.foreignKeys().isEmpty());
    }
}
