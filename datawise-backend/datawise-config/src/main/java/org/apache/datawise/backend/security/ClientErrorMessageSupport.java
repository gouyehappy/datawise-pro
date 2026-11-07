package org.apache.datawise.backend.security;

import org.apache.datawise.backend.common.ConnectionAccessDeniedException;
import org.apache.datawise.backend.common.ProductionWriteBlockedException;
import org.apache.datawise.backend.common.UnauthorizedException;
import org.apache.datawise.backend.service.UserAccessPolicy;
import org.apache.datawise.backend.service.UserAdminPolicy;
import org.apache.datawise.backend.service.UserPermissionPolicy;

/**
 * Maps internal exception text to stable client-facing messages (especially for API-token / CI callers).
 */
public final class ClientErrorMessageSupport {

    public static final String GENERIC_BAD_REQUEST = "Request failed";
    public static final String SQL_EXECUTION_FAILED = "SQL execution failed";
    public static final String IO_ERROR = "IO error";

    private ClientErrorMessageSupport() {
    }

    public static String forClient(String message) {
        if (message == null || message.isBlank()) {
            return GENERIC_BAD_REQUEST;
        }
        if (!UserContext.isApiTokenAuth()) {
            return message;
        }
        if (isStableCode(message)) {
            return message;
        }
        if (isValidationMessage(message)) {
            return message;
        }
        return GENERIC_BAD_REQUEST;
    }

    public static String sqlExecutionMessage(String detail) {
        if (!UserContext.isApiTokenAuth()) {
            return detail != null && !detail.isBlank() ? detail : SQL_EXECUTION_FAILED;
        }
        return SQL_EXECUTION_FAILED;
    }

    public static String ioMessage() {
        return IO_ERROR;
    }

    private static boolean isStableCode(String message) {
        return HeadlessMigrationAuth.API_TOKEN_FORBIDDEN.equals(message)
                || UserAdminPolicy.ADMIN_REQUIRED.equals(message)
                || UserPermissionPolicy.PERMISSION_DENIED.equals(message)
                || UserAccessPolicy.GUEST_NOT_ALLOWED.equals(message)
                || ConnectionAccessDeniedException.CODE.equals(message)
                || UnauthorizedException.CODE.equals(message)
                || ProductionWriteBlockedException.CODE.equals(message);
    }

    private static boolean isValidationMessage(String message) {
        String lower = message.toLowerCase();
        return lower.contains(" is required")
                || lower.contains(" not found")
                || lower.contains("not supported")
                || lower.contains("invalid ")
                || lower.contains("must not")
                || lower.contains("cannot ")
                || lower.startsWith("connection ")
                || lower.startsWith("sql ");
    }
}
