package org.apache.datawise.backend.schema.introspect.listing;

import org.apache.datawise.backend.domain.PaginatedTreeNodes;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.schema.introspect.ExplorerObjectNodeIds;
import org.apache.datawise.backend.schema.introspect.JdbcNamePatternSupport;
import org.apache.datawise.backend.schema.introspect.SchemaTreeBuilder;
import org.apache.datawise.backend.schema.spi.ExplorerPageRequest;
import org.apache.datawise.backend.schema.spi.FastTableLister;
import org.springframework.stereotype.Component;

import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;

@Component
public final class JdbcTableListingSupport {

    private final SchemaTreeBuilder treeBuilder;

    public JdbcTableListingSupport() {
        this(new SchemaTreeBuilder());
    }

    public JdbcTableListingSupport(SchemaTreeBuilder treeBuilder) {
        this.treeBuilder = treeBuilder != null ? treeBuilder : new SchemaTreeBuilder();
    }

    public PaginatedTreeNodes queryPagedTables(
                                               ExplorerPageRequest request,
                                               String sql,
                                               SqlParameterBinder binder) throws SQLException {
        int pageSize = Math.max(1, request.limit());
        int probeLimit = pageSize + 1;
        List<TreeNode> tables = new ArrayList<>();
        try (PreparedStatement ps = request.connection().prepareStatement(sql)) {
            binder.bind(ps, probeLimit, Math.max(0, request.offset()));
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    // Scope is already constrained in dialect SQL; do not post-filter system
                    // schemas here �?that underfills pages and corrupts hasMore.
                    tables.add(toTableNode(
                            request,
                            columnOrNull(rs, "table_schema"),
                            rs.getString("table_name"),
                            columnOrNull(rs, "table_comment")));
                }
            }
        }
        return PaginatedTreeNodes.fromSqlOffsetPage(tables, Math.max(0, request.offset()), pageSize);
    }

    TreeNode toTableNode(ExplorerPageRequest request, String tableName, String comment) {
        return toTableNode(request, null, tableName, comment);
    }

    TreeNode toTableNode(
                         ExplorerPageRequest request,
                         String tableSchema,
                         String tableName,
                         String comment) {
        String schema = tableSchema != null && !tableSchema.isBlank()
                ? tableSchema.trim()
                : request.schema();
        return buildTableNode(
                request.connectionId(),
                request.catalog(),
                schema,
                tableName,
                comment,
                request.skeleton());
    }

    public TreeNode buildTableNode(
                                   String connectionId,
                                   String catalog,
                                   String schema,
                                   String tableName,
                                   String comment,
                                   boolean skeleton) {
        TreeNode table = new TreeNode();
        table.setId(ExplorerObjectNodeIds.objectId("table", connectionId, catalog, schema, tableName));
        table.setLabel(tableName);
        table.setType("table");
        if (comment != null && !comment.isBlank()) {
            table.setComment(comment);
        }
        table.setExpanded(false);
        if (!skeleton) {
            if (schema != null && !schema.isBlank()) {
                table.setChildren(treeBuilder.buildTableSkeleton(connectionId, catalog, schema, tableName));
            } else {
                table.setChildren(treeBuilder.buildTableSkeleton(connectionId, catalog, tableName));
            }
        } else {
            table.setChildren(List.of());
        }
        return table;
    }

    public static String toSqlLikePattern(String namePattern) {
        return JdbcNamePatternSupport.toSqlLikePattern(namePattern);
    }

    /** Bind: scope [, pattern], LIMIT, OFFSET. */
    public static SqlParameterBinder bindLimitOffset(String scopeValue, String pattern) {
        return (ps, probeLimit, offset) -> {
            int param = 1;
            ps.setString(param++, scopeValue);
            if (pattern != null) {
                ps.setString(param++, pattern);
            }
            ps.setInt(param++, probeLimit);
            ps.setInt(param, offset);
        };
    }

    /** Bind: scope [, pattern], OFFSET, FETCH NEXT. */
    public static SqlParameterBinder bindOffsetFetch(String scopeValue, String pattern) {
        return (ps, probeLimit, offset) -> {
            int param = 1;
            ps.setString(param++, scopeValue);
            if (pattern != null) {
                ps.setString(param++, pattern);
            }
            ps.setInt(param++, offset);
            ps.setInt(param, probeLimit);
        };
    }

    private static String columnOrNull(ResultSet rs, String column) throws SQLException {
        try {
            return rs.getString(column);
        } catch (SQLException ignored) {
            return null;
        }
    }

    @FunctionalInterface
    public interface SqlParameterBinder {

        void bind(PreparedStatement ps, int probeLimit, int offset) throws SQLException;
    }
}
