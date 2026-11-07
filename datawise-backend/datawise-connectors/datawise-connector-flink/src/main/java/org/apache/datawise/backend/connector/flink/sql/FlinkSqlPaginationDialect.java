package org.apache.datawise.backend.connector.flink.sql;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.jdbc.execution.SqlPaginationClauseSupport;
import org.apache.datawise.backend.sql.spi.SqlPaginationDialect;

/** Flink / Flink：{@code OFFSET m LIMIT n}（不支持 {@code LIMIT n OFFSET m}）。 */
public final class FlinkSqlPaginationDialect implements SqlPaginationDialect {

    @Override
    public boolean supports(String dbType) {
        return DbType.FLINK.matches(dbType);
    }

    @Override
    public int priority() {
        return 24;
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
