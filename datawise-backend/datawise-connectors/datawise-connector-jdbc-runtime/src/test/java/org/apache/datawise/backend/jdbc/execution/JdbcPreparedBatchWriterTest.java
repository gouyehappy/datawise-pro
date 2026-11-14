package org.apache.datawise.backend.jdbc.execution;

import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.PreparedStatement;
import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class JdbcPreparedBatchWriterTest {

    @Test
    void flushesOnBatchSizeAndCommitsWhenTransactional() throws Exception {
        Connection connection = mock(Connection.class);
        DatabaseMetaData meta = mock(DatabaseMetaData.class);
        PreparedStatement ps = mock(PreparedStatement.class);
        when(connection.getMetaData()).thenReturn(meta);
        when(meta.supportsTransactions()).thenReturn(true);
        when(connection.prepareStatement("insert into t (id) values (?)")).thenReturn(ps);
        when(ps.executeBatch()).thenReturn(new int[]{1, 1});

        try (JdbcPreparedBatchWriter writer = new JdbcPreparedBatchWriter(
                connection,
                "insert into t (id) values (?)",
                List.of("id"),
                2
        )) {
            writer.addRow(Map.of("id", 1));
            writer.addRow(Map.of("id", 2));
            writer.addRow(Map.of("id", 3));
        }

        verify(connection).setAutoCommit(false);
        verify(ps, times(2)).executeBatch();
        verify(connection, times(2)).commit();
        verify(ps).setObject(1, 1);
        verify(ps).setObject(eq(1), eq(2));
        verify(ps).setObject(eq(1), eq(3));
        verify(connection).setAutoCommit(true);
        verify(ps).close();
    }
}
