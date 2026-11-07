package org.apache.datawise.backend.database.connection;

import org.apache.datawise.backend.configstore.ConnectionStore;
import org.apache.datawise.backend.domain.ConnectionsCatalogDto;
import org.apache.datawise.backend.domain.ProjectIds;
import org.apache.datawise.backend.connector.api.support.ConnectionsCatalogMapper;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.model.ConnectionGroupEntity;
import org.apache.datawise.backend.service.ConnectionVisibilityService;
import org.apache.datawise.backend.service.UserResource;
import org.apache.datawise.backend.service.UserResourcePolicy;
import org.apache.datawise.backend.service.project.ProjectService;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 连接 catalog DTO 映射；Entity 持久化委托 {@link ConnectionStore}。
 */
@Service
public class ConnectionsCatalogService {

    private final ConnectionStore connectionStore;
    private final ConnectionVisibilityService connectionVisibilityService;
    private final UserResourcePolicy resourcePolicy;
    private final ProjectService projectService;

    public ConnectionsCatalogService(
            ConnectionStore connectionStore,
            ConnectionVisibilityService connectionVisibilityService,
            UserResourcePolicy resourcePolicy,
            ProjectService projectService
    ) {
        this.connectionStore = connectionStore;
        this.connectionVisibilityService = connectionVisibilityService;
        this.resourcePolicy = resourcePolicy;
        this.projectService = projectService;
    }

    public ConnectionsCatalogDto exportCatalog() {
        ConnectionVisibilityService.VisibleCatalog catalog = connectionVisibilityService.visibleCatalogForCurrentUser();
        return ConnectionsCatalogMapper.toDto(catalog.groups(), catalog.connections());
    }

    public void replaceCatalog(ConnectionsCatalogDto catalog) {
        long userId = resourcePolicy.requireRegisteredUserIdFor(UserResource.CONNECTIONS_XML_BULK);
        String activeProjectId = projectService.resolveActiveProjectId();
        ConnectionsCatalogMapper.ParsedEntities incoming = ConnectionsCatalogMapper.fromCatalog(
                catalog != null ? catalog : ConnectionsCatalogDto.empty()
        );
        for (ConnectionEntity connection : incoming.connections()) {
            connection.setUserId(userId);
            if (connection.getProjectId() == null || connection.getProjectId().isBlank()) {
                connection.setProjectId(activeProjectId);
            }
        }
        for (ConnectionGroupEntity group : incoming.groups()) {
            group.setUserId(userId);
            if (group.getProjectId() == null || group.getProjectId().isBlank()) {
                group.setProjectId(activeProjectId);
            }
        }

        Map<String, ConnectionGroupEntity> mergedGroups = new LinkedHashMap<>();
        Map<String, ConnectionEntity> mergedConnections = new LinkedHashMap<>();

        for (ConnectionGroupEntity group : connectionStore.findAllGroups()) {
            if (!isOwnedByOtherUser(group.getUserId(), userId)) {
                mergedGroups.put(group.getId(), group);
            }
        }
        for (ConnectionEntity connection : connectionStore.findAllConnections()) {
            if (!isOwnedByOtherUser(connection.getUserId(), userId)) {
                mergedConnections.put(connection.getId(), connection);
            }
        }

        for (ConnectionGroupEntity group : incoming.groups()) {
            mergedGroups.put(group.getId(), group);
        }
        for (ConnectionEntity connection : incoming.connections()) {
            mergedConnections.put(connection.getId(), connection);
        }

        connectionStore.replaceAll(
                new ArrayList<>(mergedGroups.values()),
                new ArrayList<>(mergedConnections.values())
        );
    }

    private static boolean isOwnedByOtherUser(Long ownerId, long currentUserId) {
        return ownerId != null && ownerId != currentUserId;
    }
}
