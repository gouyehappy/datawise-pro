package org.apache.datawise.backend.database.sql;

import org.apache.datawise.backend.common.SqlSessionGoneException;
import org.apache.datawise.backend.connector.api.support.SqlSelectDetector;
import org.apache.datawise.backend.connector.api.support.SqlTableDdlClassifier;
import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.connector.facade.jdbc.ConnectorJdbcSessionAccess;
import org.apache.datawise.backend.connector.hook.SqlExecutionHookRunner;
import org.apache.datawise.backend.connector.support.ConnectorCapabilityGuard;
import org.apache.datawise.backend.database.context.ConnectionExecutionContext;
import org.apache.datawise.backend.domain.ExecuteSqlRequest;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.service.ConnectionAccessService;
import org.apache.datawise.backend.service.ProductionWriteGuardService;
import org.apache.datawise.backend.service.outbound.OutboundEventSignals;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.sql.SQLException;

/** SQL 控制台单次执行：校验、鉴权、手动会话与可取消执行。 */
@Service
public class SqlExecuteService {

    private static final Logger log = LoggerFactory.getLogger(SqlExecuteService.class);

    private final ConnectionExecutionContext connectionContext;
    private final ConnectorFacade connectorFacade;
    private final QueryLimitResolver queryLimitResolver;
    private final ConnectionAccessService connectionAccessService;
    private final ProductionWriteGuardService productionWriteGuardService;
    private final SqlCursorService sqlCursorService;
    private final SqlExecutionHookRunner sqlExecutionHookRunner;
    private final OutboundEventSignals outboundEventSignals;
    private final SqlQueryAdmissionService sqlQueryAdmissionService;

    public SqlExecuteService(
            ConnectionExecutionContext connectionContext,
            ConnectorFacade connectorFacade,
            QueryLimitResolver queryLimitResolver,
            ConnectionAccessService connectionAccessService,
            ProductionWriteGuardService productionWriteGuardService,
            SqlCursorService sqlCursorService,
            SqlExecutionHookRunner sqlExecutionHookRunner,
            OutboundEventSignals outboundEventSignals,
            SqlQueryAdmissionService sqlQueryAdmissionService
    ) {
        this.connectionContext = connectionContext;
        this.connectorFacade = connectorFacade;
        this.queryLimitResolver = queryLimitResolver;
        this.connectionAccessService = connectionAccessService;
        this.productionWriteGuardService = productionWriteGuardService;
        this.sqlCursorService = sqlCursorService;
        this.sqlExecutionHookRunner = sqlExecutionHookRunner;
        this.outboundEventSignals = outboundEventSignals;
        this.sqlQueryAdmissionService = sqlQueryAdmissionService;
    }

    public ExecuteSqlResult execute(ExecuteSqlRequest request) {
        long userId = connectionContext.requireUserId();
        try (SqlQueryAdmissionService.Lease ignored = sqlQueryAdmissionService.acquire(userId)) {
            return executeAdmitted(request);
        }
    }

