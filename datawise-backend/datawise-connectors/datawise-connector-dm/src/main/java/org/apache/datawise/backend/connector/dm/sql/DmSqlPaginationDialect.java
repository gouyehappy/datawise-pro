package org.apache.datawise.backend.connector.dm.sql;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.jdbc.execution.pagination.OrderByOffsetFetchSqlPaginationDialect;

/** Dameng {@code OFFSET n ROWS FETCH NEXT m ROWS ONLY} (Oracle-compatible). */
public final class DmSqlPaginationDialect extends OrderByOffsetFetchSqlPaginationDialect {

    @Override
    public boolean supports(String dbType) {
        return DbType.isDmFamily(dbType);
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
