package org.apache.datawise.backend.connector.spi;

/**
 * Server-side SQL hook loaded from connector plugin JARs ({@code META-INF/services}).
 * Aligns with frontend {@code beforeExecute} plugin hooks.
 */
public interface SqlExecutionHook {

    /** Stable hook id; should match plugin id when applicable. */
    String id();

    /** Lower values run first. */
    default int priority() {
        return 0;
    }

    SqlExecutionHookResult beforeExecute(SqlExecutionHookContext context);
}
