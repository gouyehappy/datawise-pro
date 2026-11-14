package org.apache.datawise.backend.jdbc.support;

/**
 * Request-scoped JDBC statement timeout overlay (ThreadLocal).
 * Set around interactive SQL execute; cleared in finally.
 */
public final class QueryTimeoutOverride {

    private static final ThreadLocal<Integer> REQUEST_TIMEOUT_SECONDS = new ThreadLocal<>();

    private QueryTimeoutOverride() {
    }

    public static void set(Integer timeoutSeconds) {
        if (timeoutSeconds == null || timeoutSeconds <= 0) {
            REQUEST_TIMEOUT_SECONDS.remove();
            return;
        }
        REQUEST_TIMEOUT_SECONDS.set(timeoutSeconds);
    }

    public static void clear() {
        REQUEST_TIMEOUT_SECONDS.remove();
    }

    /** Prefer request override; otherwise process default from configuration. */
    public static int resolve(int processDefaultSeconds) {
        Integer override = REQUEST_TIMEOUT_SECONDS.get();
        return QueryOperationBudget.resolveQueryTimeoutSeconds(override, processDefaultSeconds);
    }
}
