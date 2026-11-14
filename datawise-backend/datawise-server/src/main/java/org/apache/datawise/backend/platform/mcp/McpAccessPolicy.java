package org.apache.datawise.backend.platform.mcp;

import java.util.Set;

/**
 * Tenant/connection-scoped MCP access flags. Default is permissive for backward compatibility;
 * set {@code readOnly=true} or {@code allowDangerousSql=false} to tighten.
 */
public record McpAccessPolicy(
        boolean readOnly,
        boolean allowDangerousSql,
        Set<String> allowedToolNames,
        String tenantId,
        String connectionId,
        String database
) {
    public static McpAccessPolicy permissive(String tenantId) {
        return new McpAccessPolicy(false, true, Set.of(), tenantId, null, null);
    }

    public static McpAccessPolicy readOnlyPolicy(String tenantId) {
        return new McpAccessPolicy(true, false, Set.of(), tenantId, null, null);
    }

    public void ensureToolAllowed(McpToolSpec spec) {
        if (spec == null) {
            throw new IllegalArgumentException("tool spec is required");
        }
        if (allowedToolNames != null && !allowedToolNames.isEmpty() && !allowedToolNames.contains(spec.name())) {
            throw new IllegalArgumentException("tool not allowed by access policy: " + spec.name());
        }
        if (readOnly && !spec.readOnly()) {
            throw new IllegalArgumentException("tool blocked by read-only MCP policy: " + spec.name());
        }
        if (!allowDangerousSql && spec.dangerous()) {
            throw new IllegalArgumentException("dangerous tool blocked by MCP policy: " + spec.name());
        }
    }
}
