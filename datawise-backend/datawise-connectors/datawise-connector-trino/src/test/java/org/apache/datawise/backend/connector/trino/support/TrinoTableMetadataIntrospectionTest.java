package org.apache.datawise.backend.connector.trino.support;

import org.apache.datawise.backend.domain.TableDdlResult;
import org.apache.datawise.backend.domain.TablePropertiesResult;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TrinoTableMetadataIntrospectionTest {

    @Test
    void loadProperties_readsColumnsWithoutIndexMetadata() throws SQLException {
        Connection connection = mock(Connection.class);
        DatabaseMetaData meta = mock(DatabaseMetaData.class);
        ResultSet tables = mock(ResultSet.class);
        ResultSet columns = mock(ResultSet.class);
        ResultSet primaryKeys = mock(ResultSet.class);

        when(connection.getMetaData()).thenReturn(meta);
        when(meta.getTables(eq("hive"), eq("a003"), eq("agent_test3"), any())).thenReturn(tables);
        when(tables.next()).thenReturn(false);
        when(meta.getPrimaryKeys("hive", "a003", "agent_test3")).thenReturn(primaryKeys);
        when(primaryKeys.next()).thenReturn(false);
        when(meta.getColumns("hive", "a003", "agent_test3", "%")).thenReturn(columns);
        when(columns.next()).thenReturn(true, false);
        when(columns.getString("COLUMN_NAME")).thenReturn("id");
        when(columns.getString("TYPE_NAME")).thenReturn("bigint");
        when(columns.getInt("COLUMN_SIZE")).thenReturn(19);
        when(columns.getInt("DECIMAL_DIGITS")).thenReturn(0);
        when(columns.getInt("NULLABLE")).thenReturn(DatabaseMetaData.columnNullable);
        when(columns.getString("COLUMN_DEF")).thenReturn(null);
        when(columns.getString("REMARKS")).thenReturn(null);
        when(columns.getString("IS_AUTOINCREMENT")).thenReturn("NO");

        ConnectionEntity entity = new ConnectionEntity();
        entity.setId("conn-1");
        entity.setDbType("trino");

        TrinoTableMetadataIntrospection introspection = new TrinoTableMetadataIntrospection();
        TablePropertiesResult result = introspection.loadProperties(
                connection,
                entity,
                "hive.a003",
                "agent_test3"
        );

        assertEquals("agent_test3", result.tableName());
        assertEquals(1, result.columns().size());
        assertEquals("id", result.columns().get(0).name());
        assertTrue(result.indexes().isEmpty());
        assertTrue(result.foreignKeys().isEmpty());
        verify(meta, never()).getIndexInfo(any(), any(), any(), eq(false), eq(false));
    }

    @Test
    void loadDdl_usesShowCreateTableWithQualifiedName() throws SQLException {
        Connection connection = mock(Connection.class);
        Statement statement = mock(Statement.class);
        ResultSet rs = mock(ResultSet.class);

        when(connection.createStatement()).thenReturn(statement);
        when(statement.executeQuery(
                "SHOW CREATE TABLE \"hive\".\"a003_a\".\"ds_data_receive_stat\""
        )).thenReturn(rs);
        when(rs.next()).thenReturn(true);
        when(rs.getString(1)).thenReturn(
                "CREATE TABLE hive.a003_a.ds_data_receive_stat (\n   shop_id varchar\n)"
        );

        ConnectionEntity entity = new ConnectionEntity();
        entity.setDbType("trino");

        TrinoTableMetadataIntrospection introspection = new TrinoTableMetadataIntrospection();
        TableDdlResult result = introspection.loadDdl(
                connection,
                entity,
                "hive.a003_a",
                "ds_data_receive_stat"
        );

        assertEquals(
                "CREATE TABLE hive.a003_a.ds_data_receive_stat (\n   shop_id varchar\n)",
                result.ddl()
        );
    }
}
