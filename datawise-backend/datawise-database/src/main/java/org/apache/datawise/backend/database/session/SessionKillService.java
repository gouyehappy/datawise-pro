package org.apache.datawise.backend.database.session;

import org.apache.datawise.backend.database.context.ConnectionExecutionContext;
import org.apache.datawise.backend.service.ConnectionAccessService;

import org.apache.datawise.backend.domain.KillSessionRequest;
import org.apache.datawise.backend.domain.KillSessionResultDto;
import org.apache.datawise.backend.domain.TableRowMutateResult;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.ops.spi.SessionKillOps;
import org.apache.datawise.backend.jdbc.error.JdbcConnectionErrors;
import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.connector.support.ConnectorCapabilityGuard;
import org.springframework.stereotype.Service;

import java.sql.SQLException;

import static org.apache.datawise.backend.ops.spi.SessionKillOps.normalizeMode;

@Service
public class SessionKillService {

    private final ConnectionExecutionContext connectionContext;
    private final ConnectorFacade connectorFacade;
    private final ConnectionAccessService connectionAccessService;

    public SessionKillService(
            ConnectionExecutionContext connectionContext,
            ConnectorFacade connectorFacade,
            ConnectionAccessService connectionAccessService
    ) {
        this.connectionContext = connectionContext;
        this.connectorFacade = connectorFacade;
        this.connectionAccessService = connectionAccessService;
    }

    public KillSessionResultDto kill(KillSessionRequest request) {
        if (request.connectionId() == null || request.connectionId().isBlank()) {
            throw new IllegalArgumentException("connectionId is required");
        }

        ConnectionExecutionContext.ResolvedConnectionWithDatabase resolved =
                connectionContext.requireAvailableWithDatabaseForCurrentUser(
                        request.connectionId(),
                        request.database(),
                        "Connection not found: " + request.connectionId()
                );
        connectionAccessService.requireDdlAccess(resolved.userId(), request.connectionId());

        ConnectionEntity entity = resolved.entity();
        String dbType = entity.getDbType();
        String mode = normalizeMode(request.mode());
        if (!ConnectorCapabilityGuard.hasSessionKill(connectorFacade, entity)) {
            return new KillSessionResultDto(
                    request.sessionId(),
                    mode,
                    "",
                    false,
                    connectorFacade.ops().sessionKillUnsupportedMessage(dbType)
            );
        }

        SessionKillOps ops = connectorFacade.ops().findSessionKill(dbType).orElseThrow();
        String sql = ops.buildKillSql(request.sessionId(), mode);
        try {
            TableRowMutateResult result = connectorFacade.jdbc().executeUpdate(entity, sql, resolved.database());
            return new KillSessionResultDto(
                    request.sessionId().trim(),
                    mode,
                    result.sql(),
                    true,
                    "Session " + request.sessionId().trim() + " kill requested"
            );
        } catch (SQLException ex) {
            if (isSessionNotFound(ex)) {
                return new KillSessionResultDto(
                        request.sessionId().trim(),
                        mode,
                        sql,
                        false,
                        "Session already ended or not found: " + request.sessionId().trim()
                );
            }
            throw JdbcConnectionErrors.toServiceException(entity, ex);
        }
    }

    private boolean isSessionNotFound(SQLException ex) {
        String message = ex.getMessage();
        if (message == null) {
            return false;
        }
        String lower = message.toLowerCase();
        return lower.contains("unknown thread")
                || lower.contains("no such process")
                || lower.contains("not found")
                || ex.getErrorCode() == 1094;
    }
}
