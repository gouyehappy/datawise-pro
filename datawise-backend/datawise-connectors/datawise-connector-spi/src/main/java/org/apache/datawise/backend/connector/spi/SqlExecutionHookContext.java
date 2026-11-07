package org.apache.datawise.backend.connector.spi;

/** Context passed to {@link SqlExecutionHook#beforeExecute} before SQL reaches the database. */
public record SqlExecutionHookContext(
        String pluginId,
        String sql,
        String connectionId,
        String database,
        long userId) {
}
