package org.apache.datawise.backend.jdbc.support;

/**
 * Per-request JDBC operation budget. {@code cancel}/{@code cleanup} hard caps are not configurable
 * so a hung driver cancel cannot block the request forever.
 */
public final class QueryOperationBudget {

    /** Hard upper bound for Statement.cancel / connection.abort attempts. */
    public static final long CANCEL_HARD_TIMEOUT_MS = 5_000L;
    public static final long CLEANUP_HARD_TIMEOUT_MS = 5_000L;

    private final int queryTimeoutSeconds;
    private final long deadlineEpochMs;

    private QueryOperationBudget(int queryTimeoutSeconds, long deadlineEpochMs) {
        this.queryTimeoutSeconds = Math.max(0, queryTimeoutSeconds);
        this.deadlineEpochMs = deadlineEpochMs;
    }

    /**
     * @param queryTimeoutSeconds JDBC statement timeout; 0 = unlimited (legacy)
     * @param overallDeadlineMs   wall-clock budget from request start; 0 = no wall deadline
     */
    public static QueryOperationBudget of(int queryTimeoutSeconds, long overallDeadlineMs) {
        long deadline = overallDeadlineMs > 0
                ? System.currentTimeMillis() + overallDeadlineMs
                : Long.MAX_VALUE;
        return new QueryOperationBudget(queryTimeoutSeconds, deadline);
    }

    public static QueryOperationBudget unlimited() {
        return of(0, 0);
    }

    public int queryTimeoutSeconds() {
        return queryTimeoutSeconds;
    }

    public long deadlineEpochMs() {
        return deadlineEpochMs;
    }

    public long remainingTimeMillis() {
        if (deadlineEpochMs == Long.MAX_VALUE) {
            return Long.MAX_VALUE;
        }
        return Math.max(0L, deadlineEpochMs - System.currentTimeMillis());
    }

    public boolean isExpired() {
        return remainingTimeMillis() == 0L && deadlineEpochMs != Long.MAX_VALUE;
    }

    /** Prefer per-request timeout; fall back to process default. */
    public static int resolveQueryTimeoutSeconds(Integer requestTimeoutSeconds, int processDefaultSeconds) {
        if (requestTimeoutSeconds != null && requestTimeoutSeconds > 0) {
            return requestTimeoutSeconds;
        }
        return Math.max(0, processDefaultSeconds);
    }
}
