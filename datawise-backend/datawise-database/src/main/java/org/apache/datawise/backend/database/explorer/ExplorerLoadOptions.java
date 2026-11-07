package org.apache.datawise.backend.database.explorer;

/**
 * Optional parameters for explorer {@code loadChildren} requests.
 */
public record ExplorerLoadOptions(
        String pattern,
        boolean refresh,
        Integer offset,
        Integer limit,
        boolean skeleton
) {
    public static ExplorerLoadOptions of(String pattern, boolean refresh) {
        return new ExplorerLoadOptions(pattern, refresh, null, null, true);
    }

    public static ExplorerLoadOptions of(
            String pattern,
            boolean refresh,
            Integer offset,
            Integer limit,
            boolean skeleton
    ) {
        return new ExplorerLoadOptions(pattern, refresh, offset, limit, skeleton);
    }

    public int resolvedOffset() {
        return offset != null && offset > 0 ? offset : 0;
    }

    public boolean isPagedTablesRequest() {
        return offset != null || limit != null;
    }
}
