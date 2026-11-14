package org.apache.datawise.backend.schema.spi;

import org.apache.datawise.backend.domain.PaginatedTreeNodes;
import org.apache.datawise.backend.domain.TreeNode;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/** Shared helpers for Explorer object listing SPIs. */
public final class ExplorerListings {

    /**
     * Hard cap after name filter for full-list-then-page connectors.
     * Protects response/pagination paths; SPI {@code list*} may still materialize larger lists.
     */
    public static final int FULL_LIST_HARD_CAP = 10_000;

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

    /** Full list → optional name filter → hard cap → in-memory page slice (fallback when SQL paging absent). */
    public static PaginatedTreeNodes sliceFullList(List<TreeNode> all, int offset, int limit, String namePattern) {
        List<TreeNode> filtered = filterByLabelPattern(all, namePattern);
        boolean capped = filtered.size() > FULL_LIST_HARD_CAP;
        if (capped) {
            filtered = new ArrayList<>(filtered.subList(0, FULL_LIST_HARD_CAP));
        }
        PaginatedTreeNodes page = PaginatedTreeNodes.slice(filtered, offset, limit);
        if (capped && !page.hasMore() && !page.nodes().isEmpty()) {
            // Cap hit on last in-memory page: signal more objects exist beyond the hard limit.
            return new PaginatedTreeNodes(page.nodes(), true, page.nextOffset());
        }
        return page;
    }
}
