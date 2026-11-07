package org.apache.datawise.backend.configstore;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.configstore.io.ConfigFileSupport;
import org.apache.datawise.backend.configstore.io.ConfigPersistence;
import org.apache.datawise.backend.domain.TenantIds;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Path;

/**
 * OIDC + local-login policy at {@code config/tenants/{tenantId}/oidc.json}.
 */
@Service
@ConditionalOnProperty(prefix = "datawise.storage", name = "backend", havingValue = "file", matchIfMissing = true)
public class FileOidcConfigStore implements OidcConfigStore {

    private final ConfigDirectoryService configDirectory;
    private final ObjectMapper objectMapper;

    public FileOidcConfigStore(ConfigDirectoryService configDirectory, ObjectMapper objectMapper) {
        this.configDirectory = configDirectory;
        this.objectMapper = objectMapper;
        TenantScopedConfigSupport.ensureOidcPath(configDirectory, TenantIds.DEFAULT);
    }

    @Override
    public void ensureTenantFiles(String tenantId) {
        String relative = TenantScopedConfigSupport.ensureOidcPath(configDirectory, tenantId);
        Path path = configDirectory.resolve(relative);
        if (!ConfigFileSupport.exists(path)) {
            saveForTenant(tenantId, StoredOidcConfig.disabledDefaults());
        }
    }

    @Override
    public StoredOidcConfig current() {
        return readAt(oidcRelativePath());
    }

    @Override
    public synchronized StoredOidcConfig save(StoredOidcConfig next) {
        return saveAt(oidcRelativePath(), next);
    }

    private StoredOidcConfig readAt(String relativePath) {
        Path path = configDirectory.resolve(relativePath);
        if (!ConfigFileSupport.exists(path)) {
            return StoredOidcConfig.disabledDefaults();
        }
        try {
            StoredOidcConfig stored = objectMapper.readValue(path.toFile(), StoredOidcConfig.class);
            return stored != null ? stored.normalized() : StoredOidcConfig.disabledDefaults();
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to read oidc.json", ex);
        }
    }

    private synchronized StoredOidcConfig saveForTenant(String tenantId, StoredOidcConfig next) {
        String relative = TenantScopedConfigSupport.ensureOidcPath(configDirectory, tenantId);
        return saveAt(relative, next);
    }

    private StoredOidcConfig saveAt(String relativePath, StoredOidcConfig next) {
        StoredOidcConfig normalized = validate(next);
        try {
            configDirectory.ensureExists();
            ConfigPersistence.writeJson(configDirectory, objectMapper, relativePath, normalized);
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to write oidc.json", ex);
        }
        return normalized;
    }

    public static StoredOidcConfig validate(StoredOidcConfig next) {
        StoredOidcConfig normalized = next != null ? next.normalized() : StoredOidcConfig.disabledDefaults();
        if (normalized.enabled && (normalized.issuer == null || normalized.issuer.isBlank()
                || normalized.clientId == null || normalized.clientId.isBlank()
                || normalized.redirectUri == null || normalized.redirectUri.isBlank())) {
            throw new IllegalArgumentException("issuer, clientId and redirectUri are required when OIDC is enabled");
        }
        if (!normalized.localLoginEnabled && !normalized.enabled) {
            throw new IllegalArgumentException("Cannot disable local login while OIDC is disabled");
        }
        return normalized;
    }

    private String oidcRelativePath() {
        return TenantScopedConfigSupport.ensureCurrentOidcPath(configDirectory);
    }
}
