package org.apache.datawise.backend.connector.hive.explorer;

import org.apache.datawise.backend.domain.TreeNode;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.SQLException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class HiveSchemaExplorerTest {

    @Test
    void introspectConnection_listsFlatDatabasesWhenCatalogsEmpty() throws SQLException {
        Connection connection = mock(Connection.class);
        DatabaseMetaData meta = mock(DatabaseMetaData.class);
        ResultSet catalogs = mock(ResultSet.class);
        ResultSet schemas = mock(ResultSet.class);
        when(connection.getMetaData()).thenReturn(meta);
        when(meta.getCatalogs()).thenReturn(catalogs);
        when(catalogs.next()).thenReturn(false);
        when(meta.getSchemas(null, null)).thenReturn(schemas);
        when(schemas.next()).thenReturn(true, true, false);
        when(schemas.getString("TABLE_SCHEM")).thenReturn("p00002", "a003");

        HiveSchemaExplorer explorer = new HiveSchemaExplorer();
        var nodes = explorer.introspectConnection(connection, "conn-1");

        assertEquals(2, nodes.size());
        assertEquals("database", nodes.get(0).getType());
        assertEquals("p00002", nodes.get(0).getLabel());
        assertEquals("a003", nodes.get(1).getLabel());
    }

    @Test
    void loadDatabaseChildren_buildsTablesFolderForFlatDatabase() throws SQLException {
        Connection connection = mock(Connection.class);
        DatabaseMetaData meta = mock(DatabaseMetaData.class);
        ResultSet catalogs = mock(ResultSet.class);
        when(connection.getMetaData()).thenReturn(meta);
        when(meta.getCatalogs()).thenReturn(catalogs);
        when(catalogs.next()).thenReturn(false);

        HiveSchemaExplorer explorer = new HiveSchemaExplorer();
        var children = explorer.loadDatabaseChildren(connection, "conn-1", "a003");

        assertEquals(8, children.size());
        TreeNode tablesFolder = children.stream()
                .filter(node -> "tables".equals(node.getLabel()))
                .findFirst()
                .orElseThrow();
        assertEquals("folder", tablesFolder.getType());
    }
}
