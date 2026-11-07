package org.apache.datawise.backend.jdbc.execution;

import org.apache.datawise.sqlparser.support.SqlPaginationSupport;

/** @deprecated use {@link SqlPaginationSupport} in datawise-sqlparser. */
@Deprecated
public final class SqlPaginationClauseSupport {

    private SqlPaginationClauseSupport() {
    }

    public static String normalizeBody(String sql) {
        return SqlPaginationSupport.normalizeBody(sql);
    }

    public static void validateLimitOffset(int limit, int offset) {
        SqlPaginationSupport.validateLimitOffset(limit, offset);
    }

    public static String appendClause(String sql, String clause) {
        return SqlPaginationSupport.appendClause(sql, clause);
    }

    public static boolean canAppendLimitDirectly(String sql) {
        return SqlPaginationSupport.canAppendLimitDirectly(sql);
    }
}
