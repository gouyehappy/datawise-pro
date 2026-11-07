package org.apache.datawise.backend.connector.hook;

import org.apache.datawise.backend.common.SqlExecutionException;
import org.apache.datawise.backend.connector.spi.SqlExecutionHook;
import org.apache.datawise.backend.connector.spi.SqlExecutionHookContext;
import org.apache.datawise.backend.connector.spi.SqlExecutionHookResult;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class SqlExecutionHookRunnerTest {

    @Test
    void applyBeforeExecute_transformsSqlInHookOrder() {
        SqlExecutionHook first = new SqlExecutionHook() {

            @Override
            public String id() {
                return "trim-hook";
            }

            @Override
            public int priority() {
                return 0;
            }

            @Override
            public SqlExecutionHookResult beforeExecute(SqlExecutionHookContext context) {
                return SqlExecutionHookResult.proceed(context.sql().trim());
            }
        };
        SqlExecutionHook second = new SqlExecutionHook() {

            @Override
            public String id() {
                return "suffix-hook";
            }

            @Override
            public int priority() {
                return 1;
            }

            @Override
            public SqlExecutionHookResult beforeExecute(SqlExecutionHookContext context) {
                return SqlExecutionHookResult.proceed(context.sql() + ";");
            }
        };

        SqlExecutionHookRunner runner = new SqlExecutionHookRunner(List.of(second, first));
        assertEquals("SELECT 1;;", runner.applyBeforeExecute(" SELECT 1; ", "conn-1", "db1", 7L));
    }

    @Test
    void applyBeforeExecute_cancelThrowsSqlExecutionException() {
        SqlExecutionHook blocker = new SqlExecutionHook() {

            @Override
            public String id() {
                return "blocker";
            }

            @Override
            public SqlExecutionHookResult beforeExecute(SqlExecutionHookContext context) {
                return SqlExecutionHookResult.cancel("blocked");
            }
        };
        SqlExecutionHookRunner runner = new SqlExecutionHookRunner(List.of(blocker));

        SqlExecutionException ex = assertThrows(
                SqlExecutionException.class,
                () -> runner.applyBeforeExecute("DROP DATABASE x", "conn-1", null, 1L));
        assertEquals("blocked", ex.getMessage());
    }
}
