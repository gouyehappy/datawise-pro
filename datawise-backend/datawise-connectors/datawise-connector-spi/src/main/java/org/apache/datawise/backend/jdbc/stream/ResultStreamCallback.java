package org.apache.datawise.backend.jdbc.stream;

import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;
import java.util.Map;

/**
 * MetaForge A1：查询结果流式回调。行以 Map 形式推送，避免整表驻留 {@code List}.
 * {@link #onStatement(Statement)} 供取消登记（可与 {@code SqlExecutionTracker} 合并）。
 */
@FunctionalInterface
public interface ResultStreamCallback {

    /** Invoked once with column metadata before the first row (may be empty). */
    default void onSchema(List<Map<String, Object>> columns) throws SQLException {
    }

    /** Invoked after the JDBC Statement is created so callers can register cancel hooks. */
    default void onStatement(Statement statement) throws SQLException {
    }

    /** One result row. Return {@code false} to stop streaming early. */
    boolean onRow(Map<String, Object> row) throws SQLException;
}
