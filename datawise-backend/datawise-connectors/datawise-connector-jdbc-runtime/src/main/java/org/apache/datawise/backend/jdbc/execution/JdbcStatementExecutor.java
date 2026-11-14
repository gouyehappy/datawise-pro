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
import java.util.ArrayList;
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
     * T-MULTI-1：排空全部 JDBC 结果集 / updateCount。
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
        int effectiveMaxRows = maxRows > 0 ? maxRows : JdbcResultSetMapper.SAFETY_MAX_ROWS;
        boolean tracked = executionKey != null && tracker != null;
        String queryId = null;
        try (Statement statement = connection.createStatement()) {
            poolProperties.applyPagedReadFetchSize(statement, effectiveMaxRows);
            statement.setMaxRows(effectiveMaxRows);
            applyQueryTimeout(statement);
            if (tracked) {
                queryId = tracker.register(executionKey, statement, connection);
            }
            try {
                boolean hasResultSet = statement.execute(trimmed);
                List<ExecuteSqlResult> parts = drainAllJdbcResults(statement, trimmed, effectiveMaxRows, hasResultSet);
                long duration = System.currentTimeMillis() - start;
                ExecuteSqlResult result = assembleMultiResult(parts, duration);
                return queryId != null ? result.withQueryId(queryId) : result;
            } finally {
                if (tracked) {
                    tracker.unregister(executionKey, statement);
                }
            }
        }
    }

    /**
     * Classic JDBC drain: ResultSet → getMoreResults → updateCount → … until both exhausted.
     */
    static List<ExecuteSqlResult> drainAllJdbcResults(
            Statement statement,
            String sql,
            int maxRows,
            boolean firstIsResultSet
    ) throws SQLException {
        List<ExecuteSqlResult> parts = new ArrayList<>();
        boolean isResultSet = firstIsResultSet;
        while (true) {
            if (isResultSet) {
                try (ResultSet rs = statement.getResultSet()) {
                    TableDataResult tableData = JdbcResultSetMapper.mapLimited(rs, maxRows);
                    parts.add(new ExecuteSqlResult(
                            sql,
                            tableData.rows().size(),
                            0L,
                            tableData.columns(),
                            tableData.rows(),
                            null,
                            null,
                            null,
                            null,
                            null,
                            null,
                            null
                    ));
                }
            } else {
                int affected = statement.getUpdateCount();
                if (affected == -1) {
                    break;
                }
                parts.add(new ExecuteSqlResult(
                        sql,
                        Math.max(affected, 0),
                        0L,
                        List.of(),
                        List.of(),
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null
                ));
            }
            isResultSet = statement.getMoreResults();
        }
        if (parts.isEmpty()) {
            parts.add(new ExecuteSqlResult(sql, 0, 0L, List.of(), List.of(), null, null, null, null, null, null, null));
        }
        return parts;
    }

    static ExecuteSqlResult assembleMultiResult(List<ExecuteSqlResult> parts, long durationMs) {
        if (parts == null || parts.isEmpty()) {
            return new ExecuteSqlResult("", 0, durationMs, List.of(), List.of(), null, null, null, null, null, null, null);
        }
        List<ExecuteSqlResult> leaves = new ArrayList<>(parts.size());
        for (ExecuteSqlResult part : parts) {
            leaves.add(withDurationLeaf(part, durationMs));
        }
        ExecuteSqlResult primary = leaves.get(0);
        if (leaves.size() == 1) {
            return primary;
        }
        return new ExecuteSqlResult(
                primary.sql(),
                primary.rowCount(),
                durationMs,
                primary.columns(),
                primary.rows(),
                primary.where(),
                primary.orderBy(),
                primary.cursorId(),
                primary.hasMore(),
                primary.pageOffset(),
                primary.pageSize(),
                List.copyOf(leaves),
                primary.queryId()
        );
    }

    private static ExecuteSqlResult withDurationLeaf(ExecuteSqlResult result, long durationMs) {
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
                result.pageSize(),
                null,
                result.queryId()
        );
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
        int seconds = org.apache.datawise.backend.jdbc.support.QueryTimeoutOverride.resolve(queryTimeoutSeconds);
        if (seconds > 0) {
            statement.setQueryTimeout(seconds);
        }
    }

    /**
     * This executor runs a single JDBC statement. Multi-statement batches must be split
     * by the caller — otherwise trailing statements were silently ignored by the driver.
     *
     * <p>MySQL executable comments are expanded first: the server runs their body, so a
     * statement hidden inside one would otherwise slip past the splitter.
     */
    static void rejectMultiStatement(String sql) {
        List<String> parts = SqlTextSupport.splitStatements(SqlTextSupport.expandMysqlExecutableComments(sql));
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
                result.pageSize(),
                result.resultSets(),
                result.queryId()
        );
    }
}
