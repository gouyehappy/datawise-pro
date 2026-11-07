package org.apache.datawise.backend.jdbc.error;

import java.sql.SQLException;
import java.sql.SQLTimeoutException;
import java.util.Locale;

/** JDBC 异常分类：瞬断、驱动、连接池、查询超时等。 */
public final class JdbcErrorClassifier {

    public static final String ERROR_CODE_JDBC_DRIVER = "JDBC_DRIVER_REQUIRED";
    public static final String ERROR_CODE_JDBC_DRIVER_LOAD = "JDBC_DRIVER_LOAD_FAILED";
    public static final String ERROR_CODE_JDBC_DRIVER_DOWNLOAD = "JDBC_DRIVER_DOWNLOAD_FAILED";
    public static final String ERROR_CODE_DATABASE_CONNECTION = "DATABASE_CONNECTION_FAILED";

    private JdbcErrorClassifier() {
    }

    public static boolean isPoolUnavailable(Throwable error) {
        return isTransientConnectionFailure(error);
    }

    public static boolean isTransientConnectionFailure(Throwable error) {
        String message = rootMessage(error);
        return message != null && isTransientConnectionFailure(message.toLowerCase(Locale.ROOT));
    }

    public static boolean isTransientConnectionFailure(String lowerMessage) {
        if (isPoolAcquireTimeout(lowerMessage)) {
            return true;
        }
        if (isPostgresqlIoFailure(lowerMessage)) {
            return true;
        }
        return lowerMessage.contains("connection reset")
                || lowerMessage.contains("broken pipe")
                || lowerMessage.contains("connection has been closed")
                || lowerMessage.contains("connection closed")
                || lowerMessage.contains("socket closed")
                || lowerMessage.contains("terminating connection")
                || lowerMessage.contains("server closed the connection")
                || lowerMessage.contains("connection is closed")
                || lowerMessage.contains("no operations allowed after connection closed");
    }

    /**
     * Detects statement/query timeout or client/server cancel across common JDBC dialects.
     * Prefer SQLState / exception type; message matching is only a fallback.
     */
    public static boolean isQueryTimeoutOrCancel(Throwable error) {
        Throwable current = error;
        while (current != null) {
            if (current instanceof SQLTimeoutException) {
                return true;
            }
            if (current instanceof SQLException sqlEx) {
                if (isTimeoutOrCancelSqlState(sqlEx.getSQLState())
                        || isTimeoutOrCancelVendorCode(sqlEx.getErrorCode())) {
                    return true;
                }
            }
            current = current.getCause();
        }
        String message = classificationMessage(error);
        if (message == null || message.isBlank()) {
            return false;
        }
        String lower = message.toLowerCase(Locale.ROOT);
        // Exclude Hikari pool acquire timeouts (connection unavailable), not query timeouts.
        if (isPoolAcquireTimeout(lower)) {
            return false;
        }
        return lower.contains("query timed out")
                || lower.contains("statement timed out")
                || lower.contains("canceling statement")
                || lower.contains("cancelling statement")
                || lower.contains("query cancelled")
                || lower.contains("query canceled")
                || lower.contains("statement cancelled")
                || lower.contains("statement canceled")
                || lower.contains("operation timed out")
                || (lower.contains("timeout") && (lower.contains("query") || lower.contains("statement")))
                || lower.contains("ora-01013")
                || (lower.contains("hy000") && lower.contains("timeout"));
    }

    static boolean isTimeoutOrCancelSqlState(String sqlState) {
        if (sqlState == null || sqlState.isBlank()) {
            return false;
        }
        String state = sqlState.trim().toUpperCase(Locale.ROOT);
        return "HYT00".equals(state)   // general timeout
                || "HYT01".equals(state) // connection timeout (some drivers)
                || "57014".equals(state) // PostgreSQL query_canceled
                || "70100".equals(state) // MySQL query interrupted
                || "S1008".equals(state); // ODBC operation canceled
    }

