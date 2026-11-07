package org.apache.datawise.backend.jdbc.execution.pagination;

import org.apache.datawise.backend.common.DbType;
import org.springframework.stereotype.Component;

/**
 * Dameng / DB2 等 schema-root（非 Oracle）默认分页。
 * 内置于 classpath，避免仅加载 JDBC 驱动却未装载 connector 插件时回退到 MySQL {@code LIMIT}。
 */
@Component
public final class SchemaRootSqlPaginationDialect extends OrderByOffsetFetchSqlPaginationDialect {

    @Override
    public boolean supports(String dbType) {
        return DbType.isSchemaRootFamily(dbType) && !DbType.ORACLE.matches(dbType);
    }

    @Override
    public int priority() {
        return 50;
    }

    @Override
    protected String paginationClause(int limit, int offset) {
        return " OFFSET " + offset + " ROWS FETCH NEXT " + limit + " ROWS ONLY";
    }
}
