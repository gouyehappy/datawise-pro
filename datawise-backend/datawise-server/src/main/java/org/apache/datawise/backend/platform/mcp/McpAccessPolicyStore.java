package org.apache.datawise.backend.platform.mcp;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.ConfigPaths;
import org.apache.datawise.backend.configstore.TenantScopedConfigSupport;
import org.apache.datawise.backend.domain.TenantIds;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Persists tenant MCP access policy under {@code tenants/{id}/mcp-access-policy.json}.
 */
@Component
public class McpAccessPolicyStore {

    private static final Logger log = LoggerFactory.getLogger(McpAccessPolicyStore.class);

    private final ConfigDirectoryService configDirectory;
    private final ObjectMapper objectMapper;

    public McpAccessPolicyStore(ConfigDirectoryService configDirectory, ObjectMapper objectMapper) {
        this.configDirectory = configDirectory;
        this.objectMapper = objectMapper;
    }

    public Optional<McpAccessPolicy> load(String tenantId) {
        String id = TenantIds.normalizeOrDefault(tenantId);
        Path path = resolvePath(id);
        if (!Files.isRegularFile(path)) {
            return Optional.empty();
        }
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> raw = objectMapper.readValue(path.toFile(), Map.class);
            return Optional.of(fromMap(id, raw));
        } catch (Exception ex) {
            log.warn("mcp.policy.load_failed tenantId={} | {}", id, ex.getMessage());
            return Optional.empty();
        }
    }

    public void save(String tenantId, McpAccessPolicy policy) {
        String id = TenantIds.normalizeOrDefault(tenantId);
        Path path = resolvePath(id);
        try {
            Files.createDirectories(path.getParent());
            Map<String, Object> wire = toMap(policy == null ? McpAccessPolicy.permissive(id) : policy);
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(path.toFile(), wire);
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to persist MCP access policy for tenant " + id, ex);
        }
    }

    private Path resolvePath(String tenantId) {
        String relative = ConfigPaths.tenantMcpAccessPolicy(tenantId);
        TenantScopedConfigSupport.ensureTenantRelativePath(
                configDirectory,
                tenantId,
                relative,
                null
        );
        return configDirectory.resolve(relative);
    }

    public static Map<String, Object> toMap(McpAccessPolicy policy) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("readOnly", policy.readOnly());
        map.put("allowDangerousSql", policy.allowDangerousSql());
        map.put("allowedToolNames", List.copyOf(policy.allowedToolNames()));
        map.put("tenantId", policy.tenantId() == null ? "" : policy.tenantId());
        map.put("connectionId", policy.connectionId() == null ? "" : policy.connectionId());
        map.put("database", policy.database() == null ? "" : policy.database());
        return map;
    }

    @SuppressWarnings("unchecked")
    public static McpAccessPolicy fromMap(String tenantId, Map<String, Object> raw) {
        if (raw == null) {
            return McpAccessPolicy.permissive(tenantId);
        }
        boolean readOnly = asBoolean(raw.get("readOnly"), false);
        boolean allowDangerous = asBoolean(raw.get("allowDangerousSql"), true);
        Set<String> allowed = new LinkedHashSet<>();
        Object names = raw.get("allowedToolNames");
        if (names instanceof List<?> list) {
            for (Object item : list) {
                if (item != null) {
                    String text = String.valueOf(item).trim();
                    if (!text.isEmpty()) {
                        allowed.add(text);
                    }
                }
            }
        }
        String connectionId = asText(raw.get("connectionId"));
        String database = asText(raw.get("database"));
        return new McpAccessPolicy(
                readOnly,
                allowDangerous,
                Set.copyOf(allowed),
                tenantId,
                connectionId,
                database
        );
    }

    private static boolean asBoolean(Object value, boolean defaultValue) {
        if (value instanceof Boolean bool) {
            return bool;
        }
        if (value == null) {
            return defaultValue;
        }
        return Boolean.parseBoolean(String.valueOf(value));
    }

    private static String asText(Object value) {
        if (value == null) {
            return null;
        }
        String text = String.valueOf(value).trim();
        return text.isEmpty() ? null : text;
    }
}
