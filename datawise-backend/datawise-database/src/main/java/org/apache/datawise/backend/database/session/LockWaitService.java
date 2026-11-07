package org.apache.datawise.backend.database.session;

import org.apache.datawise.backend.database.context.ConnectionExecutionContext;

import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.domain.LockWaitEdgeDto;
import org.apache.datawise.backend.domain.LockWaitListDto;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.ops.spi.LockWaitOps;
import org.apache.datawise.backend.jdbc.support.DbTypeFamilies;
import org.apache.datawise.backend.jdbc.error.JdbcConnectionErrors;
import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.connector.support.ConnectorCapabilityGuard;
import org.springframework.stereotype.Service;

import java.sql.SQLException;
import java.util.List;

@Service
public class LockWaitService {

    private final ConnectionExecutionContext connectionContext;
    private final ConnectorFacade connectorFacade;

    public LockWaitService(
            ConnectionExecutionContext connectionContext,
            ConnectorFacade connectorFacade
    ) {
        this.connectionContext = connectionContext;
        this.connectorFacade = connectorFacade;
    }

    public LockWaitListDto list(String connectionId, String database) {
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
        if (!ConnectorCapabilityGuard.hasLockMonitor(connectorFacade, entity)) {
            return new LockWaitListDto(
                    List.of(),
                    false,
                    connectorFacade.ops().lockWaitUnsupportedMessage(dbType)
            );
        }

        LockWaitOps ops = connectorFacade.ops().findLockWait(dbType).orElseThrow();

        try {
            ExecuteSqlResult result = executeLockWaitQuery(entity, dbType, resolved.database(), ops);
            List<LockWaitEdgeDto> edges = ops.parseEdges(result);
            return new LockWaitListDto(edges, true, null);
        } catch (SQLException ex) {
            throw JdbcConnectionErrors.toServiceException(entity, ex);
        }
    }

    private ExecuteSqlResult executeLockWaitQuery(
            ConnectionEntity entity,
            String dbType,
            String database,
            LockWaitOps ops
    ) throws SQLException {
        if (DbTypeFamilies.isMysqlFamily(dbType)) {
            try {
                return connectorFacade.jdbc().execute(entity, ops.buildQuery(false), database, 500);
            } catch (SQLException modernEx) {
                return connectorFacade.jdbc().execute(entity, ops.buildQuery(true), database, 500);
            }
        }
        return connectorFacade.jdbc().execute(entity, ops.buildQuery(false), database, 500);
    }
}
