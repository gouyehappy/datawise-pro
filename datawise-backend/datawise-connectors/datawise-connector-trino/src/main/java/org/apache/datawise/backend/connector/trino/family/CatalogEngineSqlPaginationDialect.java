package org.apache.datawise.backend.connector.trino.family;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.jdbc.execution.SqlPaginationClauseSupport;
import org.apache.datawise.backend.sql.spi.SqlPaginationDialect;

/** Trino / Presto：{@code OFFSET m LIMIT n}（不支持 {@code LIMIT n OFFSET m}）。 */
public class CatalogEngineSqlPaginationDialect implements SqlPaginationDialect {

    private final DbType dbType;
    private final int priority;

    public CatalogEngineSqlPaginationDialect(DbType dbType, int priority) {
        this.dbType = dbType;
        this.priority = priority;
    }

    @Override
    public boolean supports(String dbType) {
        return this.dbType.id().equals(DbType.normalizeId(dbType));
    }

    @Override
    public int priority() {
        return priority;
    }

    @Override
    public String applyLimitOffset(String sql, int limit, int offset) {
        SqlPaginationClauseSupport.validateLimitOffset(limit, offset);
        String clause = offset <= 0
                ? " LIMIT " + limit
                : " OFFSET " + offset + " LIMIT " + limit;
        return SqlPaginationClauseSupport.appendClause(sql, clause);
    }
}
