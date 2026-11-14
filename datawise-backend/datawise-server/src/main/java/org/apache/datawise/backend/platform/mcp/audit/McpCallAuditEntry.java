package org.apache.datawise.backend.platform.mcp.audit;

/**
 * One MCP invoke attempt — written on success, failure, or cancel alike.
 */
public record McpCallAuditEntry(
        String callId,
        String tool,
        String status,
        String tenantId,
        long userId,
        String argsSummary,
        long durationMs,
        String error,
        String createdAt
) {
    public static final String STATUS_OK = "ok";
    public static final String STATUS_ERROR = "error";
    public static final String STATUS_DENIED = "denied";
    public static final String STATUS_CANCELLED = "cancelled";
}
