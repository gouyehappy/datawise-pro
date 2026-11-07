package org.apache.datawise.backend.platform.mcp.confirm;

import java.util.Map;

/**
 * Pending MCP mutation proposal ({@code dw_confirm}).
 * See {@code _private/docs/design/AI_WORKBENCH_CONTEXT_AND_MCP.md} §6.
 */
public record ConfirmTicket(
        String ticketId,
        long userId,
        String tenantId,
        String tool,
        String risk,
        String summary,
        Map<String, Object> preview,
        String status,
        String createdAt,
        String expiresAt,
        String decidedAt,
        String decideNote,
        Map<String, Object> execution
) {
    public static final String STATUS_PENDING = "pending";
    public static final String STATUS_CONFIRMED = "confirmed";
    public static final String STATUS_REJECTED = "rejected";
    public static final String STATUS_EXPIRED = "expired";
    public static final String STATUS_CANCELLED = "cancelled";

    public static final String RISK_READ = "read";
    public static final String RISK_SESSION = "session";
    public static final String RISK_WRITE = "write";
    /** Shared production write — confirm creates a team approval ticket, never direct execute. */
    public static final String RISK_PROD_APPROVAL = "prod_approval";
}
