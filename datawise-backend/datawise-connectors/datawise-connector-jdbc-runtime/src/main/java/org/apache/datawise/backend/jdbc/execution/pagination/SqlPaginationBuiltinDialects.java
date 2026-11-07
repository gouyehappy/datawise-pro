package org.apache.datawise.backend.jdbc.execution.pagination;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.sql.spi.SqlPaginationDialect;

/** 无 Spring / 无插件贡献时的内置分页方言解析。 */
public final class SqlPaginationBuiltinDialects {

    private static final LimitOffsetSqlPaginationDialect LIMIT = new LimitOffsetSqlPaginationDialect();
    private static final OracleSqlPaginationDialect ORACLE = new OracleSqlPaginationDialect();
    private static final SchemaRootSqlPaginationDialect SCHEMA_ROOT = new SchemaRootSqlPaginationDialect();

    private SqlPaginationBuiltinDialects() {
    }

    public static SqlPaginationDialect resolve(String dbType) {
        String normalized = DbType.normalizeId(dbType);
        if (DbType.ORACLE.matches(normalized)) {
            return ORACLE;
        }
        if (DbType.isSchemaRootFamily(normalized)) {
            return SCHEMA_ROOT;
        }
        return LIMIT;
    }
}
