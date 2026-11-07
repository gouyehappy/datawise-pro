package org.apache.datawise.backend.sql.spi;

/** 按 dbType 解析分页方言并拼装 LIMIT/OFFSET。 */
public interface SqlPaginationService {

    String applyLimitOffset(String sql, String dbType, int limit, int offset);
}
