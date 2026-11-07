package org.apache.datawise.backend.platform.mcp.confirm;

import org.apache.datawise.backend.security.UserContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class ConfirmGateService {

    private static final Logger log = LoggerFactory.getLogger(ConfirmGateService.class);
    public static final long TTL_MINUTES = 5;

    private final ConcurrentHashMap<String, ConfirmTicket> byId = new ConcurrentHashMap<>();

    public Map<String, Object> propose(
            String tool,
            String risk,
            String summary,
            Map<String, Object> preview,
            Map<String, Object> execution
    ) {
        long userId = UserContext.requireUserId();
        String tenantId = UserContext.getTenantId();
        Instant now = Instant.now();
        Instant expires = now.plus(TTL_MINUTES, ChronoUnit.MINUTES);
        String ticketId = "cft_" + UUID.randomUUID().toString().replace("-", "");

        ConfirmTicket ticket = new ConfirmTicket(
                ticketId,
                userId,
                tenantId,
                tool,
                risk,
                summary,
                preview == null ? Map.of() : Map.copyOf(preview),
                ConfirmTicket.STATUS_PENDING,
                now.toString(),
                expires.toString(),
                null,
                null,
                execution == null ? Map.of() : Map.copyOf(execution)
        );
        byId.put(ticketId, ticket);
        log.info("mcp.confirm.created ticketId={} tool={} userId={} risk={}", ticketId, tool, userId, risk);

        Map<String, Object> wire = new LinkedHashMap<>();
        wire.put("dw_confirm", true);
        wire.put("ticketId", ticketId);
        wire.put("expiresAt", expires.toString());
        wire.put("risk", risk);
        wire.put("summary", summary);
        wire.put("preview", ticket.preview());
        wire.put("uiHint", "Open DataWise → MCP confirm drawer to approve or reject");
        return wire;
    }

    public List<ConfirmTicket> listPendingForCurrentUser() {
        long userId = UserContext.requireUserId();
        String tenantId = UserContext.getTenantId();
        Instant now = Instant.now();
        List<ConfirmTicket> result = new ArrayList<>();
        for (ConfirmTicket ticket : byId.values()) {
            if (ticket.userId() != userId || !tenantId.equals(ticket.tenantId())) {
                continue;
            }
            ConfirmTicket current = refreshExpiry(ticket, now);
            if (ConfirmTicket.STATUS_PENDING.equals(current.status())) {
                result.add(current);
            }
        }
        result.sort((a, b) -> b.createdAt().compareTo(a.createdAt()));
        return result;
    }

    public ConfirmTicket getForCurrentUser(String ticketId) {
        long userId = UserContext.requireUserId();
        String tenantId = UserContext.getTenantId();
        ConfirmTicket ticket = byId.get(ticketId);
        if (ticket == null || ticket.userId() != userId || !tenantId.equals(ticket.tenantId())) {
            throw new IllegalArgumentException("confirmation not found: " + ticketId);
        }
        return refreshExpiry(ticket, Instant.now());
    }

    public ConfirmTicket decide(String ticketId, String decision, String note) {
        ConfirmTicket ticket = getForCurrentUser(ticketId);
        Instant now = Instant.now();
        ticket = refreshExpiry(ticket, now);
        if (!ConfirmTicket.STATUS_PENDING.equals(ticket.status())) {
            return ticket;
        }
        String normalized = decision == null ? "" : decision.trim().toLowerCase();
        String nextStatus;
        if ("confirm".equals(normalized) || "approve".equals(normalized)) {
            nextStatus = ConfirmTicket.STATUS_CONFIRMED;
        } else if ("reject".equals(normalized) || "deny".equals(normalized)) {
            nextStatus = ConfirmTicket.STATUS_REJECTED;
        } else {
            throw new IllegalArgumentException("decision must be confirm or reject");
        }
        ConfirmTicket updated = new ConfirmTicket(
                ticket.ticketId(),
                ticket.userId(),
                ticket.tenantId(),
                ticket.tool(),
                ticket.risk(),
                ticket.summary(),
                ticket.preview(),
                nextStatus,
                ticket.createdAt(),
                ticket.expiresAt(),
                now.toString(),
                note,
                ticket.execution()
        );
        byId.put(ticketId, updated);
        log.info(
                "mcp.confirm.decided ticketId={} status={} tool={} userId={}",
                ticketId,
                nextStatus,
                ticket.tool(),
                ticket.userId()
        );
        return updated;
    }

    void clearForTests() {
        byId.clear();
    }

    private ConfirmTicket refreshExpiry(ConfirmTicket ticket, Instant now) {
        if (!ConfirmTicket.STATUS_PENDING.equals(ticket.status())) {
            return ticket;
        }
        Instant expires = Instant.parse(ticket.expiresAt());
        if (now.isBefore(expires)) {
            return ticket;
        }
        ConfirmTicket expired = new ConfirmTicket(
                ticket.ticketId(),
                ticket.userId(),
                ticket.tenantId(),
                ticket.tool(),
                ticket.risk(),
                ticket.summary(),
                ticket.preview(),
                ConfirmTicket.STATUS_EXPIRED,
                ticket.createdAt(),
                ticket.expiresAt(),
                now.toString(),
                ticket.decideNote(),
                ticket.execution()
        );
        byId.put(ticket.ticketId(), expired);
        return expired;
    }
}
