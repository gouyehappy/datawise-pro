package org.apache.datawise.backend.configstore;

import org.apache.datawise.backend.model.OutboundWebhookEntity;

import java.util.List;
import java.util.Optional;

/** Tenant-scoped outbound webhooks (file or jdbc backend). */
public interface OutboundWebhookStore {

    List<OutboundWebhookEntity> listByTenantId(String tenantId);

    @Deprecated
    List<OutboundWebhookEntity> listByUserId(long userId);

    Optional<OutboundWebhookEntity> findById(String tenantId, String id);

    @Deprecated
    Optional<OutboundWebhookEntity> findById(long userId, String id);

    OutboundWebhookEntity save(String tenantId, OutboundWebhookEntity entity);

    @Deprecated
    OutboundWebhookEntity save(long userId, OutboundWebhookEntity entity);

    void delete(String tenantId, String id);

    @Deprecated
    void delete(long userId, String id);
}
