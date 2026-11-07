package org.apache.datawise.backend.schema.introspect;

import org.apache.datawise.backend.domain.PaginatedTreeNodes;
import org.apache.datawise.backend.domain.TreeNode;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;

/**
 * Runs a single-column name query with SQL offset/limit probing ({@code pageSize + 1} rows).
 */
public final class JdbcPagedNameQuerySupport {

    public enum PageSyntax {
        /** {@code … LIMIT ? OFFSET ?} */
        LIMIT_OFFSET,
        /** {@code … OFFSET ? ROWS FETCH NEXT ? ROWS ONLY} */
        OFFSET_FETCH,
        /** Trino/Presto: {@code … OFFSET ? LIMIT ?} */
        OFFSET_LIMIT
    }

    private JdbcPagedNameQuerySupport() {
    }

    public static PaginatedTreeNodes queryPagedNames(
                                                     Connection connection,
                                                     String orderedSqlWithoutPageClause,
                                                     PageSyntax syntax,
                                                     ScopeBinder scopeBinder,
                                                     int offset,
                                                     int limit,
                                                     Function<List<String>, List<TreeNode>> toNodes) throws SQLException {
        int pageSize = Math.max(1, limit);
        int probeLimit = pageSize + 1;
        int pageOffset = Math.max(0, offset);
        String sql = orderedSqlWithoutPageClause + pageClause(syntax);
        List<String> names = new ArrayList<>();
        try (PreparedStatement ps = connection.prepareStatement(sql)) {
            int next = scopeBinder.bind(ps, 1);
            bindPageParams(ps, next, syntax, probeLimit, pageOffset);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    String name = rs.getString(1);
                    if (name != null && !name.isBlank()) {
                        names.add(name.trim());
                    }
                }
            }
        }
        List<TreeNode> nodes = toNodes.apply(names);
        return PaginatedTreeNodes.fromSqlOffsetPage(nodes, pageOffset, pageSize);
    }

    private static String pageClause(PageSyntax syntax) {
        return switch (syntax) {
            case LIMIT_OFFSET -> " LIMIT ? OFFSET ?";
            case OFFSET_FETCH -> " OFFSET ? ROWS FETCH NEXT ? ROWS ONLY";
            case OFFSET_LIMIT -> " OFFSET ? LIMIT ?";
        };
    }

    private static void bindPageParams(
                                       PreparedStatement ps,
                                       int startParam,
                                       PageSyntax syntax,
                                       int probeLimit,
                                       int offset) throws SQLException {
        int param = startParam;
        switch (syntax) {
            case LIMIT_OFFSET -> {
                ps.setInt(param++, probeLimit);
                ps.setInt(param, offset);
            }
            case OFFSET_FETCH, OFFSET_LIMIT -> {
                ps.setInt(param++, offset);
                ps.setInt(param, probeLimit);
            }
        }
    }

    @FunctionalInterface
    public interface ScopeBinder {

        /** Bind scope/pattern params starting at {@code startParam}; return next param index. */
        int bind(PreparedStatement ps, int startParam) throws SQLException;
    }
}
