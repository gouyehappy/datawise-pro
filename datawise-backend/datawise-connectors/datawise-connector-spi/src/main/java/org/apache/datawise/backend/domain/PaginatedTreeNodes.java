package org.apache.datawise.backend.domain;

import java.util.ArrayList;
import java.util.List;

/** Explorer table folder page: nodes plus pagination cursor. */
public record PaginatedTreeNodes(List<TreeNode> nodes, boolean hasMore, int nextOffset) {

    public PaginatedTreeNodes {
        nodes = nodes != null ? List.copyOf(nodes) : List.of();
    }

    public static PaginatedTreeNodes empty() {
        return new PaginatedTreeNodes(List.of(), false, 0);
    }

    public static PaginatedTreeNodes slice(List<TreeNode> all, int offset, int limit) {
        if (all == null || all.isEmpty() || offset >= all.size()) {
            return empty();
        }
        int end = Math.min(all.size(), offset + Math.max(1, limit));
        boolean hasMore = end < all.size();
        return new PaginatedTreeNodes(all.subList(offset, end), hasMore, end);
    }

    /**
     * Page built from SQL {@code OFFSET … FETCH …} (or equivalent): rows are already windowed;
     * an extra probe row may be present to detect {@code hasMore}.
     */
    public static PaginatedTreeNodes fromSqlOffsetPage(List<TreeNode> rows, int pageOffset, int pageSize) {
        if (rows == null || rows.isEmpty()) {
            return empty();
        }
        int limit = Math.max(1, pageSize);
        boolean hasMore = rows.size() > limit;
        List<TreeNode> nodes = hasMore ? List.copyOf(rows.subList(0, limit)) : rows;
        return new PaginatedTreeNodes(nodes, hasMore, pageOffset + nodes.size());
    }

    public List<TreeNode> appendLoadMoreNode(String loadMoreNodeId, String label) {
        if (!hasMore) {
            return nodes;
        }
        List<TreeNode> merged = new ArrayList<>(nodes);
        TreeNode loadMore = new TreeNode();
        loadMore.setId(loadMoreNodeId);
        loadMore.setLabel(label);
        loadMore.setType("load_more");
        loadMore.setMeta(String.valueOf(nextOffset));
        loadMore.setExpanded(false);
        loadMore.setChildren(List.of());
        merged.add(loadMore);
        return merged;
    }

    public record Pagination(boolean hasMore, int nextOffset) {
    }

    public static Pagination paginationOf(List<TreeNode> nodes) {
        if (nodes == null || nodes.isEmpty()) {
            return new Pagination(false, 0);
        }
        for (TreeNode node : nodes) {
            if (node != null && "load_more".equals(node.getType())) {
                int offset = 0;
                if (node.getMeta() != null && !node.getMeta().isBlank()) {
                    try {
                        offset = Integer.parseInt(node.getMeta().trim());
                    } catch (NumberFormatException ignored) {
                        offset = 0;
                    }
                }
                return new Pagination(true, offset);
            }
        }
        return new Pagination(false, nodes.size());
    }
}
