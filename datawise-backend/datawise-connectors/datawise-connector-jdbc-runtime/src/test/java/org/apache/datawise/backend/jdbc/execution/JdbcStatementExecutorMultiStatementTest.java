package org.apache.datawise.backend.jdbc.execution;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

class JdbcStatementExecutorMultiStatementTest {

    @Test
    void rejectsMultipleStatements() {
        assertThrows(
                IllegalArgumentException.class,
                () -> JdbcStatementExecutor.rejectMultiStatement("SELECT 1; DELETE FROM t")
        );
        assertDoesNotThrow(() -> JdbcStatementExecutor.rejectMultiStatement("SELECT 1"));
        assertDoesNotThrow(() -> JdbcStatementExecutor.rejectMultiStatement("SELECT 1;"));
    }
}
