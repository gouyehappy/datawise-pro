package org.apache.datawise.backend.database.explorer;

import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.service.ViewModelService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ExplorerViewModelSyncTest {

    @Mock
    private ExplorerTreeBuilder treeBuilder;

    @Mock
    private ViewModelService viewModelService;

    @InjectMocks
    private ExplorerViewModelSync sync;

    @Test
    void syncViewModelsInCache_updatesViewsFolderChildren() throws Exception {
        TreeNode modelsFolder = folder("models");
        TreeNode database = databaseNode("a003", List.of(modelsFolder));
        List<TreeNode> roots = new ArrayList<>(List.of(database));

        TreeNode vmNode = new TreeNode();
        vmNode.setId("vm-1");
        vmNode.setLabel("sales_summary");
        vmNode.setType("view_model");

        when(treeBuilder.loadSchemaChildren("conn-1")).thenReturn(roots);
        when(viewModelService.listViewModelNodes(eq("conn-1"), eq("a003")))
                .thenReturn(List.of(vmNode));

        sync.syncViewModelsInCache("conn-1", "a003");

        assertEquals(1, modelsFolder.getChildren().size());
        assertEquals("view_model", modelsFolder.getChildren().get(0).getType());
        verify(treeBuilder).saveSchemaChildren("conn-1", roots);
    }

    private static TreeNode databaseNode(String label, List<TreeNode> children) {
        TreeNode node = new TreeNode();
        node.setId("db-" + label);
        node.setLabel(label);
        node.setType("database");
        node.setChildren(children);
        return node;
    }

    private static TreeNode folder(String label) {
        TreeNode node = new TreeNode();
        node.setId("folder-" + label);
        node.setLabel(label);
        node.setType("folder");
        node.setChildren(new ArrayList<>());
        return node;
    }
}
