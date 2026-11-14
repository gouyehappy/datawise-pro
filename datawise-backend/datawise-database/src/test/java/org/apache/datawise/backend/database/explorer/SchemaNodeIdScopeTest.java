package org.apache.datawise.backend.database.explorer;

import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.schema.SchemaNodeIds;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SchemaNodeIdScopeTest {

    private static final String CONNECTION_ID = "new-1782296190515";

    @Test
    void resolvesTrinoSchemaNodeFromCatalogRoots() {
        List<TreeNode> roots = List.of(catalog(CONNECTION_ID, "hive"), catalog(CONNECTION_ID, "kudu"));

        var scope = SchemaNodeIdScope.resolve(
                CONNECTION_ID,
                "schema-" + CONNECTION_ID + "-hive-a003",
                roots
        );

        assertTrue(scope.isPresent());
        assertEquals("hive", scope.get().catalog());
        assertEquals("a003", scope.get().schema());
        assertEquals(SchemaNodeIdScope.HydrationDepth.SCHEMA_LIST, scope.get().depth());
    }

    @Test
    void resolvesTablesFolderUnderSchema() {
        List<TreeNode> roots = List.of(catalog(CONNECTION_ID, "hive"));

        var scope = SchemaNodeIdScope.resolve(
                CONNECTION_ID,
                "folder-tables-" + CONNECTION_ID + "-hive-a003",
                roots
        );

        assertTrue(scope.isPresent());
        assertEquals("hive", scope.get().catalog());
        assertEquals("a003", scope.get().schema());
        assertEquals(SchemaNodeIdScope.HydrationDepth.SCHEMA_BRANCH, scope.get().depth());
    }

    @Test
    void resolvesMysqlDatabaseNode() {
        String connectionId = "conn-1";
        List<TreeNode> roots = List.of(catalog(connectionId, "admin_db"));

        var scope = SchemaNodeIdScope.resolve(connectionId, "db-conn-1-admin_db", roots);

        assertTrue(scope.isPresent());
        assertEquals("admin_db", scope.get().catalog());
        assertEquals(SchemaNodeIdScope.HydrationDepth.CATALOG, scope.get().depth());
    }

    @Test
    void resolvesMysqlTablesFolderUnderFlatCatalog() {
        String connectionId = "conn-1";
        List<TreeNode> roots = List.of(catalog(connectionId, "datalinktest"));

        var scope = SchemaNodeIdScope.resolve(
                connectionId,
                "folder-tables-" + connectionId + "-datalinktest",
                roots
        );

        assertTrue(scope.isPresent());
        assertEquals("datalinktest", scope.get().catalog());
        assertEquals(null, scope.get().schema());
        assertEquals(SchemaNodeIdScope.HydrationDepth.SCHEMA_BRANCH, scope.get().depth());
        assertTrue(scope.get().needsCatalogSchemaList());
    }

    @Test
    void resolvesAiFolderUnderFlatCatalogNamedDefault() {
        String connectionId = "conn-1";
        List<TreeNode> roots = List.of(catalog(connectionId, "default"));

        var scope = SchemaNodeIdScope.resolve(
                connectionId,
                "folder-ai-" + connectionId + "-default",
                roots
        );

        assertTrue(scope.isPresent());
        assertEquals("default", scope.get().catalog());
        assertEquals(null, scope.get().schema());
        assertEquals(SchemaNodeIdScope.HydrationDepth.SCHEMA_BRANCH, scope.get().depth());
    }

    @Test
    void resolvesAiFolderUnderSchema() {
        List<TreeNode> roots = List.of(catalog(CONNECTION_ID, "hive"));

        var scope = SchemaNodeIdScope.resolve(
                CONNECTION_ID,
                "folder-ai-" + CONNECTION_ID + "-hive-a003",
                roots
        );

        assertTrue(scope.isPresent());
        assertEquals("hive", scope.get().catalog());
        assertEquals("a003", scope.get().schema());
        assertEquals(SchemaNodeIdScope.HydrationDepth.SCHEMA_BRANCH, scope.get().depth());
    }

    private static TreeNode catalog(String connectionId, String label) {
        TreeNode node = new TreeNode();
        node.setId(SchemaNodeIds.nodeId("db", connectionId, label));
        node.setLabel(label);
        node.setType("database");
        return node;
    }
}
