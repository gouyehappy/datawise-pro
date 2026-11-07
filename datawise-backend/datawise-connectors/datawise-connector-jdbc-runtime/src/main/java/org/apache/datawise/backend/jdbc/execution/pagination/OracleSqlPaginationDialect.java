package org.apache.datawise.backend.jdbc.execution.pagination;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.sql.spi.SqlPaginationDialect;
import org.springframework.stereotype.Component;

/** Oracle 分页方言（classpath 内置 + 插件可覆盖 priority）。 */
@Component
public class OracleSqlPaginationDialect implements SqlPaginationDialect {

    @Override
    public boolean supports(String dbType) {
        return DbType.ORACLE.matches(dbType);
    }

    @Override
    public int priority() {
        return 20;
    }

    @Override
    public String applyLimitOffset(String sql, int limit, int offset) {
        return OracleSqlPaginationSupport.applyLimitOffset(sql, limit, offset);
    }
}
