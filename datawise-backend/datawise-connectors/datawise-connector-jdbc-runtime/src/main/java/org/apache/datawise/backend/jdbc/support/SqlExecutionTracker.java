package org.apache.datawise.backend.jdbc.support;

import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Tracks in-flight JDBC statements so console tabs can cancel running SQL.
 * Keys: {@code queryId} (precise) and legacy {@code executionKey} (latest query in a tab).
 */
@Component
public class SqlExecutionTracker {

    private static final Logger log = LoggerFactory.getLogger(SqlExecutionTracker.class);

    private final ConcurrentHashMap<String, RunningExecution> byQueryId = new ConcurrentHashMap<>();
    /** executionKey → latest queryId for tab-level cancel compatibility. */
    private final ConcurrentHashMap<String, String> latestByExecutionKey = new ConcurrentHashMap<>();

    /**
     * Registers a running statement. Returns a unique {@code queryId} callers may surface to clients.
     */
    public String register(String executionKey, Statement statement, Connection connection) {
        if (executionKey == null || executionKey.isBlank() || statement == null || connection == null) {
            return null;
        }
        String queryId = "q_" + UUID.randomUUID().toString().replace("-", "");
        RunningExecution execution = new RunningExecution(queryId, executionKey, statement, connection);
        byQueryId.put(queryId, execution);
        latestByExecutionKey.put(executionKey, queryId);
        return queryId;
    }

    /** Removes registration only when {@code statement} is still the tracked instance. */
    public void unregister(String executionKey, Statement statement) {
        if (executionKey == null || executionKey.isBlank() || statement == null) {
            return;
        }
        for (RunningExecution existing : byQueryId.values()) {
            if (executionKey.equals(existing.executionKey()) && existing.statement() == statement) {
                unregisterQuery(existing.queryId());
                return;
            }
        }
    }

    public void unregister(String executionKey) {
        if (executionKey == null || executionKey.isBlank()) {
            return;
        }
        // Drop every query bound to this tab key (legacy bulk clear).
        List<String> queryIds = new ArrayList<>();
        for (RunningExecution existing : byQueryId.values()) {
            if (executionKey.equals(existing.executionKey())) {
                queryIds.add(existing.queryId());
            }
        }
        for (String queryId : queryIds) {
            unregisterQuery(queryId);
        }
        latestByExecutionKey.remove(executionKey);
    }

    public void unregisterQuery(String queryId) {
        if (queryId == null || queryId.isBlank()) {
            return;
        }
        RunningExecution removed = byQueryId.remove(queryId);
        if (removed == null) {
            return;
        }
        latestByExecutionKey.computeIfPresent(removed.executionKey(), (key, current) ->
                queryId.equals(current) ? null : current
        );
    }

    public boolean hasRunningExecution(String executionKey) {
        if (executionKey == null || executionKey.isBlank()) {
            return false;
        }
        String queryId = latestByExecutionKey.get(executionKey);
        return queryId != null && byQueryId.containsKey(queryId);
    }

    public boolean hasRunningQuery(String queryId) {
        return queryId != null && byQueryId.containsKey(queryId);
    }

    /** Snapshot of a running query, or null if not registered. */
    public RunningExecution peek(String key) {
        return resolve(key);
    }

    public java.util.List<RunningExecution> listRunning() {
        return java.util.List.copyOf(byQueryId.values());
    }

    /** Cancel by queryId, or by tab executionKey (cancels latest query in that tab). */
    public CancelOutcome cancelQuery(String key) {
        RunningExecution execution = resolve(key);
        if (execution == null) {
            return CancelOutcome.notRunning();
        }
        try {
            execution.statement().cancel();
            return CancelOutcome.ok("Query cancel requested; statement may still be running", execution.queryId());
        } catch (SQLException ex) {
            return CancelOutcome.failed(ex.getMessage(), execution.queryId());
        }
    }

    public CancelOutcome cancelConnection(String key) {
        RunningExecution execution = resolve(key);
        if (execution == null) {
            return CancelOutcome.notRunning();
        }
        byQueryId.remove(execution.queryId(), execution);
        latestByExecutionKey.computeIfPresent(execution.executionKey(), (k, current) ->
                execution.queryId().equals(current) ? null : current
        );
        try {
            execution.statement().cancel();
        } catch (SQLException ex) {
            ExceptionLogging.recoverable(log, "Statement cancel before connection abort failed", ex);
        }
        try {
            execution.connection().abort(Runnable::run);
            return CancelOutcome.ok("Connection terminated", execution.queryId());
        } catch (SQLException ex) {
            return CancelOutcome.failed(ex.getMessage(), execution.queryId());
        }
    }

    private RunningExecution resolve(String key) {
        if (key == null || key.isBlank()) {
            return null;
        }
        RunningExecution byId = byQueryId.get(key);
        if (byId != null) {
            return byId;
        }
        String queryId = latestByExecutionKey.get(key);
        return queryId == null ? null : byQueryId.get(queryId);
    }

    public record RunningExecution(
            String queryId,
            String executionKey,
            Statement statement,
            Connection connection
    ) {
    }

    public record CancelOutcome(boolean cancelled, String message, String queryId) {
        public static CancelOutcome ok(String message) {
            return new CancelOutcome(true, message, null);
        }

        public static CancelOutcome ok(String message, String queryId) {
            return new CancelOutcome(true, message, queryId);
        }

        public static CancelOutcome notRunning() {
            return new CancelOutcome(false, "No SQL is currently running in this console", null);
        }

        public static CancelOutcome failed(String message) {
            return new CancelOutcome(false, message != null ? message : "Cancel failed", null);
        }

        public static CancelOutcome failed(String message, String queryId) {
            return new CancelOutcome(false, message != null ? message : "Cancel failed", queryId);
        }
    }
}
