package org.apache.datawise.backend.database.explorer;

import org.apache.datawise.backend.domain.TreeNode;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** O(1) node/parent lookup over an Explorer schema tree snapshot. */
final class ExplorerTreeIndex {

    private final Map<String, TreeNode> byId;
    private final Map<String, TreeNode> parentById;

    private ExplorerTreeIndex(Map<String, TreeNode> byId, Map<String, TreeNode> parentById) {
        this.byId = byId;
        this.parentById = parentById;
    }

    static ExplorerTreeIndex build(List<TreeNode> roots) {
        Map<String, TreeNode> byId = new HashMap<>();
        Map<String, TreeNode> parentById = new HashMap<>();
        if (roots != null) {
            for (TreeNode root : roots) {
                indexRecursive(null, root, byId, parentById);
            }
        }
        return new ExplorerTreeIndex(byId, parentById);
    }

    TreeNode find(String nodeId) {
        if (nodeId == null) {
            return null;
        }
        return byId.get(nodeId);
    }

    TreeNode parent(String nodeId) {
        if (nodeId == null) {
            return null;
        }
        return parentById.get(nodeId);
    }

    private static void indexRecursive(
            TreeNode parent,
            TreeNode node,
            Map<String, TreeNode> byId,
            Map<String, TreeNode> parentById
    ) {
        if (node == null) {
            return;
        }
        String id = node.getId();
        if (id != null && !id.isBlank()) {
            byId.put(id, node);
            if (parent != null) {
                parentById.put(id, parent);
            }
        }
        List<TreeNode> children = node.getChildren();
        if (children == null || children.isEmpty()) {
            return;
        }
        for (TreeNode child : children) {
            indexRecursive(node, child, byId, parentById);
        }
    }
}
