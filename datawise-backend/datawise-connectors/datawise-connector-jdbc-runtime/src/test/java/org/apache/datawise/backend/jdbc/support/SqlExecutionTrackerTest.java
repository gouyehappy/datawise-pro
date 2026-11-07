package org.apache.datawise.backend.jdbc.support;

import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.any;

class SqlExecutionTrackerTest {

    @Test
    void cancelQueryReportsStillRunningWhenStatementRemainsRegistered() throws SQLException {
        SqlExecutionTracker tracker = new SqlExecutionTracker();
        Statement statement = mock(Statement.class);
        Connection connection = mock(Connection.class);

        tracker.register("1:tab-a", statement, connection);
        SqlExecutionTracker.CancelOutcome outcome = tracker.cancelQuery("1:tab-a");

        assertTrue(outcome.cancelled());
        assertTrue(outcome.message().contains("still be running"));
        verify(statement).cancel();
    }

    @Test
    void cancelConnectionAbortsConnection() throws SQLException {
        SqlExecutionTracker tracker = new SqlExecutionTracker();
        Statement statement = mock(Statement.class);
        Connection connection = mock(Connection.class);
        when(connection.isClosed()).thenReturn(false);

        tracker.register("1:tab-a", statement, connection);
        SqlExecutionTracker.CancelOutcome outcome = tracker.cancelConnection("1:tab-a");

        assertTrue(outcome.cancelled());
        verify(statement).cancel();
        verify(connection).abort(any());
        assertFalse(tracker.hasRunningExecution("1:tab-a"));
    }

    @Test
    void cancelQueryReturnsNotRunningWhenMissing() {
        SqlExecutionTracker tracker = new SqlExecutionTracker();
        SqlExecutionTracker.CancelOutcome outcome = tracker.cancelQuery("1:missing");
        assertFalse(outcome.cancelled());
    }

    @Test
    void cancelQueryReturnsFailedWhenCancelThrows() throws SQLException {
        SqlExecutionTracker tracker = new SqlExecutionTracker();
        Statement statement = mock(Statement.class);
        Connection connection = mock(Connection.class);
        doThrow(new SQLException("cancel failed")).when(statement).cancel();

        tracker.register("1:tab-a", statement, connection);
        SqlExecutionTracker.CancelOutcome outcome = tracker.cancelQuery("1:tab-a");

        assertFalse(outcome.cancelled());
        assertTrue(outcome.message().contains("cancel failed"));
    }
}
