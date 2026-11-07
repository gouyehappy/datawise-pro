package org.apache.datawise.backend.database.explorer;

import org.apache.datawise.backend.domain.TreeNode;

import java.util.ArrayList;
import java.util.List;

/** Tree node shaping helpers for explorer API responses. */
public final class ExplorerTreeSupport {

    private ExplorerTreeSupport() {
    }

    /** Strips table skeleton children and comments for lighter first-page table lists. */
    public static List<TreeNode> toSkeletonResponse(List<TreeNode> nodes) {
        if (nodes == null || nodes.isEmpty()) {
            return List.of();
        }
        List<TreeNode> slim = new ArrayList<>(nodes.size());
        for (TreeNode node : nodes) {
            if (node == null) {
                continue;
            }
            if ("load_more".equals(node.getType())) {
                slim.add(node);
                continue;
            }
            TreeNode copy = new TreeNode();
            copy.setId(node.getId());
            copy.setLabel(node.getLabel());
            copy.setType(node.getType());
            copy.setMeta(node.getMeta());
            copy.setExpanded(false);
            copy.setChildren(List.of());
            slim.add(copy);
        }
        return slim;
    }
}
