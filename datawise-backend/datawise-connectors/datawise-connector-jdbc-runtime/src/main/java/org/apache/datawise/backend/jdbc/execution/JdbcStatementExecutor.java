package org.apache.datawise.backend.jdbc.execution;

import org.apache.datawise.backend.config.JdbcPoolProperties;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.domain.TableDataResult;
import org.apache.datawise.backend.domain.TableRowMutateResult;
import org.apache.datawise.backend.jdbc.support.SqlExecutionTracker;
import org.apache.datawise.sqlparser.support.SqlTextSupport;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;

/**
 * Executes SQL statements on an existing JDBC connection (no pool borrow/return).
 */
@Component
public class JdbcStatementExecutor {

    private final JdbcPoolProperties poolProperties;
    private final int queryTimeoutSeconds;

    public JdbcStatementExecutor(
            JdbcPoolProperties poolProperties,
            @Value("${datawise.query.timeout-seconds:0}") int queryTimeoutSeconds
    ) {
        this.poolProperties = poolProperties != null ? poolProperties : new JdbcPoolProperties();
        this.queryTimeoutSeconds = Math.max(0, queryTimeoutSeconds);
    }

    /** Runs one statement and maps SELECT result or update row count. */
    public ExecuteSqlResult executeOnConnection(Connection connection, String sql, int maxRows) throws SQLException {
        return executeOnConnection(connection, sql, maxRows, null, null);
    }

    /**
     * Same as {@link #executeOnConnection(Connection, String, int)} but registers statement for cancel API.
     */
    public ExecuteSqlResult executeOnConnection(
            Connection connection,
            String sql,
            int maxRows,
            String executionKey,
            SqlExecutionTracker tracker
    ) throws SQLException {
        long start = System.currentTimeMillis();
        String trimmed = sql != null ? sql.trim() : "";
        rejectMultiStatement(trimmed);
        Statement statement = connection.createStatement();
        int effectiveMaxRows = maxRows > 0 ? maxRows : JdbcResultSetMapper.SAFETY_MAX_ROWS;
        poolProperties.applyPagedReadFetchSize(statement, effectiveMaxRows);
        statement.setMaxRows(effectiveMaxRows);
        applyQueryTimeout(statement);
        if (executionKey != null && tracker != null) {
            tracker.register(executionKey, statement, connection);
        }
        try {
            boolean hasResult = statement.execute(trimmed);
            if (!hasResult) {
                long duration = System.currentTimeMillis() - start;
                int affected = statement.getUpdateCount();
                int rowCount = affected >= 0 ? affected : 0;
                return new ExecuteSqlResult(trimmed, rowCount, duration, List.of(), List.of(), null, null, null, null, null, null);
            }
            try (ResultSet rs = statement.getResultSet()) {
                TableDataResult tableData = JdbcResultSetMapper.mapLimited(rs, effectiveMaxRows);
                long duration = System.currentTimeMillis() - start;
                return new ExecuteSqlResult(
                        trimmed,
                        tableData.rows().size(),
                        duration,
                        tableData.columns(),
                        tableData.rows(),
                        null,
                        null,
                        null,
                        null,
                        null,
                        null
                );
            }
        } finally {
            if (executionKey != null && tracker != null) {
                tracker.unregister(executionKey, statement);
            }
            statement.close();
        }
    }

    /** Executes DML/DDL update and returns affected row count. */
    public TableRowMutateResult executeUpdate(Connection connection, String sql) throws SQLException {
        String trimmed = sql != null ? sql.trim() : "";
        if (trimmed.isEmpty()) {
            throw new IllegalArgumentException("SQL is required");
        }
        rejectMultiStatement(trimmed);
        try (Statement statement = connection.createStatement()) {
            applyQueryTimeout(statement);
            int affected = statement.executeUpdate(trimmed);
            return new TableRowMutateResult(affected, trimmed);
        }
    }

    void applyQueryTimeout(Statement statement) throws SQLException {
        if (queryTimeoutSeconds > 0) {
            statement.setQueryTimeout(queryTimeoutSeconds);
        }
    }

    /**
     * This executor runs a single JDBC statement. Multi-statement batches must be split
     * by the caller — otherwise trailing statements were silently ignored by the driver.
     */
    static void rejectMultiStatement(String sql) {
        List<String> parts = SqlTextSupport.splitStatements(sql);
        if (parts.size() > 1) {
            throw new IllegalArgumentException(
                    "Multiple SQL statements in one request are not supported; execute them one at a time"
            );
        }
    }

    /** Replaces execution duration with wall-clock time including connection borrow. */
    public static ExecuteSqlResult withWallClockDuration(ExecuteSqlResult result, long durationMs) {
        return new ExecuteSqlResult(
                result.sql(),
                result.rowCount(),
                durationMs,
                result.columns(),
                result.rows(),
                result.where(),
                result.orderBy(),
                result.cursorId(),
                result.hasMore(),
                result.pageOffset(),
                result.pageSize()
        );
    }
}
