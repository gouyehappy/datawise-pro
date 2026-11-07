package org.apache.datawise.backend.jdbc.execution.pagination;

import org.apache.datawise.backend.jdbc.execution.SqlPaginationClauseSupport;
import org.apache.datawise.backend.sql.spi.SqlPaginationDialect;

public abstract class AbstractSqlPaginationDialect implements SqlPaginationDialect {

    @Override
    public final String applyLimitOffset(String sql, int limit, int offset) {
        SqlPaginationClauseSupport.validateLimitOffset(limit, offset);
        String body = prepareSqlBody(SqlPaginationClauseSupport.normalizeBody(sql));
        return SqlPaginationClauseSupport.appendClause(body, paginationClause(limit, offset));
    }

    protected String prepareSqlBody(String sql) {
        return sql;
    }

    protected abstract String paginationClause(int limit, int offset);
}
