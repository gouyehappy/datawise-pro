package org.apache.datawise.backend.configstore.jdbc;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.configstore.FileOidcConfigStore;
import org.apache.datawise.backend.configstore.OidcConfigStore;
import org.apache.datawise.backend.configstore.TenantScopedConfigSupport;
import org.apache.datawise.backend.domain.TenantIds;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;

@Service
@ConditionalOnProperty(prefix = "datawise.storage", name = "backend", havingValue = "jdbc")
public class JdbcOidcConfigStore implements OidcConfigStore {

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public JdbcOidcConfigStore(
                               @Qualifier(MetadataJdbcConfiguration.METADATA_JDBC) JdbcTemplate jdbc,
                               ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
        ensureTenantFiles(TenantIds.DEFAULT);
    }

    @Override
    public void ensureTenantFiles(String tenantId) {
        String id = TenantIds.normalizeOrDefault(tenantId);
        if (!exists(id)) {
            saveForTenant(id, StoredOidcConfig.disabledDefaults());
        }
    }

    @Override
    public StoredOidcConfig current() {
        return readForTenant(TenantScopedConfigSupport.currentTenantId());
    }

    @Override
    public synchronized StoredOidcConfig save(StoredOidcConfig next) {
        return saveForTenant(TenantScopedConfigSupport.currentTenantId(), next);
    }

    public synchronized StoredOidcConfig saveForTenant(String tenantId, StoredOidcConfig next) {
        String id = TenantIds.normalizeOrDefault(tenantId);
        StoredOidcConfig normalized = FileOidcConfigStore.validate(next);
        String json;
        try {
            json = objectMapper.writeValueAsString(normalized);
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to serialize oidc config", ex);
        }
        Timestamp now = Timestamp.from(Instant.now());
        int updated = jdbc.update(
                "UPDATE dw_oidc_configs SET payload = ?, updated_at = ? WHERE tenant_id = ?",
                json, now, id);
        if (updated == 0) {
            jdbc.update(
                    "INSERT INTO dw_oidc_configs (tenant_id, payload, updated_at) VALUES (?,?,?)",
                    id, json, now);
        }
        return normalized;
    }

    private StoredOidcConfig readForTenant(String tenantId) {
        String id = TenantIds.normalizeOrDefault(tenantId);
        List<String> rows = jdbc.query(
                "SELECT payload FROM dw_oidc_configs WHERE tenant_id = ?",
                (rs, rowNum) -> rs.getString("payload"),
                id);
        if (rows.isEmpty() || rows.get(0) == null || rows.get(0).isBlank()) {
            return StoredOidcConfig.disabledDefaults();
        }
        try {
            StoredOidcConfig stored = objectMapper.readValue(rows.get(0), StoredOidcConfig.class);
            return stored != null ? stored.normalized() : StoredOidcConfig.disabledDefaults();
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to read oidc config for tenant " + id, ex);
        }
    }

    private boolean exists(String tenantId) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM dw_oidc_configs WHERE tenant_id = ?",
                Integer.class,
                tenantId);
        return count != null && count > 0;
    }
}
