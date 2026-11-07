package org.apache.datawise.backend.common;

/**
 * Console manual JDBC session is missing, closed, or no longer usable.
 * Maps to {@link DatawiseErrorCodes#SQL_SESSION_GONE} (not a 500).
 */
public class SqlSessionGoneException extends RuntimeException {

    public static final String CODE = DatawiseErrorCodes.SQL_SESSION_GONE;
    public static final String DEFAULT_MESSAGE = "SQL session not found or already closed";

    public SqlSessionGoneException() {
        super(DEFAULT_MESSAGE);
    }

    public SqlSessionGoneException(String message) {
        super(message != null && !message.isBlank() ? message : DEFAULT_MESSAGE);
    }
}
