package org.apache.datawise.backend.jdbc.execution.pagination;

import org.apache.datawise.backend.jdbc.execution.SqlPaginationClauseSupport;

/**
 * Oracle 分页实现：
 * <ul>
 *   <li>统一 {@code ORDER BY ROWID}，避免 CLOB 列触发 ORA-00932，且首屏/续页顺序一致</li>
 *   <li>首屏（offset=0）用 {@code ROWNUM} 子查询，兼容 11g</li>
 *   <li>续页用 12c+ {@code OFFSET/FETCH}</li>
 * </ul>
 */
public final class OracleSqlPaginationSupport {

    /** 不依赖列类型，恒可排序。 */
    public static final String STABLE_ORDER_CLAUSE = " ORDER BY ROWID";

    private OracleSqlPaginationSupport() {
    }

    public static String applyLimitOffset(String sql, int limit, int offset) {
        SqlPaginationClauseSupport.validateLimitOffset(limit, offset);
        String body = SqlPaginationClauseSupport.normalizeBody(sql);
        String ordered = SqlPaginationOrderSupport.ensureOrderBy(body, STABLE_ORDER_CLAUSE);
        if (offset <= 0) {
            return "SELECT * FROM (SELECT * FROM (" + ordered + ") WHERE ROWNUM <= " + limit + ")";
        }
        return SqlPaginationClauseSupport.appendClause(
                ordered,
                " OFFSET " + offset + " ROWS FETCH NEXT " + limit + " ROWS ONLY"
        );
    }
}
