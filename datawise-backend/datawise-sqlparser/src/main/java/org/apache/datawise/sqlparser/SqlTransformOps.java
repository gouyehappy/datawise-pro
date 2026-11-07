package org.apache.datawise.sqlparser;

import net.sf.jsqlparser.JSQLParserException;
import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.sqlparser.handle.CountWrapHandler;
import org.apache.datawise.sqlparser.handle.KeysetSeekHandler;
import org.apache.datawise.sqlparser.handle.OrderByHandler;
import org.apache.datawise.sqlparser.handle.SelectStarReplaceHandler;
import org.apache.datawise.sqlparser.handle.WhereConditionHandler;
import org.apache.datawise.sqlparser.support.SqlPaginationSupport;
import org.apache.datawise.sqlparser.support.SqlTableSelectSupport;
import org.apache.datawise.sqlparser.support.SqlTextSupport;

import java.util.List;
import java.util.Locale;

/**
 * One-shot SQL transform helpers for connector / sync / database modules. Parses via AST handlers
 * when possible and falls back to legacy string assembly on parse failure.
 */
public final class SqlTransformOps {

    private SqlTransformOps() {
    }

    public static String appendWhere(String sql, String condition) {
        if (condition == null || condition.isBlank()) {
            return sql;
        }
        try {
            return SqlTransform.of(sql, DbType.MYSQL).appendWhere(condition.trim()).toSql();
        } catch (JSQLParserException ignored) {
            return sql + " WHERE " + condition.trim();
        }
    }

    public static String appendOrderByAsc(String sql, List<String> columns) {
        if (columns == null || columns.isEmpty()) {
            return sql;
        }
        String[] columnArray = columns.stream()
                .filter(column -> column != null && !column.isBlank())
                .map(String::trim)
                .toArray(String[]::new);
        if (columnArray.length == 0) {
            return sql;
        }
        try {
            return SqlTransform.of(sql, DbType.MYSQL).orderByAsc(columnArray).toSql();
        } catch (JSQLParserException ignored) {
            return legacyAppendOrderByAsc(sql, columnArray);
        }
    }

    public static String appendKeysetSeek(String sql, List<String> orderByColumns, List<String> lastValues) {
        if (sql == null || sql.isBlank() || orderByColumns == null || orderByColumns.isEmpty()) {
            return sql;
        }
        if (lastValues == null || lastValues.isEmpty()) {
            return sql;
        }
        try {
            return SqlTransform.of(sql, DbType.MYSQL)
                    .apply(new KeysetSeekHandler(orderByColumns, lastValues))
                    .toSql();
        } catch (JSQLParserException | IllegalArgumentException ignored) {
            return legacyAppendAndPredicate(sql, KeysetSeekHandler.buildLexicographicGreaterPredicate(orderByColumns, lastValues));
        }
    }

    public static String limitIfAbsent(String sql, long maxRows) {
        try {
            return SqlTransform.of(sql, DbType.MYSQL).limitIfAbsent(maxRows).toSql();
        } catch (JSQLParserException ignored) {
            if (sql != null && !sql.toUpperCase(Locale.ROOT).contains(" LIMIT ")) {
                return sql.trim() + " LIMIT " + maxRows;
            }
            return sql;
        }
    }

    /** AST rewrite when possible; otherwise append dialect-neutral {@code LIMIT … OFFSET …}. */
    public static String limitOffset(String sql, long limit, long offset) {
        SqlPaginationSupport.validateLimitOffset(Math.toIntExact(limit), Math.toIntExact(offset));
        try {
            return SqlTransform.of(sql, DbType.MYSQL).limitOffset(limit, offset).toSql();
        } catch (JSQLParserException ignored) {
            String clause = offset > 0
                    ? " LIMIT " + limit + " OFFSET " + offset
                    : " LIMIT " + limit;
            return SqlPaginationSupport.appendClause(sql, clause);
        }
    }

    public static String wrapCount(String sql) {
        if (sql == null || sql.isBlank()) {
            return sql;
        }
        try {
            String transformed = SqlTransform.of(sql, DbType.MYSQL).apply(new CountWrapHandler()).toSql();
            if (!transformed.equalsIgnoreCase(sql.trim())) {
                return transformed;
            }
        } catch (JSQLParserException ignored) {
            // fall through
        }
        if (sql.replaceAll("\\s+", " ").trim().matches("(?i)SELECT\\s+\\*\\s+FROM\\s+.+")) {
            return sql.replaceFirst("(?i)SELECT\\s+\\*", "SELECT COUNT(*)");
        }
        return CountWrapHandler.wrapCountSubquery(sql);
    }

    public static String applyLimitOffset(String sql, String clause) {
        return SqlPaginationSupport.appendClause(sql, clause);
    }

    public static String stripComments(String sql) {
        return SqlTextSupport.stripComments(sql);
    }

    public static String normalizeSql(String sql) {
        return SqlTextSupport.normalizeForClassification(sql);
    }

    public static String firstStatement(String sql) {
        return SqlTextSupport.firstStatement(sql);
    }

    public static String wrapExplain(String sql, String dbType) {
        return ExplainSqlSupport.wrapExplain(sql, dbType);
    }

    public static String buildSelectAll(String dbTypeId, String database, String tableName) {
        return SqlTableSelectSupport.buildSelectAll(dbTypeId, database, tableName);
    }

    public static String selectAllFrom(String fromItem) {
        return SqlTableSelectSupport.selectAllFrom(fromItem);
    }

    public static String selectAllFrom(String fromItem, String dbTypeId) {
        return SqlTableSelectSupport.selectAllFrom(fromItem, dbTypeId);
    }

    public static String replaceSelectStar(String sql, String... columns) {
        if (columns == null || columns.length == 0) {
            return sql;
        }
        try {
            return SqlTransform.of(sql, DbType.MYSQL)
                    .apply(new SelectStarReplaceHandler(columns))
                    .toSql();
        } catch (JSQLParserException ignored) {
            return sql.replaceFirst("(?i)SELECT\\s+\\*", "SELECT " + String.join(", ", columns));
        }
    }

    private static String legacyAppendOrderByAsc(String sql, String... columns) {
        String lower = sql.toLowerCase();
        if (lower.contains(" order by ")) {
            return sql;
        }
        StringBuilder orderBy = new StringBuilder(" ORDER BY ");
        for (int i = 0; i < columns.length; i++) {
            if (i > 0) {
                orderBy.append(", ");
            }
            orderBy.append(columns[i]).append(" ASC");
        }
        return sql + orderBy;
    }

    private static String legacyAppendAndPredicate(String sql, String predicate) {
        String lower = sql.toLowerCase();
        int orderByIndex = lower.lastIndexOf(" order by ");
        String head = orderByIndex >= 0 ? sql.substring(0, orderByIndex) : sql;
        String tail = orderByIndex >= 0 ? sql.substring(orderByIndex) : "";
        String separator = head.toLowerCase().contains(" where ") ? " AND " : " WHERE ";
        return head + separator + predicate + tail;
    }
}
