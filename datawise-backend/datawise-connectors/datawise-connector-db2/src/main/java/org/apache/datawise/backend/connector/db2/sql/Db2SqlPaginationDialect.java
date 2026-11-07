package org.apache.datawise.backend.connector.db2.sql;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.jdbc.execution.pagination.OrderByOffsetFetchSqlPaginationDialect;

/** DB2 {@code OFFSET n ROWS FETCH NEXT m ROWS ONLY} (Oracle-compatible). */
public final class Db2SqlPaginationDialect extends OrderByOffsetFetchSqlPaginationDialect {

    @Override
    public boolean supports(String dbType) {
        return DbType.isDb2Family(dbType);
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
