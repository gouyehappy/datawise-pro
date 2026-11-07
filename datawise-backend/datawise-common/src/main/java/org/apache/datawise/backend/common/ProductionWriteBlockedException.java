package org.apache.datawise.backend.common;

/**
 * Raised when a write SQL hits a production connection that requires team approval.
 */
public class ProductionWriteBlockedException extends RuntimeException {

    public static final String CODE = "SQL_PRODUCTION_APPROVAL_REQUIRED";

    private final Long userId;
    private final String connectionId;

    public ProductionWriteBlockedException(Long userId, String connectionId) {
        super(CODE);
        this.userId = userId;
        this.connectionId = connectionId;
    }

    public Long getUserId() {
        return userId;
    }

    public String getConnectionId() {
        return connectionId;
    }
}