    private ExecuteSqlResult executeAdmitted(ExecuteSqlRequest request) {
        if (request.cursorId() != null && !request.cursorId().isBlank()) {
            return sqlCursorService.fetchCursorPage(request.cursorId(), request.pageSize());
        }

        String trimmed = request.sql() != null ? request.sql().trim() : "";
        if (trimmed.isEmpty()) {
            throw new IllegalArgumentException("SQL is required");
        }
        SqlPayloadLimits.requireWithinLimit(trimmed);

        if (request.connectionId() == null || request.connectionId().isBlank()) {
            throw new IllegalArgumentException("connectionId is required");
        }

        ConnectionExecutionContext.ResolvedConnection resolved = connectionContext.requireAvailableConnectionForCurrentUser(
                request.connectionId(),
                "Connection not found: " + request.connectionId()
        );

        long userId = resolved.userId();
        ConnectionEntity entity = resolved.entity();

        connectionAccessService.requireSqlWriteAccess(userId, request.connectionId(), trimmed);
        productionWriteGuardService.requireProductionWriteAllowed(
                userId,
                entity,
                trimmed,
                request.sessionKey()
        );

        ConnectorCapabilityGuard.requireSqlExecute(connectorFacade, entity);

        String database = ConnectionExecutionContext.resolveDatabase(entity, request.database());

        final String sqlToExecute = sqlExecutionHookRunner.applyBeforeExecute(
                trimmed,
                request.connectionId(),
                database,
                userId
        );

        ConnectorJdbcSessionAccess session = connectorFacade.jdbc().session();

        boolean manualSession = session.requireManualSession(userId, request.sessionKey()) != null;
        Integer pageSize = request.pageSize();
        if (!manualSession && pageSize != null && pageSize > 0 && SqlSelectDetector.isPagedSelect(sqlToExecute)) {
            return sqlCursorService.executePagedFirstPage(
                    userId,
                    entity,
                    database,
                    sqlToExecute,
                    pageSize,
                    request.sessionKey()
            );
        }

        int resolvedMaxRows = queryLimitResolver.resolve(request.maxRows());
        String executionKey = resolveExecutionKey(userId, request.sessionKey());

        try {
            log.debug("SqlExecuteService.execute connectionId={} database={} sessionKey={} sqlPreview={}",
                    request.connectionId(),
                    database,
                    request.sessionKey(),
                    sqlToExecute.length() > 120 ? sqlToExecute.substring(0, 120) + "..." : sqlToExecute);

            if (manualSession) {
                ExecuteSqlResult sessionResult;
                // Paged SELECT must stay on the held TX connection (SQL LIMIT), not pool cursor.
                if (pageSize != null && pageSize > 0 && SqlSelectDetector.isPagedSelect(sqlToExecute)) {
                    int resolvedPageSize = sqlCursorService.resolvePageSize(pageSize);
                    sessionResult = session.executeSelectPageInManualSession(
                            userId,
                            request.sessionKey(),
                            entity,
                            database,
                            sqlToExecute,
                            resolvedPageSize,
                            0,
                            executionKey
                    );
                    if (sessionResult != null) {
                        sessionResult = sqlCursorService.attachCursorIfHasMore(
                                userId,
                                entity,
                                database,
                                sqlToExecute,
                                request.sessionKey(),
                                sessionResult,
                                resolvedPageSize
                        );
                    }
                } else {
                    sessionResult = session.executeInManualSession(
                            userId,
                            request.sessionKey(),
                            entity,
                            database,
                            sqlToExecute,
                            resolvedMaxRows,
                            executionKey
                    );
                }

                if (sessionResult != null) {
                    notifyTableDdlIfNeeded(userId, entity, database, sqlToExecute);
                    return sessionResult;
                }

                throw new SqlSessionGoneException();
            }

            if (executionKey != null) {
                long startedAt = System.currentTimeMillis();
                ExecuteSqlResult result = connectorFacade.jdbc().withConnection(
                        entity,
                        database,
                        connection -> connectorFacade.jdbc().executeOnConnection(
                                connection,
                                sqlToExecute,
                                resolvedMaxRows,
                                executionKey
                        )
                );
                notifyTableDdlIfNeeded(userId, entity, database, sqlToExecute);
                return SqlExecutionSupport.withDuration(result, System.currentTimeMillis() - startedAt);
            }

            ExecuteSqlResult result = connectorFacade.jdbc().execute(entity, sqlToExecute, database, resolvedMaxRows);
            notifyTableDdlIfNeeded(userId, entity, database, sqlToExecute);
            return result;
        } catch (SQLException ex) {
            log.warn("SqlExecuteService.execute failed connectionId={} database={} message={}",
                    request.connectionId(),
                    database,
                    ex.getMessage());
            outboundEventSignals.sqlExecutionFailed(
                    request.connectionId(),
                    entity.getName() != null ? entity.getName() : "",
                    database != null ? database : "",
                    ex.getMessage() != null ? ex.getMessage() : "",
                    userId
            );
            throw SqlExecutionSupport.toSqlExecutionException(entity, ex, sqlToExecute);
        }
    }

    private void notifyTableDdlIfNeeded(
            long userId,
            ConnectionEntity entity,
            String database,
            String sql
    ) {
        SqlTableDdlClassifier.Match match = SqlTableDdlClassifier.match(sql);
        if (match == null) {
            return;
        }
        String connectionId = entity.getId() != null ? entity.getId() : "";
        String name = entity.getName() != null ? entity.getName() : "";
        String db = database != null ? database : "";
        if (match.kind() == SqlTableDdlClassifier.Kind.CREATE) {
            outboundEventSignals.tableCreated(connectionId, name, db, match.tableName(), userId);
        } else if (match.kind() == SqlTableDdlClassifier.Kind.DROP) {
            outboundEventSignals.tableDeleted(connectionId, name, db, match.tableName(), userId);
        }
    }

    private static String resolveExecutionKey(long userId, String sessionKey) {
        if (sessionKey == null || sessionKey.isBlank()) {
            return null;
        }
        return ConsoleSqlCancelService.executionKey(userId, sessionKey);
    }
}
