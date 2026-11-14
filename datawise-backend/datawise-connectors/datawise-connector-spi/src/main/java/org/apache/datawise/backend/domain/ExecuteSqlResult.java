package org.apache.datawise.backend.domain;

import java.util.List;
import java.util.Map;

/**
 * SQL 执行结果。扁平字段始终表示「主结果」（通常为第一个结果集）。
 * T-MULTI-1：当一次 JDBC execute 产生多个 ResultSet / updateCount 时，
 * {@link #resultSets} 含全部叶子结果（每项的 {@code resultSets} 为 null）；单结果时为 null。
 * {@link #queryId} 为取消登记 ID（仅当本次执行挂了 {@code SqlExecutionTracker} 时非空）。
 */
public record ExecuteSqlResult(
        String sql,
        int rowCount,
        long durationMs,
        List<Map<String, Object>> columns,
        List<Map<String, Object>> rows,
        String where,
        String orderBy,
        String cursorId,
        Boolean hasMore,
        Integer pageOffset,
        Integer pageSize,
        List<ExecuteSqlResult> resultSets,
        String queryId
) {
    /** 兼容既有 11 参构造（无多结果集、无 queryId）。 */
    public ExecuteSqlResult(
            String sql,
            int rowCount,
            long durationMs,
            List<Map<String, Object>> columns,
            List<Map<String, Object>> rows,
            String where,
            String orderBy,
            String cursorId,
            Boolean hasMore,
            Integer pageOffset,
            Integer pageSize
    ) {
        this(sql, rowCount, durationMs, columns, rows, where, orderBy, cursorId, hasMore, pageOffset, pageSize, null, null);
    }

    /** 兼容既有 12 参构造（无 queryId）。 */
    public ExecuteSqlResult(
            String sql,
            int rowCount,
            long durationMs,
            List<Map<String, Object>> columns,
            List<Map<String, Object>> rows,
            String where,
            String orderBy,
            String cursorId,
            Boolean hasMore,
            Integer pageOffset,
            Integer pageSize,
            List<ExecuteSqlResult> resultSets
    ) {
        this(sql, rowCount, durationMs, columns, rows, where, orderBy, cursorId, hasMore, pageOffset, pageSize, resultSets, null);
    }

    public ExecuteSqlResult withQueryId(String queryId) {
        return new ExecuteSqlResult(
                sql,
                rowCount,
                durationMs,
                columns,
                rows,
                where,
                orderBy,
                cursorId,
                hasMore,
                pageOffset,
                pageSize,
                resultSets,
                queryId
        );
    }
}
