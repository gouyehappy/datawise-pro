package org.apache.datawise.backend.common;

import org.apache.datawise.backend.common.support.ConnectionAccessLevel;

/**
 * Raised when the current user lacks the required access level on a connection.
 */
public class ConnectionAccessDeniedException extends RuntimeException {

    public static final String CODE = "CONNECTION_ACCESS_DENIED";

    private final Long userId;
    private final String connectionId;
    private final String requiredAccess;
    private final String actualAccess;
    private final String operation;

    public ConnectionAccessDeniedException(
                                           Long userId,
                                           String connectionId,
                                           String requiredAccess,
                                           ConnectionAccessLevel actualAccess,
                                           String operation) {
        super(formatMessage(userId, connectionId, requiredAccess, actualAccess, operation));
        this.userId = userId;
        this.connectionId = connectionId;
        this.requiredAccess = requiredAccess;
        this.actualAccess = actualAccess != null ? actualAccess.name() : null;
        this.operation = operation;
    }

    public Long getUserId() {
        return userId;
    }

    public String getConnectionId() {
        return connectionId;
    }

    public String getRequiredAccess() {
        return requiredAccess;
    }

    public String getActualAccess() {
        return actualAccess;
    }

    public String getOperation() {
        return operation;
    }

    private static String formatMessage(
                                        Long userId,
                                        String connectionId,
                                        String requiredAccess,
                                        ConnectionAccessLevel actualAccess,
                                        String operation) {
        StringBuilder message = new StringBuilder(CODE);
        if (connectionId != null && !connectionId.isBlank()) {
            message.append(" connectionId=").append(connectionId.trim());
        }
        if (userId != null) {
            message.append(" userId=").append(userId);
        }
        if (requiredAccess != null && !requiredAccess.isBlank()) {
            message.append(" required=").append(requiredAccess.trim());
        }
        if (actualAccess != null) {
            message.append(" actual=").append(actualAccess.name());
        }
        if (operation != null && !operation.isBlank()) {
            message.append(" op=").append(operation.trim());
        }
        return message.toString();
    }
}
