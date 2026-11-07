package org.apache.datawise.backend.database.explorer;

import org.apache.datawise.backend.domain.TreeNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ExplorerWorkspaceSyncTest {

    @Mock
    private ExplorerTreeBuilder treeBuilder;

    @Mock
    private org.apache.datawise.backend.service.InstanceWorkspaceService instanceWorkspaceService;

    private ExplorerWorkspaceSync workspaceSync;

    @BeforeEach
    void setUp() {
        workspaceSync = new ExplorerWorkspaceSync(treeBuilder, instanceWorkspaceService);
    }

    @Test
    void syncWorkspacesInCache_targetsTrinoSchemaWorkspacesFolder() throws Exception {
        TreeNode workspacesFolder = folder("folder-ws", "workspaces");
        TreeNode schemaNode = schemaNode("schema-a003", "a003", workspacesFolder);
        TreeNode catalogNode = catalogNode("db-hive", "hive", schemaNode);
        List<TreeNode> roots = new ArrayList<>(List.of(catalogNode));

        TreeNode sqlFile = new TreeNode();
        sqlFile.setLabel("Script-1.sql");
        sqlFile.setType("sql_file");

        when(treeBuilder.loadSchemaChildren("conn-trino")).thenReturn(roots);
        when(instanceWorkspaceService.listSqlFileNodes("conn-trino", "hive.a003")).thenReturn(List.of(sqlFile));

        workspaceSync.syncWorkspacesInCache("conn-trino", "hive.a003");

        assertEquals(1, workspacesFolder.getChildren().size());
        assertEquals("Script-1.sql", workspacesFolder.getChildren().get(0).getLabel());
        verify(treeBuilder).saveSchemaChildren(eq("conn-trino"), eq(roots));
        verify(instanceWorkspaceService).listSqlFileNodes("conn-trino", "hive.a003");
    }

    private static TreeNode catalogNode(String id, String label, TreeNode schemaChild) {
        TreeNode node = new TreeNode();
        node.setId(id);
        node.setLabel(label);
        node.setType("database");
        node.setChildren(new ArrayList<>(List.of(schemaChild)));
        return node;
    }

    private static TreeNode schemaNode(String id, String label, TreeNode workspacesFolder) {
        TreeNode node = new TreeNode();
        node.setId(id);
        node.setLabel(label);
        node.setType("schema");
        node.setChildren(new ArrayList<>(List.of(workspacesFolder)));
        return node;
    }

    private static TreeNode folder(String id, String label) {
        TreeNode node = new TreeNode();
        node.setId(id);
        node.setLabel(label);
        node.setType("folder");
        node.setChildren(new ArrayList<>());
        return node;
    }
}
