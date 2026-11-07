package org.apache.datawise.backend.jdbc.support;

import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Tracks in-flight JDBC statements so console tabs can cancel running SQL.
 */
@Component
public class SqlExecutionTracker {

    private static final Logger log = LoggerFactory.getLogger(SqlExecutionTracker.class);

    private final ConcurrentHashMap<String, RunningExecution> running = new ConcurrentHashMap<>();

    public void register(String executionKey, Statement statement, Connection connection) {
        if (executionKey == null || executionKey.isBlank() || statement == null || connection == null) {
            return;
        }
        running.put(executionKey, new RunningExecution(statement, connection));
    }

    /** Removes registration only when {@code statement} is still the tracked instance. */
    public void unregister(String executionKey, Statement statement) {
        if (executionKey == null || executionKey.isBlank() || statement == null) {
            return;
        }
        running.computeIfPresent(executionKey, (key, existing) ->
                existing.statement() == statement ? null : existing
        );
    }

    public void unregister(String executionKey) {
        if (executionKey == null || executionKey.isBlank()) {
            return;
        }
        running.remove(executionKey);
    }

    public boolean hasRunningExecution(String executionKey) {
        return executionKey != null && running.containsKey(executionKey);
    }

    public CancelOutcome cancelQuery(String executionKey) {
        RunningExecution execution = running.get(executionKey);
        if (execution == null) {
            return CancelOutcome.notRunning();
        }
        try {
            execution.statement().cancel();
            // Soft cancel is best-effort; do not imply the slot is free for a new Run.
            return CancelOutcome.ok("Query cancel requested; statement may still be running");
        } catch (SQLException ex) {
            return CancelOutcome.failed(ex.getMessage());
        }
    }

    public CancelOutcome cancelConnection(String executionKey) {
        RunningExecution execution = running.remove(executionKey);
        if (execution == null) {
            return CancelOutcome.notRunning();
        }
        try {
            execution.statement().cancel();
        } catch (SQLException ex) {
            ExceptionLogging.recoverable(log, "Statement cancel before connection abort failed", ex);
        }
        try {
            // 连接可能是池化代理且正被执行线程占用：close() 仅归还池且非跨线程安全，
            // abort() 是 JDBC 定义的跨线程强制终止（Hikari 会将其从池中驱逐）
            execution.connection().abort(Runnable::run);
            return CancelOutcome.ok("Connection terminated");
        } catch (SQLException ex) {
            return CancelOutcome.failed(ex.getMessage());
        }
    }

    public record RunningExecution(Statement statement, Connection connection) {
    }

    public record CancelOutcome(boolean cancelled, String message) {
        public static CancelOutcome ok(String message) {
            return new CancelOutcome(true, message);
        }

        public static CancelOutcome notRunning() {
            return new CancelOutcome(false, "No SQL is currently running in this console");
        }

        public static CancelOutcome failed(String message) {
            return new CancelOutcome(false, message != null ? message : "Cancel failed");
        }
    }
}
