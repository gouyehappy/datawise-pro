package org.apache.datawise.backend.service;

import org.apache.datawise.backend.configstore.AiTableTagStore;
import org.apache.datawise.backend.configstore.ConnectionStore;
import org.apache.datawise.backend.configstore.SessionEphemeralCatalogStore;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.model.ConnectionGroupEntity;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.outbound.OutboundEventSignals;
import org.apache.datawise.backend.service.tenant.TenantQuotaService;
import org.springframework.stereotype.Service;

/**
 * Explorer catalog 写路径：由 {@link UserResourcePolicy} 裁决访客会话 catalog vs 注册用户持久化。
 */
@Service
public class ExplorerCatalogPersistence {

    private final UserResourcePolicy resourcePolicy;
    private final SessionEphemeralCatalogStore ephemeralCatalogStore;
    private final ConnectionStore connectionStore;
    private final TenantQuotaService tenantQuotaService;
    private final OutboundEventSignals outboundEventSignals;
    private final AiTableTagStore aiTableTagStore;

    public ExplorerCatalogPersistence(
                                      UserResourcePolicy resourcePolicy,
                                      SessionEphemeralCatalogStore ephemeralCatalogStore,
                                      ConnectionStore connectionStore,
                                      TenantQuotaService tenantQuotaService,
                                      OutboundEventSignals outboundEventSignals,
                                      AiTableTagStore aiTableTagStore) {
        this.resourcePolicy = resourcePolicy;
        this.ephemeralCatalogStore = ephemeralCatalogStore;
        this.connectionStore = connectionStore;
        this.tenantQuotaService = tenantQuotaService;
        this.outboundEventSignals = outboundEventSignals;
        this.aiTableTagStore = aiTableTagStore;
    }

    public void saveGroup(ConnectionGroupEntity group) {
        resourcePolicy.accessPolicy().runGuestEphemeralOrRegistered(
                () -> ephemeralCatalogStore.saveGroup(
                        resourcePolicy.requireSessionIdFor(UserResource.CONNECTION_CATALOG),
                        group),
                () -> connectionStore.saveGroup(group));
    }

    public void saveConnection(ConnectionEntity entity) {
        resourcePolicy.accessPolicy().runGuestEphemeralOrRegistered(
                () -> ephemeralCatalogStore.saveConnection(
                        resourcePolicy.requireSessionIdFor(UserResource.CONNECTION_CATALOG),
                        entity),
                () -> {
                    if (entity.getTenantId() == null || entity.getTenantId().isBlank()) {
                        entity.setTenantId(TenantIds.normalizeOrDefault(UserContext.getTenantId()));
                    }
                    boolean isNew = entity.getId() == null
                            || connectionStore.findConnectionById(entity.getId()).isEmpty();
                    if (isNew) {
                        tenantQuotaService.requireConnectionQuotaForCreate(entity.getId());
                    }
                    connectionStore.saveConnection(entity);
                });
    }

    public void deleteConnection(String connectionId) {
        resourcePolicy.accessPolicy().runGuestEphemeralOrRegistered(
                () -> ephemeralCatalogStore.deleteConnectionById(
                        resourcePolicy.requireSessionIdFor(UserResource.CONNECTION_CATALOG),
                        connectionId),
                () -> {
                    connectionStore.deleteConnectionById(connectionId);
                    aiTableTagStore.removeByConnectionId(connectionId);
                });
    }

    public void deleteGroupCascade(String groupId) {
        resourcePolicy.accessPolicy().runGuestEphemeralOrRegistered(
                () -> ephemeralCatalogStore.deleteGroupCascade(
                        resourcePolicy.requireSessionIdFor(UserResource.CONNECTION_CATALOG),
                        groupId),
                () -> deleteRegisteredGroupCascade(groupId));
    }

    private void deleteRegisteredGroupCascade(String groupId) {
        for (ConnectionGroupEntity child : connectionStore.findChildGroups(groupId)) {
            deleteRegisteredGroupCascade(child.getId());
        }
        for (ConnectionEntity connection : connectionStore.findConnectionsByGroupId(groupId)) {
            String connectionId = connection.getId() != null ? connection.getId() : "";
            connectionStore.deleteConnectionById(connectionId);
            aiTableTagStore.removeByConnectionId(connectionId);
            outboundEventSignals.connectionDeleted(
                    connectionId,
                    connection.getName() != null ? connection.getName() : "",
                    connection.getDbType() != null ? connection.getDbType() : "",
                    UserContext.getUserId());
        }
        connectionStore.deleteGroupById(groupId);
    }
}
