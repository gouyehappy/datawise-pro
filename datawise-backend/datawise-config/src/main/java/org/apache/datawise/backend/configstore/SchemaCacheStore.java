package org.apache.datawise.backend.configstore;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.discovery.DiscoverySearchIndexStore;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Explorer schema 浏览缓存：进程内存（按 session + connection）+ 可选磁盘快照（按 user + connection）。
 * <p>
 * 磁盘快照用于冷启动/重连后免 JDBC 灌树；断开连接或空闲回收<strong>不应</strong>清空缓存——
 * 数据源按需连接，未连接时仍可读本地 schema 快照。
 */
@Service
public class SchemaCacheStore {

    private static final Logger log = LoggerFactory.getLogger(SchemaCacheStore.class);

    private final ConcurrentHashMap<String, CacheEntry> cache = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Long> versions = new ConcurrentHashMap<>();
    private final ConfigDirectoryService configDirectory;
    private final ObjectMapper objectMapper;
    private final ObjectProvider<DiscoverySearchIndexStore> discoveryIndexStore;
    private final ObjectProvider<ConnectionStore> connectionStore;

    public SchemaCacheStore(
                            ConfigDirectoryService configDirectory,
                            ObjectMapper objectMapper,
                            ObjectProvider<DiscoverySearchIndexStore> discoveryIndexStore,
                            ObjectProvider<ConnectionStore> connectionStore) {
        this.configDirectory = configDirectory;
        this.objectMapper = objectMapper;
        this.discoveryIndexStore = discoveryIndexStore;
        this.connectionStore = connectionStore;
    }

    public List<TreeNode> load(String connectionId) {
        return load(connectionId, Long.MAX_VALUE);
    }

    public List<TreeNode> load(String connectionId, long ttlMs) {
        CacheEntry entry = cache.get(cacheKey(connectionId));
        if (entry == null) {
            entry = hydrateFromDisk(connectionId);
        }
        if (entry == null) {
            return List.of();
        }
        if (isExpired(entry, ttlMs)) {
            String key = cacheKey(connectionId);
            cache.remove(key, entry);
            versions.remove(key);
            deleteDiskSnapshot(connectionId);
            clearDiscoveryIndex(connectionId);
            return List.of();
        }
        return copyNodes(entry.nodes());
    }

    public synchronized void save(String connectionId, List<TreeNode> children) {
        String key = cacheKey(connectionId);
        List<TreeNode> nodes = copyNodes(children != null ? children : List.of());
        Instant now = Instant.now();
        cache.put(key, new CacheEntry(nodes, now));
        versions.merge(key, 1L, Long::sum);
        if (!nodes.isEmpty()) {
            persistToDisk(connectionId, nodes, now);
        } else {
            deleteDiskSnapshot(connectionId);
        }
        refreshDiscoveryIndex(connectionId, nodes);
    }

    public long version(String connectionId) {
        return versions.getOrDefault(cacheKey(connectionId), 0L);
    }

    /** 显式失效（DDL / 强制刷新 / 删除连接）：清内存与磁盘。 */
    public void clear(String connectionId) {
        String key = cacheKey(connectionId);
        cache.remove(key);
        versions.remove(key);
        deleteDiskSnapshot(connectionId);
        clearDiscoveryIndex(connectionId);
    }

    public void clearSession(String sessionId) {
        if (sessionId == null || sessionId.isBlank()) {
            return;
        }
        String prefix = sessionId.trim() + ":";
        cache.keySet().removeIf(key -> {
            if (!key.startsWith(prefix)) {
                return false;
            }
            versions.remove(key);
            return true;
        });
        DiscoverySearchIndexStore indexStore = discoveryIndexStore.getIfAvailable();
        if (indexStore != null) {
            indexStore.clearSession(sessionId);
        }
    }

    private void refreshDiscoveryIndex(String connectionId, List<TreeNode> nodes) {
        DiscoverySearchIndexStore indexStore = discoveryIndexStore.getIfAvailable();
        if (indexStore == null) {
            return;
        }
        if (nodes == null || nodes.isEmpty()) {
            indexStore.clear(connectionId);
            return;
        }
        ConnectionStore connections = connectionStore.getIfAvailable();
        if (connections == null) {
            indexStore.clear(connectionId);
            return;
        }
        ConnectionEntity connection = connections.findConnectionById(connectionId).orElse(null);
        if (connection == null) {
            indexStore.clear(connectionId);
            return;
        }
        indexStore.rebuild(connectionId, connection, nodes);
    }

    private void clearDiscoveryIndex(String connectionId) {
        DiscoverySearchIndexStore indexStore = discoveryIndexStore.getIfAvailable();
        if (indexStore != null) {
            indexStore.clear(connectionId);
        }
    }

