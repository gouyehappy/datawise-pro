package org.apache.datawise.backend.connector.hook;

import org.apache.datawise.backend.connector.spi.SqlExecutionHook;
import org.apache.datawise.backend.connector.spi.SqlExecutionHookContext;
import org.apache.datawise.backend.connector.spi.SqlExecutionHookResult;
import org.apache.datawise.backend.common.SqlExecutionException;

import java.util.Comparator;
import java.util.List;

/** Chains registered {@link SqlExecutionHook} instances before SQL execution. */
public class SqlExecutionHookRunner {

    private volatile List<SqlExecutionHook> hooks;

    public SqlExecutionHookRunner(List<SqlExecutionHook> hooks) {
        replaceHooks(hooks);
    }

    /** Hot-reload: replace plugin-contributed SQL hooks after plugin reload. */
    public synchronized void replaceHooks(List<SqlExecutionHook> next) {
        this.hooks = next == null
                ? List.of()
                : next.stream()
                        .sorted(Comparator.comparingInt(SqlExecutionHook::priority))
                        .toList();
    }

    public String applyBeforeExecute(
                                     String sql,
                                     String connectionId,
                                     String database,
                                     long userId) {
        List<SqlExecutionHook> current = hooks;
        if (current.isEmpty()) {
            return sql;
        }
        String currentSql = sql;
        for (SqlExecutionHook hook : current) {
            SqlExecutionHookResult result = hook.beforeExecute(new SqlExecutionHookContext(
                    hook.id(),
                    currentSql,
                    connectionId,
                    database,
                    userId));
            if (result == null) {
                continue;
            }
            if (result.cancel()) {
                String message = result.message() != null && !result.message().isBlank()
                        ? result.message().trim()
                        : "SQL execution blocked by hook: " + hook.id();
                throw new SqlExecutionException(message, null, null);
            }
            if (result.sql() != null) {
                currentSql = result.sql();
            }
        }
        return currentSql;
    }
}
