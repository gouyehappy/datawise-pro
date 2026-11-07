package org.apache.datawise.backend.controller.sql;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.domain.ActiveSessionListDto;
import org.apache.datawise.backend.domain.CancelSqlExecutionRequest;
import org.apache.datawise.backend.domain.CancelSqlExecutionResult;
import org.apache.datawise.backend.domain.ExecuteSqlRequest;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.domain.KillSessionRequest;
import org.apache.datawise.backend.domain.KillSessionResultDto;
import org.apache.datawise.backend.domain.LockWaitListDto;
import org.apache.datawise.backend.domain.SqlVisibleConnectionDto;
import org.apache.datawise.backend.database.session.ActiveSessionService;
import org.apache.datawise.backend.database.session.LockWaitService;
import org.apache.datawise.backend.database.session.SessionKillService;
import org.apache.datawise.backend.database.sql.ConsoleSqlCancelService;
import org.apache.datawise.backend.database.sql.SqlService;
import org.apache.datawise.backend.connector.api.support.SqlWriteClassifier;
import org.apache.datawise.backend.security.HeadlessSqlAuth;
import org.apache.datawise.backend.service.SqlVisibleConnectionsService;
import org.apache.datawise.backend.service.TeamService;
import org.apache.datawise.backend.service.FeaturePermissionAccess;
import org.apache.datawise.backend.domain.UserFeaturePermission;
import org.apache.datawise.backend.domain.pack.PackEntitlementChecker;
import org.apache.datawise.backend.domain.pack.PackIds;
import org.apache.datawise.backend.common.support.ApiRequestLogger;
import org.apache.datawise.backend.common.support.PerfLogger;
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

import java.util.List;

@RestController
@RequestMapping("/api/sql")
@Validated
public class SqlController {

    private static final Logger log = LoggerFactory.getLogger(SqlController.class);

    private final SqlService sqlService;
    private final ActiveSessionService activeSessionService;
    private final LockWaitService lockWaitService;
    private final SessionKillService sessionKillService;
    private final ConsoleSqlCancelService consoleSqlCancelService;
    private final TeamService teamService;
    private final FeaturePermissionAccess featurePermissionAccess;
    private final PackEntitlementChecker packEntitlementChecker;
    private final SqlVisibleConnectionsService sqlVisibleConnectionsService;

    public SqlController(
            SqlService sqlService,
            ActiveSessionService activeSessionService,
            LockWaitService lockWaitService,
            SessionKillService sessionKillService,
            ConsoleSqlCancelService consoleSqlCancelService,
            TeamService teamService,
            FeaturePermissionAccess featurePermissionAccess,
            PackEntitlementChecker packEntitlementChecker,
            SqlVisibleConnectionsService sqlVisibleConnectionsService
    ) {
        this.sqlService = sqlService;
        this.activeSessionService = activeSessionService;
        this.lockWaitService = lockWaitService;
        this.sessionKillService = sessionKillService;
        this.consoleSqlCancelService = consoleSqlCancelService;
        this.teamService = teamService;
        this.featurePermissionAccess = featurePermissionAccess;
        this.packEntitlementChecker = packEntitlementChecker;
        this.sqlVisibleConnectionsService = sqlVisibleConnectionsService;
    }

    /**
     * Visible connections for the token / session user (owned + team-shared),
     * with effective access — same semantics as the desktop explorer.
     */
    @GetMapping("/connections")
    public ApiResponse<List<SqlVisibleConnectionDto>> listVisibleConnections() {
        HeadlessSqlAuth.requireSqlAccess();
        return ApiResponse.ok(sqlVisibleConnectionsService.listForCurrentUser());
    }

    @PostMapping("/execute")
    public ApiResponse<ExecuteSqlResult> executeSql(@RequestBody ExecuteSqlRequest request) {
        HeadlessSqlAuth.requireSqlAccess();
        featurePermissionAccess.requireSqlExecute(request.sql());
        int sqlLen = request.sql() != null ? request.sql().length() : 0;
        ApiRequestLogger.logEntry(
                log,
                "POST /api/sql/execute",
                "connectionId", request.connectionId(),
                "database", request.database(),
                "sqlLen", sqlLen
        );
        long startedAt = System.currentTimeMillis();
        try {
            ExecuteSqlResult result = sqlService.execute(request);
            recordTeamSqlAudit(request);
            logSqlPerf(request, startedAt, result);
            ApiRequestLogger.logSuccess(
                    log,
                    "POST /api/sql/execute",
                    "rows", result.rowCount(),
                    "durationMs", result.durationMs()
            );
            return ApiResponse.ok(result);
        } catch (RuntimeException ex) {
            logSqlPerfFailure(request, startedAt);
            ApiRequestLogger.logFailure(
                    log,
                    "POST /api/sql/execute",
                    ex,
                    "connectionId", request.connectionId(),
                    "database", request.database()
            );
            throw ex;
        }
    }

    @DeleteMapping("/cursor")
    public ApiResponse<Void> closeCursor(@RequestParam @NotBlank String cursorId) {
        HeadlessSqlAuth.requireSqlAccess();
        sqlService.closeCursor(cursorId);
        return ApiResponse.ok(null);
    }

