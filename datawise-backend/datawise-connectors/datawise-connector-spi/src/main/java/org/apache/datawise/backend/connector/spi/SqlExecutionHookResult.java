package org.apache.datawise.backend.connector.spi;

/** Result of a {@link SqlExecutionHook#beforeExecute} invocation. */
public record SqlExecutionHookResult(
        String sql,
        boolean cancel,
        String message) {

    public static SqlExecutionHookResult proceed(String sql) {
        return new SqlExecutionHookResult(sql, false, null);
    }

    public static SqlExecutionHookResult cancel(String message) {
        return new SqlExecutionHookResult(null, true, message);
    }

    public static SqlExecutionHookResult unchanged(String sql) {
        return proceed(sql);
    }
}
