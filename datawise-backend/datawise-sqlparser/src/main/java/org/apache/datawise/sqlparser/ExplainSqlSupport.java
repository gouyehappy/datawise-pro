package org.apache.datawise.sqlparser;

import org.apache.datawise.sqlparser.support.SqlTextSupport;

import java.util.Locale;

/** Dialect-specific EXPLAIN prefix for SQL review / plan inspection. */
public final class ExplainSqlSupport {

    private ExplainSqlSupport() {
    }

    public static String wrapExplain(String sql, String dbType) {
        String normalized = dbType == null ? "" : dbType.trim().toLowerCase(Locale.ROOT);
        String trimmed = SqlTextSupport.stripTrailingSemicolon(sql);
        if (trimmed.isBlank()) {
            return null;
        }
        return switch (normalized) {
            case "postgresql", "kingbase", "greenplum", "opengauss" -> "EXPLAIN (FORMAT JSON) " + trimmed;
            case "sqlite" -> "EXPLAIN QUERY PLAN " + trimmed;
            case "mysql", "mariadb" -> "EXPLAIN " + trimmed;
            default -> null;
        };
    }
}