    private void logSqlPerf(ExecuteSqlRequest request, long startedAt, ExecuteSqlResult result) {
        PerfLogger.log(
                log,
                resolveSqlPerfOperation(request),
                startedAt,
                perfKeyValues(request, "rowCount", result.rowCount(), "jdbcDurationMs", result.durationMs())
        );
    }

    private void logSqlPerfFailure(ExecuteSqlRequest request, long startedAt) {
        PerfLogger.log(
                log,
                resolveSqlPerfOperation(request),
                startedAt,
                perfKeyValues(request, "ok", false)
        );
    }

    private static String resolveSqlPerfOperation(ExecuteSqlRequest request) {
        if (request.cursorId() != null && !request.cursorId().isBlank()) {
            return "sql.fetchPage";
        }
        if (request.perfSource() != null && !request.perfSource().isBlank()) {
            return "sql.editor.execute";
        }
        return "sql.execute";
    }

    private static Object[] perfKeyValues(ExecuteSqlRequest request, Object... trailing) {
        boolean hasSource = request.perfSource() != null && !request.perfSource().isBlank();
        int baseLen = hasSource ? 6 : 4;
        Object[] values = new Object[baseLen + trailing.length];
        int index = 0;
        if (hasSource) {
            values[index++] = "source";
            values[index++] = request.perfSource();
        }
        values[index++] = "connectionId";
        values[index++] = request.connectionId();
        values[index++] = "database";
        values[index++] = request.database();
        System.arraycopy(trailing, 0, values, index, trailing.length);
        return values;
    }

    private void recordTeamSqlAudit(ExecuteSqlRequest request) {
        String sql = request.sql();
        if (sql == null || sql.isBlank() || !SqlWriteClassifier.requiresWriteAccess(sql)) {
            return;
        }
        String action = SqlWriteClassifier.requiresDangerousSqlConfirmation(sql)
                ? "sql.dangerous"
                : "sql.write";
        try {
            teamService.recordSqlExecutionAudit(
                    action,
                    request.connectionId(),
                    request.database(),
                    sql
            );
        } catch (RuntimeException ex) {
            ApiRequestLogger.logFailure(log, "team sql audit", ex);
            throw new IllegalStateException("SQL_AUDIT_FAILED", ex);
        }
    }

    @GetMapping("/active-sessions")
    public ApiResponse<ActiveSessionListDto> listActiveSessions(
            @RequestParam @NotBlank(message = "connectionId is required") String connectionId,
            @RequestParam(required = false) String database
    ) {
        HeadlessSqlAuth.requireSqlAccess();
        // §1.2: read-only session list is free; Kill / lock analysis need DataOps.
        return ApiResponse.ok(activeSessionService.list(connectionId, database));
    }

    @GetMapping("/lock-waits")
    public ApiResponse<LockWaitListDto> listLockWaits(
            @RequestParam @NotBlank(message = "connectionId is required") String connectionId,
            @RequestParam(required = false) String database
    ) {
        HeadlessSqlAuth.requireSqlAccess();
        packEntitlementChecker.requirePack(PackIds.DATAOPS);
        return ApiResponse.ok(lockWaitService.list(connectionId, database));
    }

    @PostMapping("/kill-session")
    public ApiResponse<KillSessionResultDto> killSession(@Valid @RequestBody KillSessionRequest request) {
        HeadlessSqlAuth.requireSqlAccess();
        packEntitlementChecker.requirePack(PackIds.DATAOPS);
        featurePermissionAccess.requirePermission(UserFeaturePermission.WORKBENCH_CONSOLE_DANGEROUS_SQL);
        ApiRequestLogger.logEntry(
                log,
                "POST /api/sql/kill-session",
                "connectionId", request.connectionId(),
                "sessionId", request.sessionId(),
                "mode", request.mode()
        );
        try {
            KillSessionResultDto result = sessionKillService.kill(request);
            ApiRequestLogger.logSuccess(
                    log,
                    "POST /api/sql/kill-session",
                    "sessionId", result.sessionId(),
                    "killed", result.killed()
            );
            return ApiResponse.ok(result);
        } catch (RuntimeException ex) {
            ApiRequestLogger.logFailure(
                    log,
                    "POST /api/sql/kill-session",
                    ex,
                    "connectionId", request.connectionId(),
                    "sessionId", request.sessionId()
            );
            throw ex;
        }
    }

    @PostMapping("/cancel-execution")
    public ApiResponse<CancelSqlExecutionResult> cancelSqlExecution(
            @Valid @RequestBody CancelSqlExecutionRequest request
    ) {
        HeadlessSqlAuth.requireSqlAccess();
        ApiRequestLogger.logEntry(
                log,
                "POST /api/sql/cancel-execution",
                "sessionKey", request.sessionKey(),
                "mode", request.mode()
        );
        try {
            CancelSqlExecutionResult result = consoleSqlCancelService.cancel(request);
            ApiRequestLogger.logSuccess(
                    log,
                    "POST /api/sql/cancel-execution",
                    "cancelled", result.cancelled(),
                    "mode", result.mode()
            );
            return ApiResponse.ok(result);
        } catch (RuntimeException ex) {
            ApiRequestLogger.logFailure(
                    log,
                    "POST /api/sql/cancel-execution",
                    ex,
                    "sessionKey", request.sessionKey()
            );
            throw ex;
        }
    }
}
