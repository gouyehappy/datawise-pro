package org.apache.datawise.backend.platform.mcp;

import java.util.List;
import java.util.Map;

/**
 * Declarative MCP tool metadata for listTools / access policy / audit.
 */
public record McpToolSpec(
        String name,
        String description,
        List<String> argNames,
        boolean readOnly,
        boolean dangerous,
        String requiredFeature,
        String riskLevel
) {
    public static final String RISK_READ = "read";
    public static final String RISK_SESSION = "session";
    public static final String RISK_WRITE = "write";

    public Map<String, Object> toWireMap() {
        return Map.of(
                "name", name,
                "description", description,
                "parameters", List.copyOf(argNames),
                "readOnly", readOnly,
                "dangerous", dangerous,
                "requiredFeature", requiredFeature == null ? "" : requiredFeature,
                "riskLevel", riskLevel == null ? RISK_READ : riskLevel
        );
    }
}
