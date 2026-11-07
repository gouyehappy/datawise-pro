package org.apache.datawise.backend.common;

import org.apache.datawise.backend.database.explorer.ExplorerNodeResolver;
import org.apache.datawise.backend.ddl.DdlException;
import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.apache.datawise.backend.security.ClientErrorMessageSupport;
import org.apache.datawise.backend.security.HeadlessMigrationAuth;
import org.apache.datawise.backend.service.UserAdminPolicy;
import org.apache.datawise.backend.service.UserPermissionPolicy;
import org.apache.datawise.backend.jdbc.error.JdbcConnectionErrors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.async.AsyncRequestNotUsableException;
import org.springframework.web.bind.MethodArgumentNotValidException;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.ConstraintViolationException;

import java.io.IOException;
import java.sql.SQLException;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final String INTERNAL_ERROR_MESSAGE = "Internal error";

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(SqlExecutionException.class)
    public ResponseEntity<ApiResponse<Map<String, Object>>> handleSqlExecution(SqlExecutionException ex) {
        ExceptionLogging.warn(log, "SqlExecutionException", ex);
        Map<String, Object> data = new LinkedHashMap<>();
        boolean timeout = JdbcConnectionErrors.isQueryTimeoutOrCancel(ex);
        data.put("errorCode", timeout ? DatawiseErrorCodes.SQL_QUERY_TIMEOUT : DatawiseErrorCodes.SQL_EXECUTION_FAILED);
        if (ex.getErrorLine() != null) {
            data.put("errorLine", ex.getErrorLine());
        }
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(new ApiResponse<>(-1, ClientErrorMessageSupport.sqlExecutionMessage(ex.getMessage()), data));
    }

    @ExceptionHandler(DdlException.class)
    public ResponseEntity<ApiResponse<Map<String, Object>>> handleDdlException(DdlException ex) {
        ExceptionLogging.warn(log, "DdlException [" + ex.errorCode() + "]", ex);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("errorCode", ex.errorCode() != null ? ex.errorCode().name() : DatawiseErrorCodes.DDL);
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(new ApiResponse<>(-1, ex.getMessage(), data));
    }

    @ExceptionHandler(ExplorerConnectionException.class)
    public ResponseEntity<ApiResponse<Map<String, Object>>> handleExplorerConnection(ExplorerConnectionException ex) {
        ExceptionLogging.warn(log, "ExplorerConnectionException [" + ex.getErrorCode() + "]", ex);
        Map<String, Object> data = ex.toResponseData();
        if (data == null) {
            data = new LinkedHashMap<>();
        } else {
            data = new LinkedHashMap<>(data);
        }
        data.putIfAbsent("errorCode", ex.getErrorCode() != null ? ex.getErrorCode() : DatawiseErrorCodes.EXPLORER_CONNECTION);
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(new ApiResponse<>(-1, ex.getMessage(), data));
    }

    @ExceptionHandler(TableDataException.class)
    public ResponseEntity<ApiResponse<Map<String, Object>>> handleTableData(TableDataException ex) {
        ExceptionLogging.warn(log, "TableDataException [" + ex.getErrorCode() + "]", ex);
        Map<String, Object> data = ex.toResponseData();
        if (data == null) {
            data = new LinkedHashMap<>();
        } else {
            data = new LinkedHashMap<>(data);
        }
        data.putIfAbsent("errorCode", ex.getErrorCode() != null ? ex.getErrorCode() : DatawiseErrorCodes.TABLE_DATA);
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(new ApiResponse<>(-1, ex.getMessage(), data));
    }

    @ExceptionHandler(DatabaseServiceException.class)
    public ResponseEntity<ApiResponse<Map<String, Object>>> handleDatabaseService(DatabaseServiceException ex) {
        ExceptionLogging.warn(log, "DatabaseServiceException [" + ex.getErrorCode() + "]", ex);
        Map<String, Object> data = ex.toResponseData();
        if (data == null) {
            data = new LinkedHashMap<>();
        } else {
            data = new LinkedHashMap<>(data);
        }
        data.putIfAbsent("errorCode", ex.getErrorCode() != null ? ex.getErrorCode() : DatawiseErrorCodes.DATABASE_SERVICE);
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(new ApiResponse<>(-1, ex.getMessage(), data));
    }

    @ExceptionHandler(ProductionWriteBlockedException.class)
    public ResponseEntity<ApiResponse<Map<String, Object>>> handleProductionWriteBlocked(
            ProductionWriteBlockedException ex
    ) {
        ExceptionLogging.warn(log, "production.write.blocked", ex);
        Map<String, Object> data = Map.of("errorCode", DatawiseErrorCodes.SQL_PRODUCTION_APPROVAL_REQUIRED);
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(new ApiResponse<>(-1, ProductionWriteBlockedException.CODE, data));
    }

    @ExceptionHandler(SqlConcurrencyLimitException.class)
    public ResponseEntity<ApiResponse<Map<String, Object>>> handleSqlConcurrencyLimit(
            SqlConcurrencyLimitException ex
    ) {
        ExceptionLogging.warn(log, "sql.concurrency.limit", ex);
        Map<String, Object> data = Map.of("errorCode", DatawiseErrorCodes.SQL_CONCURRENCY_LIMIT);
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .body(new ApiResponse<>(-1, ex.getMessage(), data));
    }

    @ExceptionHandler(SqlSessionGoneException.class)
    public ResponseEntity<ApiResponse<Map<String, Object>>> handleSqlSessionGone(SqlSessionGoneException ex) {
        ExceptionLogging.warn(log, "sql.session.gone", ex);
        Map<String, Object> data = Map.of("errorCode", DatawiseErrorCodes.SQL_SESSION_GONE);
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(new ApiResponse<>(-1, ex.getMessage(), data));
    }

    @ExceptionHandler(SqlCursorGoneException.class)
    public ResponseEntity<ApiResponse<Map<String, Object>>> handleSqlCursorGone(SqlCursorGoneException ex) {
        ExceptionLogging.warn(log, "sql.cursor.gone", ex);
        Map<String, Object> data = Map.of("errorCode", DatawiseErrorCodes.SQL_CURSOR_GONE);
        // Keep 400: previously IllegalArgumentException for the same condition.
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(new ApiResponse<>(-1, ex.getMessage(), data));
    }

    @ExceptionHandler(SqlDeepOffsetException.class)
    public ResponseEntity<ApiResponse<Map<String, Object>>> handleSqlDeepOffset(SqlDeepOffsetException ex) {
        ExceptionLogging.warn(log, "sql.cursor.offset.limit", ex);
        Map<String, Object> data = Map.of("errorCode", DatawiseErrorCodes.SQL_CURSOR_OFFSET_LIMIT);
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(new ApiResponse<>(-1, ex.getMessage(), data));
    }

    @ExceptionHandler(ConnectionAccessDeniedException.class)
    public ResponseEntity<ApiResponse<Map<String, Object>>> handleConnectionAccessDenied(ConnectionAccessDeniedException ex) {
        ExceptionLogging.warn(log, "connection.access.denied", ex);
        Map<String, Object> data = Map.of("errorCode", DatawiseErrorCodes.CONNECTION_ACCESS_DENIED);
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(new ApiResponse<>(-1, ConnectionAccessDeniedException.CODE, data));
    }

    @ExceptionHandler(UnauthorizedException.class)
    public ResponseEntity<ApiResponse<Map<String, Object>>> handleUnauthorized(UnauthorizedException ex) {
        Map<String, Object> data = Map.of("errorCode", DatawiseErrorCodes.UNAUTHORIZED);
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(new ApiResponse<>(-1, UnauthorizedException.CODE, data));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Map<String, Object>>> handleMethodArgumentNotValid(
            MethodArgumentNotValidException ex
    ) {
        String message = ex.getBindingResult().getFieldErrors().stream()
                .map(error -> error.getDefaultMessage() != null && !error.getDefaultMessage().isBlank()
                        ? error.getDefaultMessage()
                        : error.getField() + " is invalid")
                .findFirst()
                .orElse(DatawiseErrorCodes.BAD_REQUEST);
        ExceptionLogging.warn(log, "MethodArgumentNotValidException", ex);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("errorCode", DatawiseErrorCodes.BAD_REQUEST);
        data.put(
                "fields",
                ex.getBindingResult().getFieldErrors().stream()
                        .collect(Collectors.toMap(
                                error -> error.getField(),
                                error -> error.getDefaultMessage() != null ? error.getDefaultMessage() : "invalid",
                                (left, right) -> left,
                                LinkedHashMap::new
                        ))
        );
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(new ApiResponse<>(-1, ClientErrorMessageSupport.forClient(message), data));
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ApiResponse<Map<String, Object>>> handleConstraintViolation(
            ConstraintViolationException ex
    ) {
        String message = ex.getConstraintViolations().stream()
                .map(ConstraintViolation::getMessage)
                .filter(value -> value != null && !value.isBlank())
                .findFirst()
                .orElse(DatawiseErrorCodes.BAD_REQUEST);
        ExceptionLogging.warn(log, "ConstraintViolationException", ex);
        Map<String, Object> data = Map.of("errorCode", DatawiseErrorCodes.BAD_REQUEST);
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(new ApiResponse<>(-1, ClientErrorMessageSupport.forClient(message), data));
    }

    @ExceptionHandler(org.apache.datawise.backend.domain.communityplugin.CommunityPluginException.class)
    public ResponseEntity<ApiResponse<Void>> handleCommunityPlugin(
            org.apache.datawise.backend.domain.communityplugin.CommunityPluginException ex
    ) {
        log.warn("Community plugin error: {}", ex.getMessage());
        return ResponseEntity.badRequest().body(ApiResponse.fail(ex.getMessage()));
    }

    @ExceptionHandler(PackEntitlementException.class)
    public ResponseEntity<ApiResponse<Map<String, Object>>> handlePackEntitlement(PackEntitlementException ex) {
        ExceptionLogging.warn(log, "PackEntitlementException [" + ex.errorCode() + "]", ex);
        Map<String, Object> data = new java.util.LinkedHashMap<>();
        data.put("errorCode", ex.errorCode());
        if (ex.packId() != null && !ex.packId().isBlank()) {
            data.put("packId", ex.packId());
        }
        HttpStatus status = HttpStatus.resolve(ex.httpStatus());
        if (status == null) {
            status = HttpStatus.PAYMENT_REQUIRED;
        }
        return ResponseEntity.status(status)
                .body(new ApiResponse<>(-1, ex.getMessage(), data));
    }

    @ExceptionHandler(DatasourceTypeRequiredException.class)
    public ResponseEntity<ApiResponse<Map<String, Object>>> handleDatasourceTypeRequired(
            DatasourceTypeRequiredException ex
    ) {
        ExceptionLogging.warn(log, "DatasourceTypeRequiredException", ex);
        Map<String, Object> data = Map.of("errorCode", DatasourceTypeRequiredException.CODE);
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(new ApiResponse<>(-1, ex.getMessage(), data));
    }

    @ExceptionHandler(DatasourceNotAvailableException.class)
    public ResponseEntity<ApiResponse<Map<String, Object>>> handleDatasourceNotAvailable(
            DatasourceNotAvailableException ex
    ) {
        ExceptionLogging.warn(log, "DatasourceNotAvailableException", ex);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("errorCode", DatasourceNotAvailableException.CODE);
        if (ex.dbType() != null && !ex.dbType().isBlank()) {
            data.put("dbType", ex.dbType());
        }
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(new ApiResponse<>(-1, ex.getMessage(), data));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiResponse<Map<String, Object>>> handleIllegalArgument(IllegalArgumentException ex) {
        ExceptionLogging.warn(log, "IllegalArgumentException", ex);
        if (HeadlessMigrationAuth.API_TOKEN_FORBIDDEN.equals(ex.getMessage())
                || UserAdminPolicy.ADMIN_REQUIRED.equals(ex.getMessage())
                || UserPermissionPolicy.PERMISSION_DENIED.equals(ex.getMessage())
                || DatawiseErrorCodes.TEAM_AUDIT_FORBIDDEN.equals(ex.getMessage())
                || DatawiseErrorCodes.MAKER_CHECKER_SELF_APPROVE.equals(ex.getMessage())) {
            Map<String, Object> data = Map.of("errorCode", ex.getMessage());
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(new ApiResponse<>(-1, ex.getMessage(), data));
        }
        // Legacy tenant quota strings → structured codes (Wave 31–32)
        if ("TENANT_AI_QUOTA_EXCEEDED".equals(ex.getMessage())) {
            return handlePackEntitlement(PackEntitlementException.quotaExceeded(
                    "Organization AI daily quota exceeded"
            ));
        }
        if ("TENANT_CONNECTION_QUOTA_EXCEEDED".equals(ex.getMessage())) {
            return handlePackEntitlement(PackEntitlementException.connectionQuotaExceeded(
                    "Organization connection quota exceeded"
            ));
        }
        String message = ex.getMessage();
        if ("EXPLORER_NODE_NOT_FOUND".equals(message)) {
            return handleExplorerConnection(ExplorerNodeResolver.nodeNotFound());
        }
        if (isStableAuthClientCode(message)) {
            Map<String, Object> data = Map.of("errorCode", message);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(new ApiResponse<>(-1, message, data));
        }
        Map<String, Object> data = Map.of("errorCode", DatawiseErrorCodes.BAD_REQUEST);
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(new ApiResponse<>(-1, ClientErrorMessageSupport.forClient(ex.getMessage()), data));
    }

    /** Auth / password / OIDC / profile-portability flows throw ALL_CAPS codes as IllegalArgumentException messages. */
    private static boolean isStableAuthClientCode(String message) {
        if (message == null || message.isBlank()) {
            return false;
        }
        if (message.startsWith("OIDC_")) {
            return true;
        }
        return switch (message) {
            case "INVALID_CREDENTIALS",
                 "INVALID_PASSWORD",
                 "PASSWORD_TOO_SHORT",
                 "PASSWORD_UNCHANGED",
                 "PASSWORD_NOT_SET",
                 "LOGIN_LOCKED",
                 "USERNAME_TAKEN",
                 "REGISTRATION_DISABLED",
                 "LOCAL_LOGIN_DISABLED",
                 "NO_DOMAINS_SELECTED",
                 "PASSPHRASE_MISMATCH",
                 "PASSPHRASE_INCORRECT",
                 "SCHEMA_UNSUPPORTED",
                 "LEGACY_UNSUPPORTED",
                 "CONNECTION_NOT_FOUND" -> true;
            default -> false;
        };
    }

    @ExceptionHandler(ConnectionCatalogConflictException.class)
    public ResponseEntity<ApiResponse<Map<String, Object>>> handleConnectionCatalogConflict(
            ConnectionCatalogConflictException ex
    ) {
        Map<String, Object> data = Map.of("errorCode", ConnectionCatalogConflictException.CODE);
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(new ApiResponse<>(-1,
                        "Connection catalog was updated concurrently; retry the operation", data));
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<ApiResponse<Map<String, Object>>> handleIllegalState(IllegalStateException ex) {
        if (DatawiseErrorCodes.SQL_AUDIT_FAILED.equals(ex.getMessage())) {
            ExceptionLogging.error(log, "SQL_AUDIT_FAILED", ex);
            Map<String, Object> data = Map.of("errorCode", DatawiseErrorCodes.SQL_AUDIT_FAILED);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(new ApiResponse<>(-1, DatawiseErrorCodes.SQL_AUDIT_FAILED, data));
        }
        ExceptionLogging.error(log, "IllegalStateException", ex);
        Map<String, Object> data = Map.of("errorCode", DatawiseErrorCodes.INTERNAL_ERROR);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(new ApiResponse<>(-1, INTERNAL_ERROR_MESSAGE, data));
    }

    @ExceptionHandler(SQLException.class)
    public ResponseEntity<ApiResponse<Map<String, Object>>> handleSqlException(SQLException ex) {
        ExceptionLogging.error(log, "Unhandled SQLException (should be converted in service layer)", ex);
        String errorCode = JdbcConnectionErrors.resolveErrorCode(ex);
        Map<String, Object> data = Map.of("errorCode", errorCode);
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(new ApiResponse<>(-1, JdbcConnectionErrors.toUserMessage(ex), data));
    }

    @ExceptionHandler(AsyncRequestNotUsableException.class)
    public ResponseEntity<Void> handleAsyncRequestNotUsable(AsyncRequestNotUsableException ex) {
        // 休眠唤醒后客户端已断开，响应写回失败属预期，不刷栈
        if (log.isDebugEnabled()) {
            log.debug("Client abandoned response: {}", ex.getMessage());
        }
        return ResponseEntity.noContent().build();
    }

    @ExceptionHandler(IOException.class)
    public ResponseEntity<ApiResponse<Map<String, Object>>> handleIOException(IOException ex) {
        if (isClientAbort(ex)) {
            if (log.isDebugEnabled()) {
                log.debug("Client aborted connection: {}", ex.getMessage());
            }
            return ResponseEntity.noContent().build();
        }
        ExceptionLogging.warn(log, "IOException", ex);
        Map<String, Object> data = Map.of("errorCode", DatawiseErrorCodes.IO_ERROR);
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(new ApiResponse<>(-1, ClientErrorMessageSupport.ioMessage(), data));
    }

    private static boolean isClientAbort(Throwable ex) {
        Throwable current = ex;
        while (current != null) {
            String name = current.getClass().getName();
            if (name.endsWith("ClientAbortException") || name.endsWith("AsyncRequestNotUsableException")) {
                return true;
            }
            String message = current.getMessage();
            if (message != null) {
                String lower = message.toLowerCase(Locale.ROOT);
                if (lower.contains("你的主机中的软件中止了一个已建立的连接")
                        || lower.contains("connection reset by peer")
                        || lower.contains("broken pipe")
                        || lower.contains("an established connection was aborted")) {
                    return true;
                }
            }
            current = current.getCause();
        }
        return false;
    }

    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<ApiResponse<Map<String, Object>>> handleRuntime(RuntimeException ex) {
        ExceptionLogging.error(log, "RuntimeException", ex);
        Map<String, Object> data = Map.of("errorCode", DatawiseErrorCodes.INTERNAL_ERROR);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(new ApiResponse<>(-1, INTERNAL_ERROR_MESSAGE, data));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Map<String, Object>>> handleGeneric(Exception ex) {
        ExceptionLogging.error(log, "Unhandled exception", ex);
        Map<String, Object> data = Map.of("errorCode", DatawiseErrorCodes.INTERNAL_ERROR);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(new ApiResponse<>(-1, INTERNAL_ERROR_MESSAGE, data));
    }
}
