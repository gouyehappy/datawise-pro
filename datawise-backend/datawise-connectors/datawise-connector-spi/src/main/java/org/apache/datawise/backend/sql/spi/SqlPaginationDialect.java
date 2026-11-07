package org.apache.datawise.backend.sql.spi;

/** 方言分页 SQL 拼装 SPI（LIMIT / OFFSET 顺序因引擎而异）。 */
public interface SqlPaginationDialect {

    boolean supports(String dbType);

    default int priority() {
        return 100;
    }

    String applyLimitOffset(String sql, int limit, int offset);
}
