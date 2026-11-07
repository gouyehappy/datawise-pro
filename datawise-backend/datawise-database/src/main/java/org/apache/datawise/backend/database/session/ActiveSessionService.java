package org.apache.datawise.backend.database.session;

import org.apache.datawise.backend.database.context.ConnectionExecutionContext;

import org.apache.datawise.backend.domain.ActiveSessionListDto;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.ops.spi.ActiveSessionOps;
import org.apache.datawise.backend.jdbc.error.JdbcConnectionErrors;
import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.connector.support.ConnectorCapabilityGuard;
import org.springframework.stereotype.Service;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;

@Service
public class ActiveSessionService {

    private final ConnectionExecutionContext connectionContext;
    private final ConnectorFacade connectorFacade;

    public ActiveSessionService(
            ConnectionExecutionContext connectionContext,
            ConnectorFacade connectorFacade
    ) {
        this.connectionContext = connectionContext;
        this.connectorFacade = connectorFacade;
    }

    public ActiveSessionListDto list(String connectionId, String database) {
        if (connectionId == null || connectionId.isBlank()) {
            throw new IllegalArgumentException("connectionId is required");
        }

        ConnectionExecutionContext.ResolvedConnectionWithDatabase resolved =
                connectionContext.requireAvailableWithDatabaseForCurrentUser(
                        connectionId,
                        database,
                        "Connection not found: " + connectionId
                );
        ConnectionEntity entity = resolved.entity();
        String dbType = entity.getDbType();
        if (!ConnectorCapabilityGuard.hasSessionMonitor(connectorFacade, entity)) {
            return new ActiveSessionListDto(
                    List.of(),
                    false,
                    connectorFacade.ops().activeSessionUnsupportedMessage(dbType)
            );
        }

        ActiveSessionOps ops = connectorFacade.ops().findActiveSession(dbType).orElseThrow();

        try {
            return connectorFacade.jdbc().withConnection(entity, resolved.database(), connection -> {
                String selfSessionId = readSelfSessionId(connection, ops);
                String sql = ops.buildQuery();
                ExecuteSqlResult result = connectorFacade.jdbc().executeOnConnection(connection, sql, 500);
                List<org.apache.datawise.backend.domain.ActiveSessionDto> sessions =
                        ops.parseSessions(result, selfSessionId);
                return new ActiveSessionListDto(sessions, true, null);
            });
        } catch (SQLException ex) {
            throw JdbcConnectionErrors.toServiceException(entity, ex);
        }
    }

    private String readSelfSessionId(Connection connection, ActiveSessionOps ops) throws SQLException {
        String sql = ops.buildSelfSessionIdQuery();
        ExecuteSqlResult result = connectorFacade.jdbc().executeOnConnection(connection, sql, 1);
        return ops.readSelfSessionId(result);
    }
}
