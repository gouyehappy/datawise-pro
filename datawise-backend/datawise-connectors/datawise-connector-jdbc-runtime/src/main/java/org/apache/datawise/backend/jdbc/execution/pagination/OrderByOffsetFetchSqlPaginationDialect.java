package org.apache.datawise.backend.jdbc.execution.pagination;

import org.apache.datawise.backend.jdbc.execution.SqlPaginationClauseSupport;

/**
 * Oracle 12c+ / DB2 / Dameng {@code OFFSET … FETCH …} 分页。
 * 分页前补 {@code ORDER BY}，否则 Oracle ORA-00933。
 */
public abstract class OrderByOffsetFetchSqlPaginationDialect extends AbstractSqlPaginationDialect {

    @Override
    protected String prepareSqlBody(String sql) {
        return SqlPaginationOrderSupport.ensureOrderBy(sql, defaultOrderClause());
    }

    /** 无用户 ORDER BY 时的默认排序子句（含前导空格）。 */
    protected String defaultOrderClause() {
        return " ORDER BY 1";
    }
}
