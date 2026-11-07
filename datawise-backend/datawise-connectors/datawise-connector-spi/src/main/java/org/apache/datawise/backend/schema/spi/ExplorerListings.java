package org.apache.datawise.backend.schema.spi;

import org.apache.datawise.backend.domain.PaginatedTreeNodes;
import org.apache.datawise.backend.domain.TreeNode;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/** Shared helpers for Explorer object listing SPIs. */
public final class ExplorerListings {

    private ExplorerListings() {
    }

    public static List<TreeNode> filterByLabelPattern(List<TreeNode> nodes, String namePattern) {
        if (nodes == null || nodes.isEmpty()
                || namePattern == null || namePattern.isBlank() || "*".equals(namePattern.trim())) {
            return nodes != null ? nodes : List.of();
        }
        String regex = namePattern.trim().toLowerCase(Locale.ROOT).replace("*", ".*");
        Pattern compiled = Pattern.compile(regex);
        List<TreeNode> filtered = new ArrayList<>(nodes.size());
        for (TreeNode node : nodes) {
            if (node != null && node.getLabel() != null
                    && compiled.matcher(node.getLabel().toLowerCase(Locale.ROOT)).matches()) {
                filtered.add(node);
            }
        }
        return filtered;
    }

    /** Full list → optional name filter → in-memory page slice (fallback when SQL paging absent). */
    public static PaginatedTreeNodes sliceFullList(List<TreeNode> all, int offset, int limit, String namePattern) {
        return PaginatedTreeNodes.slice(filterByLabelPattern(all, namePattern), offset, limit);
    }
}
