/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package org.apache.datawise.backend.jdbc.execution;

import org.apache.datawise.backend.config.JdbcPoolProperties;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.domain.TableRowMutateResult;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Integration test for the JDBC execution boundary, driven against a real in-memory H2 engine
 * so the assertions cover actual driver behaviour rather than a mocked {@code Statement}.
 *
 * <p>Guards the two properties the SQL layer relies on: one request can never smuggle a second
 * statement past the executor, and the row cap is enforced by the driver instead of by trimming
 * a fully materialised result set in memory.
 */
class JdbcStatementExecutionIT {

    private static final int SEED_ROWS = 250;

    private Connection connection;
    private JdbcStatementExecutor executor;

    @BeforeEach
    void setUp() throws SQLException {
        connection = DriverManager.getConnection(
                "jdbc:h2:mem:it_" + UUID.randomUUID().toString().replace("-", "") + ";DB_CLOSE_DELAY=-1");
        try (Statement statement = connection.createStatement()) {
            statement.execute("CREATE TABLE t_order (id INT PRIMARY KEY, code VARCHAR(32), amount INT)");
            statement.execute("INSERT INTO t_order (id, code, amount) "
                    + "SELECT X, 'C-' || X, X * 10 FROM SYSTEM_RANGE(1, " + SEED_ROWS + ")");
        }
        executor = new JdbcStatementExecutor(new JdbcPoolProperties(), 30);
    }

    @AfterEach
    void tearDown() throws SQLException {
        if (connection != null && !connection.isClosed()) {
            connection.close();
        }
    }

    @Test
    void selectAppliesRowCapAtTheDriver() throws SQLException {
        ExecuteSqlResult result = executor.executeOnConnection(connection, "SELECT * FROM t_order", 10);

        assertEquals(10, result.rowCount());
        assertEquals(10, result.rows().size());
        assertFalse(result.columns().isEmpty());
    }

    @Test
    void selectWithoutExplicitCapReturnsEveryRowBelowSafetyLimit() throws SQLException {
        ExecuteSqlResult result = executor.executeOnConnection(connection, "SELECT * FROM t_order ORDER BY id", 0);

        assertEquals(SEED_ROWS, result.rowCount());
        assertEquals(3, result.rows().get(0).size());
        assertTrue(result.rows().get(0).containsValue("C-1"));
    }

    @Test
    void multiStatementRequestIsRejectedBeforeTouchingData() {
        IllegalArgumentException error = assertThrows(
                IllegalArgumentException.class,
                () -> executor.executeOnConnection(connection, "SELECT 1; DELETE FROM t_order", 10));

        assertTrue(error.getMessage().contains("Multiple SQL statements"), error.getMessage());
        assertEquals(SEED_ROWS, countRows(), "the trailing DELETE must never reach the database");
    }

    @Test
    void mysqlExecutableCommentCannotHideASecondStatement() {
        assertThrows(
                IllegalArgumentException.class,
                () -> executor.executeOnConnection(
                        connection, "SELECT 1 /*!50000 ; DELETE FROM t_order */", 10));
    }

    @Test
    void updateReturnsAffectedRowCount() throws SQLException {
        TableRowMutateResult result = executor.executeUpdate(connection, "UPDATE t_order SET amount = 0");

        assertEquals(SEED_ROWS, result.affectedRows());
        assertEquals("UPDATE t_order SET amount = 0", result.sql());
    }

    @Test
    void updateRejectsBlankSql() {
        IllegalArgumentException error =
                assertThrows(IllegalArgumentException.class, () -> executor.executeUpdate(connection, "   "));
        assertEquals("SQL is required", error.getMessage());
    }

    @Test
    void updateAlsoRejectsBatchedStatements() {
        assertThrows(
                IllegalArgumentException.class,
                () -> executor.executeUpdate(connection, "UPDATE t_order SET amount = 1; DROP TABLE t_order"));
        assertEquals(SEED_ROWS, countRows(), "the table must still exist after the rejected batch");
    }

    @Test
    void queryTimeoutIsConfiguredButLeavesNormalQueriesIntact() throws SQLException {
        JdbcStatementExecutor timed = new JdbcStatementExecutor(new JdbcPoolProperties(), 1);

        ExecuteSqlResult result = timed.executeOnConnection(connection, "SELECT COUNT(*) AS total FROM t_order", 10);

        assertEquals(1, result.rowCount());
    }

    private int countRows() {
        try (
                Statement statement = connection.createStatement();
                var rs = statement.executeQuery("SELECT COUNT(*) FROM t_order")) {
            rs.next();
            return rs.getInt(1);
        } catch (SQLException e) {
            throw new IllegalStateException(e);
        }
    }
}
