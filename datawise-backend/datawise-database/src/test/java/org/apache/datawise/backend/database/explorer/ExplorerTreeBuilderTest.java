package org.apache.datawise.backend.database.explorer;

import org.apache.datawise.backend.configstore.SchemaCacheStore;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.model.ConnectionGroupEntity;
import org.apache.datawise.backend.service.ConnectionVisibilityService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;

class ExplorerTreeBuilderTest {

    private ExplorerTreeBuilder builder;

    @BeforeEach
    void setUp() {
        SchemaCacheStore schemaCacheStore = mock(SchemaCacheStore.class);
        ConnectionVisibilityService connectionVisibilityService = mock(ConnectionVisibilityService.class);
        builder = new ExplorerTreeBuilder(schemaCacheStore, connectionVisibilityService);
    }

    @Test
    void buildGroupsNestsChildGroupsBeforeConnections() {
        ConnectionGroupEntity root = group("g-root", "\u672c\u5730\u73af\u5883", null);
        ConnectionGroupEntity child = group("g-child", "Company", "g-root");

        List<TreeNode> tree = builder.buildGroups(List.of(root, child));

        assertEquals(1, tree.size());
        assertEquals("\u672c\u5730\u73af\u5883", tree.get(0).getLabel());
        assertEquals(1, tree.get(0).getChildren().size());
        assertEquals("group", tree.get(0).getChildren().get(0).getType());
        assertEquals("Company", tree.get(0).getChildren().get(0).getLabel());
    }

    @Test
    void appendUniqueChildren_mergesWithoutDuplicates() {
        TreeNode folder = folderNode("folder-1", "tables");
        TreeNode first = tableNode("table-1", "alpha");
        folder.setChildren(new java.util.ArrayList<>(List.of(first)));
        List<TreeNode> roots = List.of(folderNodeParent(folder));

        TreeNode second = tableNode("table-2", "beta");
        builder.appendUniqueChildren(roots, "folder-1", List.of(first, second));

        List<TreeNode> children = builder.findNodeById(roots, "folder-1").getChildren();
        assertEquals(2, children.size());
        assertEquals("alpha", children.get(0).getLabel());
        assertEquals("beta", children.get(1).getLabel());
    }

    @Test
    void registerTableNodeIfAbsent_addsPaginatedTableForLazyLoad() {
        TreeNode database = databaseNode("db-conn-1-shop", "shop");
        TreeNode tablesFolder = folderNode("folder-tables-conn-1-shop", "tables");
        database.setChildren(new java.util.ArrayList<>(List.of(tablesFolder)));
        List<TreeNode> roots = new java.util.ArrayList<>(List.of(database));

        String tableId = "table-conn-1-shop-late_table";
        TreeNode registered = builder.registerTableNodeIfAbsent("conn-1", tableId, roots);

        assertEquals("late_table", registered.getLabel());
        assertEquals(1, tablesFolder.getChildren().size());
        assertEquals(tableId, tablesFolder.getChildren().get(0).getId());
    }

    private static TreeNode folderNodeParent(TreeNode tablesFolder) {
        TreeNode root = databaseNode("db-1", "main");
        root.setChildren(new java.util.ArrayList<>(List.of(tablesFolder)));
        return root;
    }

    private static TreeNode databaseNode(String id, String label) {
        TreeNode node = new TreeNode();
        node.setId(id);
        node.setLabel(label);
        node.setType("database");
        node.setChildren(new java.util.ArrayList<>());
        return node;
    }

    private static TreeNode folderNode(String id, String label) {
        TreeNode node = new TreeNode();
        node.setId(id);
        node.setLabel(label);
        node.setType("folder");
        node.setChildren(new java.util.ArrayList<>());
        return node;
    }

    private static TreeNode tableNode(String id, String label) {
        TreeNode node = new TreeNode();
        node.setId(id);
        node.setLabel(label);
        node.setType("table");
        return node;
    }

    private static ConnectionGroupEntity group(String id, String label, String parentId) {
        ConnectionGroupEntity entity = new ConnectionGroupEntity();
        entity.setId(id);
        entity.setLabel(label);
        entity.setParentId(parentId);
        entity.setExpanded(true);
        return entity;
    }
}
