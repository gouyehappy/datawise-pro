package org.apache.datawise.backend.sql.pagination;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.jdbc.execution.pagination.OrderByOffsetFetchSqlPaginationDialect;
import org.springframework.stereotype.Component;

/** SQL Server：{@code ORDER BY … OFFSET n ROWS FETCH NEXT m ROWS ONLY}（无 ORDER BY 时补 {@code ORDER BY 1}）。 */
@Component
public final class SqlServerSqlPaginationDialect extends OrderByOffsetFetchSqlPaginationDialect {

    @Override
    public boolean supports(String dbType) {
        return DbType.isSqlServerFamily(dbType);
    }

    @Override
    public int priority() {
        return 21;
    }

    @Override
    protected String paginationClause(int limit, int offset) {
        return " OFFSET " + offset + " ROWS FETCH NEXT " + limit + " ROWS ONLY";
    }
}
