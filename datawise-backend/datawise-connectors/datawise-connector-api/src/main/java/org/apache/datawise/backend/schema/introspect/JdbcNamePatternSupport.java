package org.apache.datawise.backend.schema.introspect;

import org.apache.datawise.backend.domain.TreeNode;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/** Shared name-pattern helpers for Explorer object listing. */
public final class JdbcNamePatternSupport {

    private JdbcNamePatternSupport() {
    }

    public static boolean hasNamePattern(String namePattern) {
        return namePattern != null && !namePattern.isBlank() && !"*".equals(namePattern.trim());
    }

    /** Convert UI wildcard pattern to SQL {@code LIKE} ({@code *} → {@code %}). */
    public static String toSqlLikePattern(String namePattern) {
        if (!hasNamePattern(namePattern)) {
            return null;
        }
        return namePattern.trim().replace("*", "%");
    }

    /** Convert UI wildcard pattern to JDBC {@link java.sql.DatabaseMetaData} table name pattern. */
    public static String toJdbcTableNamePattern(String namePattern) {
        String like = toSqlLikePattern(namePattern);
        return like != null ? like : "%";
    }

    public static List<TreeNode> filterByLabelPattern(List<TreeNode> nodes, String namePattern) {
        if (nodes == null || nodes.isEmpty() || !hasNamePattern(namePattern)) {
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
}
