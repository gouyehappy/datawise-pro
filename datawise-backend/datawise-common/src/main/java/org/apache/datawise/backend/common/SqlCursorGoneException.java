package org.apache.datawise.backend.common;

/**
 * SQL result cursor is missing, expired, or not owned by the caller.
 * Maps to {@link DatawiseErrorCodes#SQL_CURSOR_GONE} (not a generic BAD_REQUEST).
 */
public class SqlCursorGoneException extends RuntimeException {

    public static final String CODE = DatawiseErrorCodes.SQL_CURSOR_GONE;
    public static final String DEFAULT_MESSAGE = "SQL cursor not found or expired";

    public SqlCursorGoneException() {
        super(DEFAULT_MESSAGE);
    }

    public SqlCursorGoneException(String message) {
        super(message != null && !message.isBlank() ? message : DEFAULT_MESSAGE);
    }
}
