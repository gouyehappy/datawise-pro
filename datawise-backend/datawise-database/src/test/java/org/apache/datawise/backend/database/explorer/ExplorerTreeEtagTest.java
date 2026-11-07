package org.apache.datawise.backend.database.explorer;

import org.apache.datawise.backend.domain.TreeNode;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

class ExplorerTreeEtagTest {

    @Test
    void of_changesWhenCacheVersionChanges() {
        List<TreeNode> nodes = List.of(tableNode("t1"), tableNode("t2"));

        String first = ExplorerTreeEtag.of("conn-1", "folder-1", nodes, 1L);
        String second = ExplorerTreeEtag.of("conn-1", "folder-1", nodes, 2L);

        assertNotEquals(first, second);
    }

    @Test
    void of_stableForSamePayload() {
        List<TreeNode> nodes = List.of(tableNode("t1"), tableNode("t2"));

        String first = ExplorerTreeEtag.of("conn-1", "folder-1", nodes, 5L);
        String second = ExplorerTreeEtag.of("conn-1", "folder-1", nodes, 5L);

        assertEquals(first, second);
    }

    private static TreeNode tableNode(String label) {
        TreeNode node = new TreeNode();
        node.setId("table:" + label);
        node.setLabel(label);
        node.setType("table");
        return node;
    }
}
