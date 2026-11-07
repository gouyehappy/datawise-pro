package org.apache.datawise.backend.jdbc.execution.pagination;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.sql.spi.SqlPaginationDialect;
import org.springframework.stereotype.Component;

/** MySQL / PostgreSQL 等：{@code LIMIT n OFFSET m}。 */
@Component
public final class LimitOffsetSqlPaginationDialect extends AbstractSqlPaginationDialect implements SqlPaginationDialect {

    @Override
    public boolean supports(String dbType) {
        String normalized = DbType.normalizeId(dbType);
        return !DbType.isSqlServerFamily(normalized)
                && !DbType.isCatalogSchemaFamily(normalized)
                && !DbType.isSchemaRootFamily(normalized);
    }

    @Override
    public int priority() {
        return 100;
    }

    @Override
    protected String paginationClause(int limit, int offset) {
        return " LIMIT " + limit + " OFFSET " + offset;
    }
}
