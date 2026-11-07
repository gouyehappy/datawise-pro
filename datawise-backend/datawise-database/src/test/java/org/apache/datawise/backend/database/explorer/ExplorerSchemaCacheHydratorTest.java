package org.apache.datawise.backend.database.explorer;

import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.schema.SchemaNodeIds;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ExplorerSchemaCacheHydratorTest {

    private static final String CONNECTION_ID = "new-1782296190515";

    private ExplorerSchemaCacheHydrator hydrator;

    @BeforeEach
    void setUp() {
        hydrator = new ExplorerSchemaCacheHydrator(new ExplorerTreeBuilder(null, null));
    }

    @Test
    void loadsCatalogSchemasWhenSchemaNodeMissingFromCache() throws Exception {
        TreeNode hive = catalog("hive");
        List<TreeNode> roots = new ArrayList<>(List.of(hive));
        String schemaNodeId = SchemaNodeIds.nodeId("schema", CONNECTION_ID, "hive", "a003");
        AtomicInteger loadCount = new AtomicInteger();

        hydrator.ensureAncestorsLoaded(
                CONNECTION_ID,
                schemaNodeId,
                roots,
                node -> {
                    loadCount.incrementAndGet();
                    TreeNode schema = schemaNode("a003", schemaNodeId);
                    hive.setChildren(List.of(schema));
                    return List.of(schema);
                }
        );

        assertEquals(1, loadCount.get());
        assertEquals(1, hive.getChildren().size());
    }

    @Test
    void skipsCatalogLoadWhenSchemasAlreadyCached() throws Exception {
        String schemaNodeId = SchemaNodeIds.nodeId("schema", CONNECTION_ID, "hive", "a003");
        TreeNode hive = catalog("hive");
        hive.setChildren(List.of(schemaNode("a003", schemaNodeId)));
        List<TreeNode> roots = List.of(hive);
        AtomicInteger loadCount = new AtomicInteger();

        hydrator.ensureAncestorsLoaded(
                CONNECTION_ID,
                schemaNodeId,
                roots,
                node -> {
                    loadCount.incrementAndGet();
                    return List.of();
                }
        );

        assertEquals(0, loadCount.get());
    }

    @Test
    void loadsMysqlDatabaseChildrenWhenTablesFolderMissingFromCache() throws Exception {
        String connectionId = "conn-1";
        TreeNode database = catalog("datalinktest");
        database.setId(SchemaNodeIds.nodeId("db", connectionId, "datalinktest"));
        List<TreeNode> roots = new ArrayList<>(List.of(database));
        String tablesFolderId = "folder-tables-" + connectionId + "-datalinktest";
        AtomicInteger loadCount = new AtomicInteger();

        hydrator.ensureAncestorsLoaded(
                connectionId,
                tablesFolderId,
                roots,
                node -> {
                    loadCount.incrementAndGet();
                    TreeNode tables = new TreeNode();
                    tables.setId(tablesFolderId);
                    tables.setLabel("tables");
                    tables.setType("folder");
                    tables.setChildren(new ArrayList<>());
                    database.setChildren(List.of(tables));
                    return List.of(tables);
                }
        );

        assertEquals(1, loadCount.get());
        assertEquals(1, database.getChildren().size());
        assertEquals(tablesFolderId, database.getChildren().get(0).getId());
    }

    private static TreeNode catalog(String label) {
        TreeNode node = new TreeNode();
        node.setId(SchemaNodeIds.nodeId("db", CONNECTION_ID, label));
        node.setLabel(label);
        node.setType("database");
        node.setChildren(new ArrayList<>());
        return node;
    }

    private static TreeNode schemaNode(String label, String id) {
        TreeNode node = new TreeNode();
        node.setId(id);
        node.setLabel(label);
        node.setType("schema");
        node.setChildren(new ArrayList<>());
        return node;
    }
}
