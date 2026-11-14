package org.apache.datawise.backend.jdbc.execution;

import org.apache.datawise.backend.jdbc.stream.ResultStreamCallback;
import org.apache.datawise.backend.jdbc.support.ResultSetColumnMapper;
import org.apache.datawise.backend.jdbc.support.SqlExecutionTracker;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Locale;

/**
 * MetaForge A1：Forward-only ResultSet 流式推送，可选挂 {@link SqlExecutionTracker} 供取消。
 */
public final class JdbcResultStreamer {

    public static final int DEFAULT_FETCH_SIZE = 1000;

    private JdbcResultStreamer() {
    }

    public static long streamQuery(
            Connection connection,
            String sql,
            String dbType,
            ResultStreamCallback callback
    ) throws SQLException {
        return streamQuery(connection, sql, dbType, callback, null, null);
    }

    /**
     * @return number of rows delivered to {@link ResultStreamCallback#onRow}
     */
    public static long streamQuery(
            Connection connection,
            String sql,
            String dbType,
            ResultStreamCallback callback,
            String executionKey,
            SqlExecutionTracker tracker
    ) throws SQLException {
        if (connection == null) {
            throw new IllegalArgumentException("connection is required");
        }
        if (sql == null || sql.isBlank()) {
            throw new IllegalArgumentException("sql is required");
        }
        if (callback == null) {
            throw new IllegalArgumentException("callback is required");
        }
        boolean tracked = executionKey != null && tracker != null;
        try (Statement statement = connection.createStatement(
                ResultSet.TYPE_FORWARD_ONLY,
                ResultSet.CONCUR_READ_ONLY
        )) {
            applyFetchSize(statement, dbType);
            if (tracked) {
                tracker.register(executionKey, statement, connection);
            }
            try {
                callback.onStatement(statement);
                boolean hasResult = statement.execute(sql.trim());
                if (!hasResult) {
                    callback.onSchema(java.util.List.of());
                    return 0L;
                }
                try (ResultSet rs = statement.getResultSet()) {
                    return drain(rs, callback);
                }
            } finally {
                if (tracked) {
                    tracker.unregister(executionKey, statement);
                }
            }
        }
    }

    static long drain(ResultSet rs, ResultStreamCallback callback) throws SQLException {
        var fields = ResultSetColumnMapper.buildFields(rs.getMetaData());
        callback.onSchema(ResultSetColumnMapper.toColumnMaps(fields));
        long count = 0L;
        while (rs.next()) {
            boolean cont = callback.onRow(ResultSetColumnMapper.readRow(rs, fields));
            count++;
            if (!cont) {
                break;
            }
        }
        return count;
    }

    /**
     * MySQL/MariaDB: {@link Integer#MIN_VALUE} enables true streaming.
     * PostgreSQL-family: prefer {@code autoCommit=false} at the connection layer; here we set a positive fetch size.
     */
    static void applyFetchSize(Statement statement, String dbType) throws SQLException {
        String type = dbType == null ? "" : dbType.toLowerCase(Locale.ROOT);
        if (type.contains("mysql") || type.contains("mariadb") || type.contains("tidb") || type.contains("oceanbase")) {
            statement.setFetchSize(Integer.MIN_VALUE);
            return;
        }
        statement.setFetchSize(DEFAULT_FETCH_SIZE);
    }
}
