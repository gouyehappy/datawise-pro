package org.apache.datawise.backend.jdbc.execution;

import org.apache.datawise.backend.jdbc.execution.pagination.SqlPaginationBuiltinDialects;
import org.apache.datawise.backend.sql.spi.SqlPaginationService;

/** 无 Spring 容器时的分页回退。 */
final class FallbackSqlPaginationService implements SqlPaginationService {

    static final SqlPaginationService INSTANCE = new FallbackSqlPaginationService();

    private FallbackSqlPaginationService() {
    }

    @Override
    public String applyLimitOffset(String sql, String dbType, int limit, int offset) {
        return SqlPaginationBuiltinDialects.resolve(dbType).applyLimitOffset(sql, limit, offset);
    }
}
