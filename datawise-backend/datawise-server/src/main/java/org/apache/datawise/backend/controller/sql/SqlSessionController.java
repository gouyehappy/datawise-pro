package org.apache.datawise.backend.controller.sql;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.domain.SqlSessionAutocommitRequest;
import org.apache.datawise.backend.domain.SqlSessionRequest;
import org.apache.datawise.backend.domain.SqlSessionStatus;
import org.apache.datawise.backend.database.sql.SqlSessionService;
import org.apache.datawise.backend.common.support.ApiRequestLogger;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;

import org.apache.datawise.backend.domain.UserFeaturePermission;
import org.apache.datawise.backend.security.RequiresFeature;

@RestController
@RequestMapping("/api/sql/session")
@Validated
@RequiresFeature(UserFeaturePermission.WORKBENCH_CONSOLE_TRANSACTION)
public class SqlSessionController {

    private static final Logger log = LoggerFactory.getLogger(SqlSessionController.class);

    private final SqlSessionService sqlSessionService;

    public SqlSessionController(SqlSessionService sqlSessionService) {
        this.sqlSessionService = sqlSessionService;
    }

    @GetMapping("/status")
    public ApiResponse<SqlSessionStatus> status(
            @RequestParam @NotBlank(message = "sessionKey is required") String sessionKey
    ) {
        ApiRequestLogger.logEntry(log, "GET /api/sql/session/status", "sessionKey", sessionKey);
        return ApiResponse.ok(sqlSessionService.status(sessionKey));
    }

    @PostMapping("/begin")
    public ApiResponse<SqlSessionStatus> begin(@Valid @RequestBody SqlSessionRequest request) {
        ApiRequestLogger.logEntry(
                log,
                "POST /api/sql/session/begin",
                "sessionKey", request.sessionKey(),
                "connectionId", request.connectionId()
        );
        return ApiResponse.ok(sqlSessionService.begin(request));
    }

    @PostMapping("/autocommit")
    public ApiResponse<SqlSessionStatus> autocommit(@Valid @RequestBody SqlSessionAutocommitRequest request) {
        ApiRequestLogger.logEntry(
                log,
                "POST /api/sql/session/autocommit",
                "sessionKey", request.sessionKey(),
                "autocommit", request.autocommit()
        );
        return ApiResponse.ok(sqlSessionService.setAutocommit(request));
    }

    @PostMapping("/commit")
    public ApiResponse<SqlSessionStatus> commit(@Valid @RequestBody SqlSessionRequest request) {
        ApiRequestLogger.logEntry(log, "POST /api/sql/session/commit", "sessionKey", request.sessionKey());
        return ApiResponse.ok(sqlSessionService.commit(request));
    }

    @PostMapping("/rollback")
    public ApiResponse<SqlSessionStatus> rollback(@Valid @RequestBody SqlSessionRequest request) {
        ApiRequestLogger.logEntry(log, "POST /api/sql/session/rollback", "sessionKey", request.sessionKey());
        return ApiResponse.ok(sqlSessionService.rollback(request));
    }

    @DeleteMapping
    public ApiResponse<Void> close(
            @RequestParam @NotBlank(message = "sessionKey is required") String sessionKey
    ) {
        ApiRequestLogger.logEntry(log, "DELETE /api/sql/session", "sessionKey", sessionKey);
        sqlSessionService.close(sessionKey);
        return ApiResponse.ok(null);
    }
}
