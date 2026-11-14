package org.apache.datawise.backend.jdbc.execution;

import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.junit.jupiter.api.Test;

import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Types;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class JdbcMultiResultDrainTest {

    @Test
    void drainsResultSetThenUpdateCount() throws SQLException {
        Statement statement = mock(Statement.class);
        ResultSet rs = mockResultSet("c1", 1);
        when(statement.getResultSet()).thenReturn(rs);
        when(statement.getMoreResults()).thenReturn(false);
        when(statement.getUpdateCount()).thenReturn(3, -1);

        List<ExecuteSqlResult> parts = JdbcStatementExecutor.drainAllJdbcResults(
                statement, "CALL multi()", 100, true);

        assertEquals(2, parts.size());
        assertEquals(1, parts.get(0).rowCount());
        assertEquals(1, parts.get(0).columns().size());
        assertEquals(3, parts.get(1).rowCount());
        assertEquals(0, parts.get(1).columns().size());
    }

    @Test
    void assembleMultiResultExposesResultSetsOnlyWhenMultiple() {
        ExecuteSqlResult a = new ExecuteSqlResult("s", 1, 0, List.of(), List.of(), null, null, null, null, null, null);
        ExecuteSqlResult b = new ExecuteSqlResult("s", 2, 0, List.of(), List.of(), null, null, null, null, null, null);
        ExecuteSqlResult single = JdbcStatementExecutor.assembleMultiResult(List.of(a), 10L);
        assertNull(single.resultSets());
        assertEquals(10L, single.durationMs());

        ExecuteSqlResult multi = JdbcStatementExecutor.assembleMultiResult(List.of(a, b), 20L);
        assertEquals(2, multi.resultSets().size());
        assertEquals(1, multi.rowCount());
        assertNull(multi.resultSets().get(0).resultSets());
        assertEquals(20L, multi.resultSets().get(1).durationMs());
    }

    private static ResultSet mockResultSet(String column, Object value) throws SQLException {
        ResultSet rs = mock(ResultSet.class);
        ResultSetMetaData meta = mock(ResultSetMetaData.class);
        when(rs.getMetaData()).thenReturn(meta);
        when(meta.getColumnCount()).thenReturn(1);
        when(meta.getColumnLabel(1)).thenReturn(column);
        when(meta.getColumnName(1)).thenReturn(column);
        when(meta.getColumnType(1)).thenReturn(Types.INTEGER);
        when(meta.getColumnTypeName(1)).thenReturn("INTEGER");
        when(rs.next()).thenReturn(true, false);
        when(rs.getObject(1)).thenReturn(value);
        return rs;
    }
}
