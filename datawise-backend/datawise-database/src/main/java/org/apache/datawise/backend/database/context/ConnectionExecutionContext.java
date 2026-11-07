package org.apache.datawise.backend.database.context;

import org.apache.datawise.backend.configstore.ConnectionStore;
import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.database.connection.DatasourceCatalogService;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.service.ConnectionVisibilityService;
import org.apache.datawise.backend.service.UserAccountService;
import org.apache.datawise.backend.common.UnauthorizedException;
import org.springframework.stereotype.Service;

/**
 * 解析「当前用户 → 连接实体 → 插件可用 → 库名」横切上下文，避免各 Service 重复样板。
 * <p>
 * 连接按 {@link ConnectionVisibilityService} 过滤：owner / legacy / 团队共享；访客仅会话临时 catalog。
 */
@Service
public class ConnectionExecutionContext {

    public static final String DEFAULT_CONNECTION_NOT_FOUND = "Connection not found";
    public static final String EXPLORER_CONNECTION_NOT_FOUND = "EXPLORER_CONNECTION_NOT_FOUND";

    private final UserAccountService userAccountService;
    private final ConnectionVisibilityService connectionVisibilityService;
    private final DatasourceCatalogService datasourceCatalogService;
    private final ConnectorFacade connectorFacade;

    public ConnectionExecutionContext(
            UserAccountService userAccountService,
            ConnectionVisibilityService connectionVisibilityService,
            DatasourceCatalogService datasourceCatalogService,
            ConnectorFacade connectorFacade
    ) {
        this.userAccountService = userAccountService;
        this.connectionVisibilityService = connectionVisibilityService;
        this.datasourceCatalogService = datasourceCatalogService;
        this.connectorFacade = connectorFacade;
    }

    public long requireUserId() {
        return userAccountService.requireUserId();
    }

    public ResolvedConnection requireConnection(long userId, String connectionId, String notFoundMessage) {
        if (connectionId == null || connectionId.isBlank()) {
            throw new IllegalArgumentException("connectionId is required");
        }
        long currentUserId = requireUserId();
        if (userId != currentUserId) {
            throw new UnauthorizedException();
        }
        ConnectionEntity entity = connectionVisibilityService.resolveConnectionEntity(connectionId)
                .orElseThrow(() -> new IllegalArgumentException(notFoundMessage));
        return new ResolvedConnection(userId, entity);
    }

    public ResolvedConnection requireConnectionForCurrentUser(String connectionId, String notFoundMessage) {
        return requireConnection(requireUserId(), connectionId, notFoundMessage);
    }

    public ResolvedConnection requireAvailableConnection(long userId, String connectionId, String notFoundMessage) {
        ResolvedConnection resolved = requireConnection(userId, connectionId, notFoundMessage);
        datasourceCatalogService.requireAvailable(resolved.entity().getDbType());
        return resolved;
    }

    public ResolvedConnection requireAvailableConnectionForCurrentUser(String connectionId, String notFoundMessage) {
        return requireAvailableConnection(requireUserId(), connectionId, notFoundMessage);
    }

    /** WebSocket 等已在外层校验 userId 的场景。 */
    public ResolvedConnection requireAvailableConnectionForUser(long userId, String connectionId, String notFoundMessage) {
        if (connectionId == null || connectionId.isBlank()) {
            throw new IllegalArgumentException("connectionId is required");
        }
        ConnectionEntity entity = connectionVisibilityService.resolveConnectionEntity(connectionId, userId)
                .orElseThrow(() -> new IllegalArgumentException(notFoundMessage));
        datasourceCatalogService.requireAvailable(entity.getDbType());
        return new ResolvedConnection(userId, entity);
    }

    public ResolvedConnectionWithDatabase requireAvailableWithDatabase(
            long userId,
            String connectionId,
            String database,
            String notFoundMessage
    ) {
        ResolvedConnection resolved = requireAvailableConnection(userId, connectionId, notFoundMessage);
        String effectiveDatabase = resolveDatabase(resolved.entity(), database);
        return new ResolvedConnectionWithDatabase(resolved.userId(), resolved.entity(), effectiveDatabase);
    }

    public ResolvedConnectionWithDatabase requireAvailableWithDatabaseForCurrentUser(
            String connectionId,
            String database,
            String notFoundMessage
    ) {
        return requireAvailableWithDatabase(requireUserId(), connectionId, database, notFoundMessage);
    }

    public ResolvedConnectionWithConnector requireAvailableWithConnector(
            long userId,
            String connectionId,
            String database,
            String notFoundMessage
    ) {
        ResolvedConnectionWithDatabase resolved = requireAvailableWithDatabase(
                userId,
                connectionId,
                database,
                notFoundMessage
        );
        DataSourceConnector connector = connectorFacade.catalog().resolve(resolved.entity());
        return new ResolvedConnectionWithConnector(
                resolved.userId(),
                resolved.entity(),
                resolved.database(),
                connector
        );
    }

    public ResolvedConnectionWithConnector requireAvailableWithConnectorForCurrentUser(
            String connectionId,
            String database,
            String notFoundMessage
    ) {
        return requireAvailableWithConnector(requireUserId(), connectionId, database, notFoundMessage);
    }

    public static String resolveDatabase(ConnectionEntity entity, String database) {
        if (database != null && !database.isBlank()) {
            return database.trim();
        }
        String fallback = entity.getDatabaseName();
        if (fallback != null && !fallback.isBlank()) {
            return fallback.trim();
        }
        return null;
    }

    public static String requireDatabase(ConnectionEntity entity, String database) {
        String resolved = resolveDatabase(entity, database);
        if (resolved == null || resolved.isBlank()) {
            throw new IllegalArgumentException("database is required");
        }
        return resolved;
    }

    public record ResolvedConnection(long userId, ConnectionEntity entity) {
    }

    public record ResolvedConnectionWithDatabase(long userId, ConnectionEntity entity, String database) {
    }

    public record ResolvedConnectionWithConnector(
            long userId,
            ConnectionEntity entity,
            String database,
            DataSourceConnector connector
    ) {
    }
}
