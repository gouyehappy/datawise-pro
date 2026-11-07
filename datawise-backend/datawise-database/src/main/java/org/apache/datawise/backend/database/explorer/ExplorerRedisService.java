package org.apache.datawise.backend.database.explorer;

import org.apache.datawise.backend.database.context.ConnectionExecutionContext;

import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.domain.RedisCommandResultDto;
import org.apache.datawise.backend.domain.RedisKeyDetailDto;
import org.apache.datawise.backend.domain.RedisKeysScanResultDto;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.springframework.stereotype.Service;

/**
 * Redis-specific Explorer operations kept outside schema/tree orchestration.
 */
@Service
public class ExplorerRedisService {

    private final ConnectionExecutionContext connectionContext;
    private final ConnectorFacade connectorFacade;

    public ExplorerRedisService(
            ConnectionExecutionContext connectionContext,
            ConnectorFacade connectorFacade
    ) {
        this.connectionContext = connectionContext;
        this.connectorFacade = connectorFacade;
    }

    /** Returns one key payload for Redis preview panel. */
    public RedisKeyDetailDto getRedisKeyDetail(String connectionId, String key, Integer database) {
        ConnectionEntity connection = resolveRedisConnection(requireAvailableExplorerConnection(connectionId), database);
        return connectorFacade.nativeAccess().fetchKeyDetail(connection, key);
    }

    /** Scans Redis keys with bounded page size to prevent expensive one-shot scans. */
    public RedisKeysScanResultDto scanRedisKeys(
            String connectionId,
            String pattern,
            String cursor,
            Integer count,
            Integer database
    ) {
        ConnectionEntity connection = resolveRedisConnection(requireAvailableExplorerConnection(connectionId), database);
        int pageSize = count == null || count <= 0 ? 50 : Math.min(count, 500);
        return connectorFacade.nativeAccess().scanKeys(connection, pattern, cursor, pageSize);
    }

    /** Executes raw Redis command text through connector native command capability. */
    public RedisCommandResultDto executeRedisCommand(String connectionId, String command, Integer database) {
        RedisExplorerCommandPolicy.requireAllowed(command);
        ConnectionEntity connection = resolveRedisConnection(requireAvailableExplorerConnection(connectionId), database);
        return connectorFacade.nativeAccess().executeCommand(connection, command);
    }

    /** Applies a per-request Redis logical DB override without mutating the stored connection profile. */
    static ConnectionEntity resolveRedisConnection(ConnectionEntity entity, Integer database) {
        if (database == null || database < 0) {
            return entity;
        }
        ConnectionEntity resolved = new ConnectionEntity();
        resolved.setDbType(entity.getDbType());
        resolved.setHost(entity.getHost());
        resolved.setPort(entity.getPort());
        resolved.setUsername(entity.getUsername());
        resolved.setPassword(entity.getPassword());
        resolved.setDatabaseName(String.valueOf(database));
        return resolved;
    }

    private ConnectionEntity requireAvailableExplorerConnection(String connectionId) {
        return connectionContext.requireAvailableConnectionForCurrentUser(
                connectionId,
                ConnectionExecutionContext.EXPLORER_CONNECTION_NOT_FOUND
        ).entity();
    }
}