    static boolean isTimeoutOrCancelVendorCode(int errorCode) {
        // Oracle: ORA-01013 user requested cancel of current operation
        // SQL Server: -2 timeout (Microsoft JDBC)
        return errorCode == 1013 || errorCode == -2;
    }

    public static boolean isDriverRelated(Throwable error) {
        String message = classificationMessage(error);
        if (message == null) {
            return false;
        }
        String lower = message.toLowerCase(Locale.ROOT);
        return lower.contains("no suitable driver")
                || lower.contains("driverclass is required")
                || lower.contains("jdbc driver maven coordinates are required")
                || isDownloadFailure(lower)
                || isLocalLoadFailure(lower);
    }

    public static boolean isDownloadFailure(String lowerMessage) {
        return lowerMessage.contains("failed to download jdbc driver")
                || lowerMessage.contains("failed to download driver from maven")
                || lowerMessage.contains("failed to download driver");
    }

    public static String classifyErrorCode(Throwable error) {
        if (error == null) {
            return null;
        }
        String message = classificationMessage(error);
        if (message == null || message.isBlank()) {
            return null;
        }
        String lower = message.toLowerCase(Locale.ROOT);
        if (lower.contains("driverclass is required")
                || lower.contains("jdbc driver maven coordinates are required")) {
            return ERROR_CODE_JDBC_DRIVER;
        }
        if (isDownloadFailure(lower)) {
            return ERROR_CODE_JDBC_DRIVER_DOWNLOAD;
        }
        if (isDriverRelated(error)) {
            if (isLocalLoadFailure(lower) || lower.contains("no suitable driver")) {
                return ERROR_CODE_JDBC_DRIVER_LOAD;
            }
            return ERROR_CODE_JDBC_DRIVER;
        }
        return null;
    }

    public static String resolveErrorCode(Throwable error) {
        String message = classificationMessage(error);
        if (message == null || message.isBlank()) {
            return ERROR_CODE_DATABASE_CONNECTION;
        }
        String lower = message.toLowerCase(Locale.ROOT);
        if (lower.contains("driverclass is required")
                || lower.contains("jdbc driver maven coordinates are required")) {
            return ERROR_CODE_JDBC_DRIVER;
        }
        if (isDownloadFailure(lower)) {
            return ERROR_CODE_JDBC_DRIVER_DOWNLOAD;
        }
        if (isDriverRelated(error)) {
            return ERROR_CODE_JDBC_DRIVER_LOAD;
        }
        return ERROR_CODE_DATABASE_CONNECTION;
    }

    public static boolean isPostgresqlIoFailure(String lowerMessage) {
        return lowerMessage.contains("an i/o error occurred while sending to the backend")
                || lowerMessage.contains("i/o error occurred while sending to the backend");
    }

    public static boolean isPoolAcquireTimeout(String lowerMessage) {
        return lowerMessage.contains("connection is not available")
                && lowerMessage.contains("request timed out");
    }

    public static boolean isLocalLoadFailure(String lowerMessage) {
        return lowerMessage.contains("failed to load driver class")
                || lowerMessage.contains("failed to load jdbc driver")
                || lowerMessage.contains("failed to preload jdbc driver");
    }

    public static String rootMessage(Throwable error) {
        Throwable current = error;
        while (current.getCause() != null && current.getCause() != current) {
            current = current.getCause();
        }
        return current.getMessage();
    }

    /** 顶层 + 根因消息，避免包装异常丢失 “Failed to download…” 等关键文案。 */
    public static String classificationMessage(Throwable error) {
        if (error == null) {
            return null;
        }
        String top = error.getMessage();
        String root = rootMessage(error);
        if (top != null && !top.isBlank() && root != null && !root.isBlank() && !top.equals(root)) {
            return top + " | " + root;
        }
        if (top != null && !top.isBlank()) {
            return top;
        }
        return root;
    }
}
