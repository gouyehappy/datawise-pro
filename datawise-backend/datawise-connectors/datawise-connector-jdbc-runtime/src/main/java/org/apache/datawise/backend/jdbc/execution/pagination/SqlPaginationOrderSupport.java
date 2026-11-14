package org.apache.datawise.backend.jdbc.execution.pagination;

import java.util.regex.Pattern;

/** 分页前补全 {@code ORDER BY} 的共用逻辑。 */
final class SqlPaginationOrderSupport {

    private static final Pattern ORDER_BY = Pattern.compile("\\border\\s+by\\b", Pattern.CASE_INSENSITIVE);

    private SqlPaginationOrderSupport() {
    }

    static boolean hasOrderBy(String sql) {
        return sql != null && ORDER_BY.matcher(sql).find();
    }

    static String ensureOrderBy(String sql, String orderClause) {
        if (orderClause == null || orderClause.isBlank()) {
            return sql;
        }
        if (!hasOrderBy(sql)) {
            return sql + orderClause;
        }
        return sql;
    }
}
