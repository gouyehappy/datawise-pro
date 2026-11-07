package org.apache.datawise.backend.sse;

import org.junit.jupiter.api.Test;

import javax.sql.DataSource;
import java.lang.reflect.Method;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class JdbcPollingSseEventBusTest {

    @Test
    void pollOnce_usesSetMaxRowsInsteadOfFetchFirst() throws Exception {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        Statement bootstrapStatement = mock(Statement.class);
        PreparedStatement ps = mock(PreparedStatement.class);
        ResultSet bootstrapRs = mock(ResultSet.class);
        ResultSet pollRs = mock(ResultSet.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.createStatement()).thenReturn(bootstrapStatement);
        when(bootstrapStatement.executeQuery(anyString())).thenReturn(bootstrapRs);
        when(bootstrapRs.next()).thenReturn(true);
        when(bootstrapRs.getLong(1)).thenReturn(0L);
        when(connection.prepareStatement(anyString())).thenAnswer(invocation -> {
            String sql = invocation.getArgument(0);
            assertFalse(sql.toUpperCase().contains("FETCH FIRST"), sql);
            assertTrue(sql.toUpperCase().contains("ORDER BY ID"), sql);
            return ps;
        });
        when(ps.executeQuery()).thenReturn(pollRs);
        when(pollRs.next()).thenReturn(false);

        JdbcPollingSseEventBus bus = new JdbcPollingSseEventBus(
                dataSource,
                "test-instance",
                Duration.ofHours(1),
                Duration.ofMinutes(5));
        try {
            Method pollOnce = JdbcPollingSseEventBus.class.getDeclaredMethod("pollOnce");
            pollOnce.setAccessible(true);
            pollOnce.invoke(bus);
            verify(ps).setLong(anyInt(), anyLong());
            verify(ps).setMaxRows(200);
        } finally {
            bus.close();
        }
    }
}
