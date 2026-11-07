package org.apache.datawise.backend.connector.hive.sql;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.jdbc.execution.SqlPaginationClauseSupport;
import org.apache.datawise.backend.sql.spi.SqlPaginationDialect;

/** Hive：{@code LIMIT n} 或 {@code LIMIT n OFFSET m}（Hive 2.0+）。 */
public final class HiveSqlPaginationDialect implements SqlPaginationDialect {

    @Override
    public boolean supports(String dbType) {
        return DbType.HIVE.id().equals(DbType.normalizeId(dbType));
    }

    @Override
    public int priority() {
        return 13;
    }

    @Override
    public String applyLimitOffset(String sql, int limit, int offset) {
        SqlPaginationClauseSupport.validateLimitOffset(limit, offset);
        String clause = offset <= 0
                ? " LIMIT " + limit
                : " LIMIT " + limit + " OFFSET " + offset;
        return SqlPaginationClauseSupport.appendClause(sql, clause);
    }
}
