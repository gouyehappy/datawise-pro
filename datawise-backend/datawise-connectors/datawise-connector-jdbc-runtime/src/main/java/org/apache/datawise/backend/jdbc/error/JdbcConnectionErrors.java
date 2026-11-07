package org.apache.datawise.backend.jdbc.error;

import org.apache.datawise.backend.common.DatabaseServiceException;
import org.apache.datawise.backend.model.ConnectionEntity;

import java.sql.SQLException;

/** 将 JDBC 底层异常转为面向用户的说明。 */
public final class JdbcConnectionErrors {

    public static final String ERROR_CODE_JDBC_DRIVER = JdbcErrorClassifier.ERROR_CODE_JDBC_DRIVER;

    public static final String ERROR_CODE_JDBC_DRIVER_LOAD = JdbcErrorClassifier.ERROR_CODE_JDBC_DRIVER_LOAD;

    public static final String ERROR_CODE_DATABASE_CONNECTION = JdbcErrorClassifier.ERROR_CODE_DATABASE_CONNECTION;

    private JdbcConnectionErrors() {
    }

    public static String toUserMessage(Throwable error) {
        return toUserMessage(null, error);
    }

    public static String toUserMessage(ConnectionEntity entity, Throwable error) {
        return JdbcErrorMessageFormatter.toUserMessage(entity, error);
    }

    public static boolean isPoolUnavailable(Throwable error) {
        return JdbcErrorClassifier.isPoolUnavailable(error);
    }

    public static boolean isTransientConnectionFailure(Throwable error) {
        return JdbcErrorClassifier.isTransientConnectionFailure(error);
    }

    public static boolean isDriverRelated(Throwable error) {
        return JdbcErrorClassifier.isDriverRelated(error);
    }

    public static String classifyErrorCode(Throwable error) {
        return JdbcErrorClassifier.classifyErrorCode(error);
    }

    public static DatabaseServiceException toServiceException(ConnectionEntity entity, SQLException ex) {
        return new DatabaseServiceException(
                toUserMessage(entity, ex),
                JdbcErrorClassifier.resolveErrorCode(ex),
                ex
        );
    }

    public static DatabaseServiceException toServiceException(SQLException ex) {
        return new DatabaseServiceException(
                toUserMessage(ex),
                JdbcErrorClassifier.resolveErrorCode(ex),
                ex
        );
    }

    public static String resolveErrorCode(Throwable error) {
        return JdbcErrorClassifier.resolveErrorCode(error);
    }

    /** Query timeout / cancel: SQLState, SQLTimeoutException, then message fallback. */
    public static boolean isQueryTimeoutOrCancel(Throwable error) {
        return JdbcErrorClassifier.isQueryTimeoutOrCancel(error);
    }
}