    private CacheEntry hydrateFromDisk(String connectionId) {
        if (UserContext.isGuest()) {
            return null;
        }
        Long userId = UserContext.getUserId();
        if (userId == null || connectionId == null || connectionId.isBlank()) {
            return null;
        }
        Path path = diskPath(userId, connectionId);
        if (!Files.isRegularFile(path)) {
            return null;
        }
        try {
            DiskPayload payload = objectMapper.readValue(path.toFile(), DiskPayload.class);
            if (payload == null || payload.children() == null || payload.children().isEmpty()) {
                return null;
            }
            Instant cachedAt = parseInstant(payload.refreshedAt());
            CacheEntry entry = new CacheEntry(copyNodes(payload.children()), cachedAt);
            cache.put(cacheKey(connectionId), entry);
            if (payload.version() > 0) {
                versions.put(cacheKey(connectionId), payload.version());
            }
            refreshDiscoveryIndex(connectionId, entry.nodes());
            return entry;
        } catch (IOException ex) {
            log.warn("Failed to hydrate schema cache from disk connectionId={}: {}", connectionId, ex.toString());
            return null;
        }
    }

    private void persistToDisk(String connectionId, List<TreeNode> nodes, Instant cachedAt) {
        if (UserContext.isGuest()) {
            return;
        }
        Long userId = UserContext.getUserId();
        if (userId == null || connectionId == null || connectionId.isBlank()) {
            return;
        }
        Path path = diskPath(userId, connectionId);
        try {
            Files.createDirectories(path.getParent());
            DiskPayload payload = new DiskPayload(
                    nodes,
                    cachedAt.toString(),
                    versions.getOrDefault(cacheKey(connectionId), 1L));
            Path temp = path.resolveSibling(path.getFileName() + ".tmp");
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(temp.toFile(), payload);
            org.apache.datawise.backend.common.support.AtomicFileWrites.moveReplace(temp, path);
        } catch (IOException ex) {
            log.warn("Failed to persist schema cache connectionId={}: {}", connectionId, ex.toString());
        }
    }

    private void deleteDiskSnapshot(String connectionId) {
        if (UserContext.isGuest()) {
            return;
        }
        Long userId = UserContext.getUserId();
        if (userId == null || connectionId == null || connectionId.isBlank()) {
            return;
        }
        Path path = diskPath(userId, connectionId);
        try {
            Files.deleteIfExists(path);
        } catch (IOException ex) {
            log.warn("Failed to delete schema cache connectionId={}: {}", connectionId, ex.toString());
        }
    }

    private Path diskPath(long userId, String connectionId) {
        String tenantId = TenantScopedConfigSupport.currentTenantId();
        String relative = ConfigPaths.userSchemaCache(userId, tenantId, connectionId);
        if (TenantIds.DEFAULT.equals(tenantId)) {
            Path tenantPath = configDirectory.resolve(relative);
            Path legacyPath = configDirectory.resolve(ConfigPaths.SCHEMA_CACHE_DIR + "/u" + userId
                    + "/" + connectionId.replaceAll("[^a-zA-Z0-9._-]", "_") + ".json");
            if (!Files.isRegularFile(tenantPath) && Files.isRegularFile(legacyPath)) {
                try {
                    Files.createDirectories(tenantPath.getParent());
                    Files.copy(legacyPath, tenantPath);
                } catch (IOException ex) {
                    log.warn("Failed to migrate schema cache userId={} connectionId={}: {}",
                            userId, connectionId, ex.toString());
                }
            }
        }
        return configDirectory.resolve(relative);
    }

    private static Instant parseInstant(String value) {
        if (value == null || value.isBlank()) {
            return Instant.now();
        }
        try {
            return Instant.parse(value);
        } catch (Exception ex) {
            return Instant.now();
        }
    }

    private static boolean isExpired(CacheEntry entry, long ttlMs) {
        if (ttlMs <= 0 || ttlMs == Long.MAX_VALUE) {
            return false;
        }
        return Instant.now().toEpochMilli() - entry.cachedAt().toEpochMilli() > ttlMs;
    }

    private static String cacheKey(String connectionId) {
        String sessionId = UserContext.getSessionId();
        String scope = sessionId != null && !sessionId.isBlank() ? sessionId.trim() : "anonymous";
        return scope + ":" + connectionId;
    }

    private static List<TreeNode> copyNodes(List<TreeNode> nodes) {
        return new ArrayList<>(nodes);
    }

    private record CacheEntry(List<TreeNode> nodes, Instant cachedAt) {
    }

    public record SchemaCachePayload(List<TreeNode> children, String refreshedAt) {
    }

    public record DiskPayload(List<TreeNode> children, String refreshedAt, long version) {
    }
}
