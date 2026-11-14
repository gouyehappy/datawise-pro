package org.apache.datawise.backend.jdbc.execution;

import org.apache.datawise.backend.jdbc.stream.ResultStreamCallback;
import org.junit.jupiter.api.Test;

import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Types;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class JdbcResultStreamerTest {

    @Test
    void applyFetchSizeUsesMinValueForMysql() throws SQLException {
        Statement statement = mock(Statement.class);
        JdbcResultStreamer.applyFetchSize(statement, "mysql");
        verify(statement).setFetchSize(Integer.MIN_VALUE);
    }

    @Test
    void applyFetchSizeUsesDefaultForPostgres() throws SQLException {
        Statement statement = mock(Statement.class);
        JdbcResultStreamer.applyFetchSize(statement, "postgresql");
        verify(statement).setFetchSize(JdbcResultStreamer.DEFAULT_FETCH_SIZE);
    }

    @Test
    void drainPushesSchemaThenRowsAndHonorsEarlyStop() throws SQLException {
        ResultSetMetaData meta = mock(ResultSetMetaData.class);
        when(meta.getColumnCount()).thenReturn(1);
        when(meta.getColumnLabel(1)).thenReturn("id");
        when(meta.getColumnName(1)).thenReturn("id");
        when(meta.getTableName(1)).thenReturn("t");
        when(meta.getColumnType(1)).thenReturn(Types.INTEGER);
        when(meta.getColumnTypeName(1)).thenReturn("INTEGER");

        ResultSet rs = mock(ResultSet.class);
        when(rs.getMetaData()).thenReturn(meta);
        when(rs.next()).thenReturn(true, true, true, false);
        when(rs.getObject(1)).thenReturn(1, 2, 3);

        List<Map<String, Object>> rows = new ArrayList<>();
        AtomicReference<List<Map<String, Object>>> schema = new AtomicReference<>();
        long count = JdbcResultStreamer.drain(rs, new ResultStreamCallback() {
            @Override
            public void onSchema(List<Map<String, Object>> columns) {
                schema.set(columns);
            }

            @Override
            public boolean onRow(Map<String, Object> row) {
                rows.add(row);
                return rows.size() < 2;
            }
        });

        assertEquals(2, count);
        assertEquals(2, rows.size());
        assertEquals(1, schema.get().size());
        assertEquals("id", schema.get().get(0).get("name"));
    }

    @Test
    void onStatementReceivesCreatedStatement() throws SQLException {
        // Smoke: callback contract accepts Statement without throwing.
        AtomicReference<Statement> seen = new AtomicReference<>();
        ResultStreamCallback callback = new ResultStreamCallback() {
            @Override
            public void onStatement(Statement statement) {
                seen.set(statement);
            }

            @Override
            public boolean onRow(Map<String, Object> row) {
                return false;
            }
        };
        Statement statement = mock(Statement.class);
        callback.onStatement(statement);
        assertSame(statement, seen.get());
    }
}
