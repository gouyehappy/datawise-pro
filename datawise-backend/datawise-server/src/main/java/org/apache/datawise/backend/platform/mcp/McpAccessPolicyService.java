package org.apache.datawise.backend.platform.mcp;

import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.security.UserContext;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Resolves MCP access policy per tenant. Loads from disk with in-memory cache;
 * {@link #put} persists and updates cache so MCP / CLI / Web share one policy.
 */
@Service
public class McpAccessPolicyService {

    private final ConcurrentHashMap<String, McpAccessPolicy> cache = new ConcurrentHashMap<>();
    private final McpAccessPolicyStore store;

    public McpAccessPolicyService(McpAccessPolicyStore store) {
        this.store = store;
    }

    public McpAccessPolicy current() {
        return get(UserContext.getTenantId());
    }

    public McpAccessPolicy get(String tenantId) {
        String key = TenantIds.normalizeOrDefault(tenantId);
        return cache.computeIfAbsent(key, id -> store.load(id).orElseGet(() -> McpAccessPolicy.permissive(id)));
    }

    public void put(String tenantId, McpAccessPolicy policy) {
        String key = TenantIds.normalizeOrDefault(tenantId);
        McpAccessPolicy toStore = policy == null
                ? McpAccessPolicy.permissive(key)
                : new McpAccessPolicy(
                policy.readOnly(),
                policy.allowDangerousSql(),
                policy.allowedToolNames(),
                key,
                policy.connectionId(),
                policy.database()
        );
        store.save(key, toStore);
        cache.put(key, toStore);
    }

    public Map<String, Object> currentAsMap() {
        return McpAccessPolicyStore.toMap(current());
    }

    void clearForTests() {
        cache.clear();
    }
}
