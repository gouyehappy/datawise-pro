package org.apache.datawise.backend.platform.mcp.audit;

import org.apache.datawise.backend.security.UserContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentLinkedDeque;

/**
 * MCP invoke audit. Phase 1: in-memory ring + structured log (cancel/error/ok all recorded).
 */
@Service
public class McpCallAuditService {

    private static final Logger log = LoggerFactory.getLogger("datawise.audit.mcp");
    private static final int MAX_ENTRIES = 500;

    private final ConcurrentLinkedDeque<McpCallAuditEntry> entries = new ConcurrentLinkedDeque<>();

    public String newCallId() {
        return "mcp_" + UUID.randomUUID().toString().replace("-", "");
    }

    public void record(
            String callId,
            String tool,
            String status,
            String argsSummary,
            long durationMs,
            String error
    ) {
        long userId = 0L;
        try {
            userId = UserContext.requireUserId();
        } catch (RuntimeException ignored) {
            // headless paths without user still get an audit row
        }
        String tenantId = UserContext.getTenantId();
        McpCallAuditEntry entry = new McpCallAuditEntry(
                callId == null ? newCallId() : callId,
                tool == null ? "" : tool,
                status == null ? McpCallAuditEntry.STATUS_ERROR : status,
                tenantId == null ? "" : tenantId,
                userId,
                truncate(argsSummary, 512),
                Math.max(0L, durationMs),
                truncate(error, 1024),
                Instant.now().toString()
        );
        entries.addFirst(entry);
        while (entries.size() > MAX_ENTRIES) {
            entries.pollLast();
        }
        if (McpCallAuditEntry.STATUS_OK.equals(entry.status())) {
            log.info(
                    "mcp.call tool={} status={} userId={} tenantId={} durationMs={} callId={}",
                    entry.tool(), entry.status(), entry.userId(), entry.tenantId(), entry.durationMs(), entry.callId()
            );
        } else {
            log.warn(
                    "mcp.call tool={} status={} userId={} tenantId={} durationMs={} error={} callId={}",
                    entry.tool(), entry.status(), entry.userId(), entry.tenantId(), entry.durationMs(),
                    entry.error(), entry.callId()
            );
        }
    }

    public List<McpCallAuditEntry> listRecent(int limit) {
        int cap = Math.min(Math.max(1, limit), MAX_ENTRIES);
        List<McpCallAuditEntry> out = new ArrayList<>(cap);
        for (McpCallAuditEntry entry : entries) {
            out.add(entry);
            if (out.size() >= cap) {
                break;
            }
        }
        return List.copyOf(out);
    }

    public static String summarizeArgs(Map<String, Object> args) {
        if (args == null || args.isEmpty()) {
            return "{}";
        }
        Map<String, Object> safe = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : args.entrySet()) {
            String key = entry.getKey();
            Object value = entry.getValue();
            if (key == null) {
                continue;
            }
            String lower = key.toLowerCase();
            if (lower.contains("password") || lower.contains("secret") || lower.contains("token") || lower.contains("apikey")) {
                safe.put(key, "***");
                continue;
            }
            if (value instanceof String text && text.length() > 120) {
                safe.put(key, text.substring(0, 117) + "...");
            } else {
                safe.put(key, value);
            }
        }
        return safe.toString();
    }

    void clearForTests() {
        entries.clear();
    }

    private static String truncate(String value, int max) {
        if (value == null) {
            return "";
        }
        if (value.length() <= max) {
            return value;
        }
        return value.substring(0, max - 3) + "...";
    }
}
