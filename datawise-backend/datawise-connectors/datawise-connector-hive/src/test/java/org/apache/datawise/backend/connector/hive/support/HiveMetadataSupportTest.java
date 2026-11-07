package org.apache.datawise.backend.connector.hive.support;

import org.apache.datawise.backend.domain.TableColumnDetail;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class HiveMetadataSupportTest {

    @Test
    void quoteQualifiedTable_stripsSyntheticMainPrefix() {
        assertEquals("`a003`.`orders`", HiveMetadataSupport.quoteQualifiedTable("main.a003", "orders"));
        assertEquals("`a003`.`orders`", HiveMetadataSupport.quoteQualifiedTable("a003", "orders"));
        assertEquals("`hive`.`a003`.`orders`", HiveMetadataSupport.quoteQualifiedTable("hive.a003", "orders"));
    }

    @Test
    void normalizeHiveCreateTableDdl_splitsDotInsideBackticks() {
        String raw = "CREATE TABLE `a003.gxc_test` (\n  `id` int\n)";
        String normalized = HiveMetadataSupport.normalizeHiveCreateTableDdl("a003", "gxc_test", raw);
        assertEquals("CREATE TABLE `a003`.`gxc_test` (\n  `id` int\n)", normalized);
    }

    @Test
    void synthesizeCreateTableDdl_buildsQualifiedCreateFromColumns() {
        var columns = List.of(
                new TableColumnDetail(1, "id", "int", true, false, null, null, null, "pk"),
                new TableColumnDetail(2, "name", "string", true, false, null, null, null, null)
        );
        String ddl = HiveMetadataSupport.synthesizeCreateTableDdl("a003", "gxc_test", columns);
        assertTrue(ddl.contains("CREATE TABLE `a003`.`gxc_test`"));
        assertTrue(ddl.contains("`id` int COMMENT 'pk'"));
        assertTrue(ddl.contains("`name` string"));
    }

    @Test
    void loadColumns_readsHiveLowercaseJdbcMetadataLabels() throws SQLException {
        Connection connection = mock(Connection.class);
        DatabaseMetaData meta = mock(DatabaseMetaData.class);
        ResultSet catalogs = mock(ResultSet.class);
        ResultSet columns = mock(ResultSet.class);
        when(connection.getMetaData()).thenReturn(meta);
        when(meta.getCatalogs()).thenReturn(catalogs);
        when(catalogs.next()).thenReturn(false);
        when(meta.getColumns(isNull(), eq("a003"), eq("orders"), eq("%"))).thenReturn(columns);
        when(columns.next()).thenReturn(true, false);
        when(columns.getString("column_name")).thenReturn("id");
        when(columns.getString("COLUMN_NAME")).thenThrow(new SQLException("Could not find COLUMN_NAME"));
        when(columns.getString("type_name")).thenReturn("int");
        when(columns.getString("TYPE_NAME")).thenThrow(new SQLException("Could not find TYPE_NAME"));
        when(columns.getInt("column_size")).thenReturn(10);
        when(columns.getInt("COLUMN_SIZE")).thenThrow(new SQLException("Could not find COLUMN_SIZE"));
        when(columns.getInt("decimal_digits")).thenReturn(0);
        when(columns.getInt("DECIMAL_DIGITS")).thenThrow(new SQLException("Could not find DECIMAL_DIGITS"));
        when(columns.getString("is_nullable")).thenReturn("YES");
        when(columns.getString("is_auto_increment")).thenReturn("NO");
        when(columns.getString("IS_AUTOINCREMENT")).thenThrow(new SQLException("Could not find IS_AUTOINCREMENT"));
        when(columns.getString("column_def")).thenReturn(null);
        when(columns.getString("remarks")).thenReturn(null);

        var result = HiveMetadataSupport.loadColumns(connection, "a003", "orders");

        assertEquals(1, result.size());
        assertEquals("id", result.get(0).name());
        assertEquals("int", result.get(0).dataType());
    }

    @Test
    void loadColumns_usesSchemaPatternNotCatalogForFlatDatabase() throws SQLException {
        Connection connection = mock(Connection.class);
        DatabaseMetaData meta = mock(DatabaseMetaData.class);
        ResultSet catalogs = mock(ResultSet.class);
        ResultSet columns = mock(ResultSet.class);
        when(connection.getMetaData()).thenReturn(meta);
        when(meta.getCatalogs()).thenReturn(catalogs);
        when(catalogs.next()).thenReturn(false);
        when(meta.getColumns(isNull(), eq("a003"), eq("orders"), eq("%"))).thenReturn(columns);
        when(columns.next()).thenReturn(true, false);
        when(columns.getString("COLUMN_NAME")).thenReturn("id");
        when(columns.getString("TYPE_NAME")).thenReturn("int");
        when(columns.getInt("COLUMN_SIZE")).thenReturn(10);
        when(columns.getInt("DECIMAL_DIGITS")).thenReturn(0);
        when(columns.getInt("NULLABLE")).thenReturn(DatabaseMetaData.columnNullable);
        when(columns.getString("COLUMN_DEF")).thenReturn(null);
        when(columns.getString("REMARKS")).thenReturn(null);
        when(columns.getString("IS_AUTOINCREMENT")).thenReturn("NO");

        var result = HiveMetadataSupport.loadColumns(connection, "a003", "orders");

        assertEquals(1, result.size());
        assertEquals("id", result.get(0).name());
        verify(meta).getColumns(isNull(), eq("a003"), eq("orders"), eq("%"));
    }

    @Test
    void loadColumns_fallsBackToDescribeWhenMetadataEmpty() throws SQLException {
        Connection connection = mock(Connection.class);
        DatabaseMetaData meta = mock(DatabaseMetaData.class);
        ResultSet catalogs = mock(ResultSet.class);
        ResultSet emptyColumns = mock(ResultSet.class);
        ResultSet describe = mock(ResultSet.class);
        Statement statement = mock(Statement.class);
        when(connection.getMetaData()).thenReturn(meta);
        when(connection.createStatement()).thenReturn(statement);
        when(meta.getCatalogs()).thenReturn(catalogs);
        when(catalogs.next()).thenReturn(false);
        when(meta.getColumns(isNull(), eq("p00002"), eq("fact_orders"), eq("%"))).thenReturn(emptyColumns);
        when(meta.getColumns(eq("p00002"), isNull(), eq("fact_orders"), eq("%"))).thenReturn(emptyColumns);
        when(emptyColumns.next()).thenReturn(false);
        when(statement.executeQuery(anyString())).thenReturn(describe);
        when(describe.next()).thenReturn(true, true, false);
        when(describe.getString("col_name")).thenReturn("col_name", "amount");
        when(describe.getString(1)).thenReturn("col_name", "amount");
        when(describe.getString("data_type")).thenReturn("decimal(18,2)");
        when(describe.getString(2)).thenReturn("decimal(18,2)");
        when(describe.getString("comment")).thenReturn(null);
        when(describe.getString(3)).thenReturn(null);

        var result = HiveMetadataSupport.loadColumns(connection, "p00002", "fact_orders");

        assertEquals(1, result.size());
        TableColumnDetail column = result.get(0);
        assertEquals("amount", column.name());
        assertEquals("decimal(18,2)", column.dataType());
    }
}
