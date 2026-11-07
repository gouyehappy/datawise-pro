package org.apache.datawise.backend.database.federated;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.sql.spi.SqlPaginationService;
import org.apache.datawise.sqlparser.SqlTransformOps;
import org.apache.datawise.sqlparser.support.SqlPaginationSupport;

/**
 * Rewrites federated source subqueries with a bounded window ({@code LIMIT maxRows OFFSET offset}).
 */
public final class FederatedSourceSqlSupport {

    private FederatedSourceSqlSupport() {
    }

    public static String applySourceWindow(String sql, int limit, int offset) {
        return applySourceWindow(sql, null, limit, offset, null);
    }

    public static String applySourceWindow(
            String sql,
            String dbType,
            int limit,
            int offset,
            SqlPaginationService paginationService
    ) {
        if (offset <= 0) {
            return sql;
        }
        SqlPaginationSupport.validateLimitOffset(limit, offset);
        if (paginationService != null && dbType != null && !dbType.isBlank()) {
            return paginationService.applyLimitOffset(sql, DbType.normalizeId(dbType), limit, offset);
        }
        return SqlTransformOps.limitOffset(sql, limit, offset);
    }
}
