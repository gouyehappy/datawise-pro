package org.apache.datawise.backend.common;

/**
 * Interactive SQL was rejected because global or per-user concurrency slots are exhausted.
 */
public class SqlConcurrencyLimitException extends RuntimeException {

    public static final String CODE = DatawiseErrorCodes.SQL_CONCURRENCY_LIMIT;

    public SqlConcurrencyLimitException(String message) {
        super(message != null && !message.isBlank() ? message : CODE);
    }

    public static SqlConcurrencyLimitException global(int maxConcurrent) {
        return new SqlConcurrencyLimitException(
                "Too many concurrent SQL executions (global limit " + maxConcurrent + ")");
    }

    public static SqlConcurrencyLimitException perUser(int maxConcurrent) {
        return new SqlConcurrencyLimitException(
                "Too many concurrent SQL executions for this user (limit " + maxConcurrent + ")");
    }
}
