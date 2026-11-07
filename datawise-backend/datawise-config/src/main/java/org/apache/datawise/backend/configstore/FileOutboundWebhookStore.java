package org.apache.datawise.backend.configstore;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.configstore.io.ConfigFileSupport;
import org.apache.datawise.backend.configstore.io.ConfigPersistence;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.model.OutboundWebhookEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 租户级出站 Webhook：{@code tenants/{tenantId}/outbound-webhooks.json}。
 */
@Service
@ConditionalOnProperty(prefix = "datawise.storage", name = "backend", havingValue = "file", matchIfMissing = true)
public class FileOutboundWebhookStore implements OutboundWebhookStore {

    private static final Logger log = LoggerFactory.getLogger(FileOutboundWebhookStore.class);

    private final ConfigDirectoryService configDirectory;
    private final ObjectMapper objectMapper;
    private final Map<String, JsonListFile<OutboundWebhookEntity>> cache = new ConcurrentHashMap<>();

    public FileOutboundWebhookStore(ConfigDirectoryService configDirectory, ObjectMapper objectMapper) {
        this.configDirectory = configDirectory;
        this.objectMapper = objectMapper;
    }

    @Override
    public List<OutboundWebhookEntity> listByTenantId(String tenantId) {
        return fileFor(tenantId).snapshot();
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
        return fileFor(tenantId).stream()
                .filter(item -> normalized.equals(item.getId()))
                .findFirst();
    }

    @Override
    @Deprecated
    public Optional<OutboundWebhookEntity> findById(long userId, String id) {
        return findById(TenantIds.DEFAULT, id);
    }

    @Override
    public OutboundWebhookEntity save(String tenantId, OutboundWebhookEntity entity) {
        return fileFor(tenantId).upsert(entity, existing -> existing.getId().equals(entity.getId()));
    }

    @Override
    @Deprecated
    public OutboundWebhookEntity save(long userId, OutboundWebhookEntity entity) {
        return save(TenantIds.DEFAULT, entity);
    }

    @Override
    public void delete(String tenantId, String id) {
        if (id == null || id.isBlank()) {
            return;
        }
        String normalized = id.trim();
        fileFor(tenantId).removeIf(existing -> normalized.equals(existing.getId()));
    }

    @Override
    @Deprecated
    public void delete(long userId, String id) {
        delete(TenantIds.DEFAULT, id);
    }

    private JsonListFile<OutboundWebhookEntity> fileFor(String tenantId) {
        String id = TenantIds.normalizeOrDefault(tenantId);
        return cache.computeIfAbsent(id, key -> {
            migrateLegacyUserHooks(key);
            return new JsonListFile<>(
                    configDirectory,
                    objectMapper,
                    ConfigPaths.tenantOutboundWebhooks(key),
                    new TypeReference<>() {
                    });
        });
    }

    private void migrateLegacyUserHooks(String tenantId) {
        Path tenantPath = configDirectory.resolve(ConfigPaths.tenantOutboundWebhooks(tenantId));
        if (Files.isRegularFile(tenantPath)) {
            return;
        }
        Path usersDir = configDirectory.resolve(ConfigPaths.USERS_DIR);
        if (!Files.isDirectory(usersDir)) {
            return;
        }
        Map<String, OutboundWebhookEntity> merged = new LinkedHashMap<>();
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(usersDir)) {
            for (Path userDir : stream) {
                if (!Files.isDirectory(userDir)) {
                    continue;
                }
                Path legacy = userDir.resolve("outbound-webhooks.json");
                if (!Files.isRegularFile(legacy)) {
                    continue;
                }
                List<OutboundWebhookEntity> hooks = ConfigFileSupport.readList(
                        legacy,
                        objectMapper,
                        new TypeReference<>() {
                        });
                for (OutboundWebhookEntity hook : hooks) {
                    if (hook != null && hook.getId() != null && !hook.getId().isBlank()) {
                        merged.putIfAbsent(hook.getId(), hook);
                    }
                }
                Path backup = legacy.resolveSibling("outbound-webhooks.json.migrated");
                if (!Files.exists(backup)) {
                    try {
                        Files.move(legacy, backup, StandardCopyOption.ATOMIC_MOVE);
                    } catch (IOException moveEx) {
                        Files.move(legacy, backup, StandardCopyOption.REPLACE_EXISTING);
                    }
                }
            }
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to migrate user outbound webhooks", ex);
        }
        if (merged.isEmpty()) {
            return;
        }
        ConfigPersistence.writeJson(
                configDirectory,
                objectMapper,
                ConfigPaths.tenantOutboundWebhooks(tenantId),
                new ArrayList<>(merged.values()));
        log.info("Migrated {} outbound webhooks into tenant {}", merged.size(), tenantId);
    }
}
