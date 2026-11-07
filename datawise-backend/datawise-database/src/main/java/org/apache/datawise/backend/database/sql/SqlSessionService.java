package org.apache.datawise.backend.database.sql;

import org.apache.datawise.backend.database.context.ConnectionExecutionContext;
import org.apache.datawise.backend.service.ConnectionAccessService;

import org.apache.datawise.backend.common.SqlExecutionException;
import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.connector.facade.jdbc.ConnectorJdbcSessionAccess;
import org.apache.datawise.backend.domain.SqlSessionAutocommitRequest;
import org.apache.datawise.backend.domain.SqlSessionRequest;
import org.apache.datawise.backend.domain.SqlSessionStatus;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.jdbc.error.JdbcConnectionErrors;
import org.apache.datawise.backend.connector.api.support.SqlErrorLineParser;
import org.springframework.stereotype.Service;

import java.sql.SQLException;

@Service
public class SqlSessionService {

    private final ConnectionExecutionContext connectionContext;
    private final ConnectorFacade connectorFacade;
    private final ConnectionAccessService connectionAccessService;

    public SqlSessionService(
            ConnectionExecutionContext connectionContext,
            ConnectorFacade connectorFacade,
            ConnectionAccessService connectionAccessService
    ) {
        this.connectionContext = connectionContext;
        this.connectorFacade = connectorFacade;
        this.connectionAccessService = connectionAccessService;
    }

    public SqlSessionStatus status(String sessionKey) {
        requireSessionKey(sessionKey);
        long userId = connectionContext.requireUserId();
        return session().getStatus(userId, sessionKey);
    }

    public SqlSessionStatus begin(SqlSessionRequest request) {
        connectionAccessService.requireDmlAccess(connectionContext.requireUserId(), request.connectionId());
        return withConnection(request, (userId, entity, database) ->
                session().begin(userId, request.sessionKey(), entity, database));
    }

    public SqlSessionStatus setAutocommit(SqlSessionAutocommitRequest request) {
        if (!request.autocommit()) {
            connectionAccessService.requireDmlAccess(connectionContext.requireUserId(), request.connectionId());
        }
        return withConnection(
                new SqlSessionRequest(request.sessionKey(), request.connectionId(), request.database()),
                (userId, entity, database) ->
                        session().setAutocommit(
                                userId,
                                request.sessionKey(),
                                entity,
                                database,
                                request.autocommit()
                        )
        );
    }

    public SqlSessionStatus commit(SqlSessionRequest request) {
        requireSessionKey(request.sessionKey());
        long userId = connectionContext.requireUserId();
        connectionAccessService.requireDmlAccess(userId, request.connectionId());
        ConnectionEntity entity = resolveConnectionEntity(request.connectionId(), userId);
        try {
            return session().commit(userId, request.sessionKey());
        } catch (SQLException ex) {
            throw toSqlExecutionException(entity, ex, "COMMIT");
        }
    }

    public SqlSessionStatus rollback(SqlSessionRequest request) {
        requireSessionKey(request.sessionKey());
        long userId = connectionContext.requireUserId();
        connectionAccessService.requireDmlAccess(userId, request.connectionId());
        ConnectionEntity entity = resolveConnectionEntity(request.connectionId(), userId);
        try {
            return session().rollback(userId, request.sessionKey());
        } catch (SQLException ex) {
            throw toSqlExecutionException(entity, ex, "ROLLBACK");
        }
    }

    public void close(String sessionKey) {
        requireSessionKey(sessionKey);
        long userId = connectionContext.requireUserId();
        session().closeSession(userId, sessionKey);
    }

    @FunctionalInterface
    private interface SessionAction {
        SqlSessionStatus apply(long userId, ConnectionEntity entity, String database) throws SQLException;
    }

    private SqlSessionStatus withConnection(SqlSessionRequest request, SessionAction action) {
        requireSessionKey(request.sessionKey());
        long userId = connectionContext.requireUserId();
        ConnectionEntity entity = resolveConnectionEntity(request.connectionId(), userId);
        String database = request.database();
        try {
            return action.apply(userId, entity, database);
        } catch (SQLException ex) {
            throw toSqlExecutionException(entity, ex, "transaction");
        }
    }

    private ConnectorJdbcSessionAccess session() {
        return connectorFacade.jdbc().session();
    }

    private ConnectionEntity resolveConnectionEntity(String connectionId, long userId) {
        return connectionContext.requireConnection(userId, connectionId, "Connection not found: " + connectionId)
                .entity();
    }

    private void requireSessionKey(String sessionKey) {
        if (sessionKey == null || sessionKey.isBlank()) {
            throw new IllegalArgumentException("sessionKey is required");
        }
    }

    private SqlExecutionException toSqlExecutionException(ConnectionEntity entity, SQLException ex, String sql) {
        Integer errorLine = SqlErrorLineParser.parseLine(ex.getMessage(), sql);
        return new SqlExecutionException(JdbcConnectionErrors.toUserMessage(entity, ex), ex, errorLine);
    }
}
