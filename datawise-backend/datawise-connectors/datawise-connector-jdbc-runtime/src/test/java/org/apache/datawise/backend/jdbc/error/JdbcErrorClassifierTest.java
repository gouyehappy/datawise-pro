package org.apache.datawise.backend.jdbc.error;

import org.junit.jupiter.api.Test;

import java.sql.SQLException;
import java.sql.SQLTimeoutException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JdbcErrorClassifierTest {

    @Test
    void resolveErrorCode_mapsDriverLoadFailure() {
        Exception error = new Exception("No suitable driver found for jdbc:mysql://localhost/db");
        assertEquals(JdbcErrorClassifier.ERROR_CODE_JDBC_DRIVER_LOAD, JdbcErrorClassifier.resolveErrorCode(error));
        assertTrue(JdbcErrorClassifier.isDriverRelated(error));
    }

    @Test
    void resolveErrorCode_mapsWrappedDownloadFailure() {
        Exception root = new Exception("Connection timed out");
        Exception error = new Exception("Failed to download JDBC driver: Connection timed out", root);
        assertEquals(
                JdbcErrorClassifier.ERROR_CODE_JDBC_DRIVER_DOWNLOAD,
                JdbcErrorClassifier.resolveErrorCode(error)
        );
        assertTrue(JdbcErrorClassifier.isDriverRelated(error));
    }

    @Test
    void isTransientConnectionFailure_detectsConnectionReset() {
        assertTrue(JdbcErrorClassifier.isTransientConnectionFailure("connection reset by peer"));
    }

    @Test
    void isQueryTimeoutOrCancel_detectsSqlTimeoutException() {
        assertTrue(JdbcErrorClassifier.isQueryTimeoutOrCancel(new SQLTimeoutException("query timed out")));
    }

    @Test
    void isQueryTimeoutOrCancel_detectsPostgresCancelSqlState() {
        assertTrue(JdbcErrorClassifier.isQueryTimeoutOrCancel(new SQLException("canceling statement", "57014")));
    }

    @Test
    void isQueryTimeoutOrCancel_detectsMysqlInterruptSqlState() {
        assertTrue(JdbcErrorClassifier.isQueryTimeoutOrCancel(new SQLException("Query execution was interrupted", "70100")));
    }

    @Test
    void isQueryTimeoutOrCancel_detectsSqlServerVendorTimeout() {
        assertTrue(JdbcErrorClassifier.isQueryTimeoutOrCancel(new SQLException("timed out", "HYT00", -2)));
    }

    @Test
    void isQueryTimeoutOrCancel_detectsOracleCancelVendorCode() {
        assertTrue(JdbcErrorClassifier.isQueryTimeoutOrCancel(new SQLException("ORA-01013", "72000", 1013)));
    }

    @Test
    void isQueryTimeoutOrCancel_excludesPoolAcquireTimeout() {
        assertFalse(JdbcErrorClassifier.isQueryTimeoutOrCancel(
                new SQLException("Connection is not available, request timed out after 30000ms.")
        ));
    }

    @Test
    void isQueryTimeoutOrCancel_fallsBackToMessage() {
        assertTrue(JdbcErrorClassifier.isQueryTimeoutOrCancel(new RuntimeException("Statement timed out")));
    }
}
