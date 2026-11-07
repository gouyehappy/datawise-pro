package org.apache.datawise.backend.configstore.jdbc;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.configstore.OutboundWebhookStore;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.model.OutboundWebhookEntity;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

@Service
@ConditionalOnProperty(prefix = "datawise.storage", name = "backend", havingValue = "jdbc")
public class JdbcOutboundWebhookStore implements OutboundWebhookStore {

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;
    private final ConcurrentHashMap<String, CopyOnWriteArrayList<OutboundWebhookEntity>> cache = new ConcurrentHashMap<>();

    public JdbcOutboundWebhookStore(
                                    @Qualifier(MetadataJdbcConfiguration.METADATA_JDBC) JdbcTemplate jdbc,
                                    ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    @Override
    public List<OutboundWebhookEntity> listByTenantId(String tenantId) {
        return List.copyOf(listMutable(tenantId));
    }

    @Override
    @Deprecated
    public List<OutboundWebhookEntity> listByUserId(long userId) {
        return listByTenantId(TenantIds.DEFAULT);
    }

    @Override
    public Optional<OutboundWebhookEntity> findById(String tenantId, String id) {
        if (id == null || id.isBlank()) {
            return Optional.empty();
        }
        String normalized = id.trim();
        return listMutable(tenantId).stream()
                .filter(item -> normalized.equals(item.getId()))
                .findFirst();
    }

    @Override
    @Deprecated
    public Optional<OutboundWebhookEntity> findById(long userId, String id) {
        return findById(TenantIds.DEFAULT, id);
    }

    @Override
    public synchronized OutboundWebhookEntity save(String tenantId, OutboundWebhookEntity entity) {
        CopyOnWriteArrayList<OutboundWebhookEntity> list = listMutable(tenantId);
        list.removeIf(existing -> existing.getId().equals(entity.getId()));
        list.add(entity);
        persist(tenantId, list);
        return entity;
    }

    @Override
    @Deprecated
    public OutboundWebhookEntity save(long userId, OutboundWebhookEntity entity) {
        return save(TenantIds.DEFAULT, entity);
    }

    @Override
    public synchronized void delete(String tenantId, String id) {
        if (id == null || id.isBlank()) {
            return;
        }
        String normalized = id.trim();
        CopyOnWriteArrayList<OutboundWebhookEntity> list = listMutable(tenantId);
        list.removeIf(existing -> normalized.equals(existing.getId()));
        persist(tenantId, list);
    }

    @Override
    @Deprecated
    public void delete(long userId, String id) {
        delete(TenantIds.DEFAULT, id);
    }

    public synchronized void replaceAll(String tenantId, List<OutboundWebhookEntity> hooks) {
        String id = TenantIds.normalizeOrDefault(tenantId);
        CopyOnWriteArrayList<OutboundWebhookEntity> list = new CopyOnWriteArrayList<>(
                hooks != null ? hooks : List.of());
        cache.put(id, list);
        persist(id, list);
    }

    private CopyOnWriteArrayList<OutboundWebhookEntity> listMutable(String tenantId) {
        String id = TenantIds.normalizeOrDefault(tenantId);
        return cache.computeIfAbsent(id, this::load);
    }

    private CopyOnWriteArrayList<OutboundWebhookEntity> load(String tenantId) {
        List<String> rows = jdbc.query(
                "SELECT payload FROM dw_outbound_webhook_snapshots WHERE tenant_id = ?",
                (rs, rowNum) -> rs.getString("payload"),
                tenantId);
        if (rows.isEmpty() || rows.get(0) == null || rows.get(0).isBlank()) {
            return new CopyOnWriteArrayList<>();
        }
        try {
            List<OutboundWebhookEntity> parsed = objectMapper.readValue(rows.get(0), new TypeReference<>() {
            });
            return new CopyOnWriteArrayList<>(parsed != null ? parsed : List.of());
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to read outbound webhooks for tenant " + tenantId, ex);
        }
    }

    private void persist(String tenantId, List<OutboundWebhookEntity> list) {
        String json;
        try {
            json = objectMapper.writeValueAsString(new ArrayList<>(list));
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to serialize outbound webhooks", ex);
        }
        Timestamp now = Timestamp.from(Instant.now());
        int updated = jdbc.update(
                "UPDATE dw_outbound_webhook_snapshots SET payload = ?, updated_at = ? WHERE tenant_id = ?",
                json, now, tenantId);
        if (updated == 0) {
            jdbc.update(
                    "INSERT INTO dw_outbound_webhook_snapshots (tenant_id, payload, updated_at) VALUES (?,?,?)",
                    tenantId, json, now);
        }
    }
}
