package org.apache.datawise.backend.ai.schema;

import org.springframework.stereotype.Component;

import java.util.Iterator;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

/**
 * Per-tenant schema DDL/list cache for AI + MCP. Key includes tenantId to avoid cross-tenant leaks.
 */
@Component
public class AiSchemaCache {

    public static final long DEFAULT_TTL_MS = 5 * 60_000L;

    private final ConcurrentHashMap<String, CacheEntry<?>> entries = new ConcurrentHashMap<>();
    private final long ttlMs;

    public AiSchemaCache() {
        this(DEFAULT_TTL_MS);
    }

    AiSchemaCache(long ttlMs) {
        this.ttlMs = Math.max(1_000L, ttlMs);
    }

    public <T> T getOrLoad(String key, Supplier<T> loader) {
        Objects.requireNonNull(loader, "loader");
        long now = System.currentTimeMillis();
        CacheEntry<?> existing = entries.get(key);
        if (existing != null && !existing.expired(now)) {
            @SuppressWarnings("unchecked")
            T value = (T) existing.value;
            return value;
        }
        T loaded = loader.get();
        entries.put(key, new CacheEntry<>(loaded, now + ttlMs));
        evictExpired(now);
        return loaded;
    }

    public void invalidate(String keyPrefix) {
        if (keyPrefix == null || keyPrefix.isBlank()) {
            return;
        }
        entries.keySet().removeIf(key -> key.equals(keyPrefix) || key.startsWith(keyPrefix));
    }

    public void invalidateConnection(String tenantId, String connectionId) {
        String prefix = cacheKeyPrefix(tenantId, connectionId);
        invalidate(prefix);
    }

    public void clear() {
        entries.clear();
    }

    public static String tablesKey(String tenantId, String connectionId, String database) {
        return cacheKeyPrefix(tenantId, connectionId) + "|tables|" + nullToEmpty(database);
    }

    public static String ddlKey(String tenantId, String connectionId, String database, String tableName) {
        return cacheKeyPrefix(tenantId, connectionId)
                + "|ddl|"
                + nullToEmpty(database)
                + "|"
                + nullToEmpty(tableName).toLowerCase();
    }

    public static String cacheKeyPrefix(String tenantId, String connectionId) {
        return nullToEmpty(tenantId) + "|" + nullToEmpty(connectionId);
    }

    private void evictExpired(long now) {
        if (entries.size() < 256) {
            return;
        }
        Iterator<Map.Entry<String, CacheEntry<?>>> it = entries.entrySet().iterator();
        while (it.hasNext()) {
            if (it.next().getValue().expired(now)) {
                it.remove();
            }
        }
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value.trim();
    }

    private record CacheEntry<T>(T value, long expiresAtMs) {
        boolean expired(long now) {
            return now >= expiresAtMs;
        }
    }
}
