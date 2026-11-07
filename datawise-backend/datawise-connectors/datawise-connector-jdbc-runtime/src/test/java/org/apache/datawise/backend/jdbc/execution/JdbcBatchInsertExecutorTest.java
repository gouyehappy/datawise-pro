package org.apache.datawise.backend.jdbc.execution;

import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.Types;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class JdbcBatchInsertExecutorTest {

    @Test
    void executeBindsRowsAndRunsBatch() throws Exception {
        Connection connection = mock(Connection.class);
        PreparedStatement ps = mock(PreparedStatement.class);
        when(connection.prepareStatement("insert into t (id, name) values (?, ?)"))
                .thenReturn(ps);
        when(ps.executeBatch()).thenReturn(new int[]{1, 1});

        int[] result = JdbcBatchInsertExecutor.execute(
                connection,
                "insert into t (id, name) values (?, ?)",
                List.of("id", "name"),
                List.of(
                        Map.of("id", 1, "name", "a"),
                        Map.of("id", 2, "name", "b")
                )
        );

        assertArrayEquals(new int[]{1, 1}, result);
        verify(ps).setObject(1, 1);
        verify(ps).setObject(2, "a");
        verify(ps).setObject(eq(1), eq(2));
        verify(ps).setObject(eq(2), eq("b"));
        verify(ps, org.mockito.Mockito.times(2)).addBatch();
        verify(ps).executeBatch();
        verify(ps).close();
    }

    @Test
    void executeSetsNullForMissingValues() throws Exception {
        Connection connection = mock(Connection.class);
        PreparedStatement ps = mock(PreparedStatement.class);
        when(connection.prepareStatement("insert into t (id) values (?)")).thenReturn(ps);
        when(ps.executeBatch()).thenReturn(new int[]{1});

        JdbcBatchInsertExecutor.execute(
                connection,
                "insert into t (id) values (?)",
                List.of("id"),
                List.of(Map.of())
        );

        verify(ps).setNull(1, Types.NULL);
        verify(ps).addBatch();
    }
}
