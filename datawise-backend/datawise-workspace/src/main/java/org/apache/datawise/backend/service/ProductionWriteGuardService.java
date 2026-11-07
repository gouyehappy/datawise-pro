package org.apache.datawise.backend.service;

import org.apache.datawise.backend.common.ProductionWriteBlockedException;
import org.apache.datawise.backend.common.support.ConnectionEnvironmentSupport;
import org.apache.datawise.backend.configstore.TeamStore;
import org.apache.datawise.backend.connector.api.support.SqlWriteClassifier;
import org.apache.datawise.backend.domain.OutboundEventType;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.model.TeamEntity;
import org.apache.datawise.backend.model.TeamMemberEntity;
import org.apache.datawise.backend.service.outbound.annotation.OutboundData;
import org.apache.datawise.backend.service.outbound.annotation.OutboundNotify;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Server-side enforcement aligned with frontend {@code production-approval-policy.service.ts}.
 */
@Service
public class ProductionWriteGuardService {

    public static final String APPROVAL_SESSION_PREFIX = "prod-approval-";
    private static final Duration TICKET_TTL = Duration.ofMinutes(5);

    private final TeamStore teamStore;
    private final ConcurrentHashMap<String, ApprovalTicket> approvalTickets = new ConcurrentHashMap<>();

    public ProductionWriteGuardService(TeamStore teamStore) {
        this.teamStore = teamStore;
    }

    public boolean requiresProductionApproval(long userId, ConnectionEntity connection, String sql) {
        if (connection == null || connection.getId() == null || connection.getId().isBlank()) {
            return false;
        }
        if (!SqlWriteClassifier.requiresWriteAccess(sql)) {
            return false;
        }
        if (!ConnectionEnvironmentSupport.isProduction(connection)) {
            return false;
        }
        return hasSharedTeamConnection(userId, connection.getId());
    }

    @OutboundNotify(
            type = OutboundEventType.SQL_PRODUCTION_BLOCKED,
            when = OutboundNotify.When.AFTER_THROWING,
            onException = ProductionWriteBlockedException.class,
            data = {
                    @OutboundData(key = "connectionId", value = "#connection?.id"),
                    @OutboundData(key = "name", value = "#connection?.name")
            }
    )
    public void requireProductionWriteAllowed(
            long userId,
            ConnectionEntity connection,
            String sql,
            String sessionKey
    ) {
        if (!requiresProductionApproval(userId, connection, sql)) {
            return;
        }
        if (consumeApprovedExecutionSession(sessionKey, connection, sql)) {
            return;
        }
        String connectionId = connection != null ? connection.getId() : "";
        throw new ProductionWriteBlockedException(userId, connectionId);
    }

    /**
     * Issues a one-time, unguessable execution ticket after a human approval.
     * Clients cannot forge tickets by inventing a {@link #APPROVAL_SESSION_PREFIX} string.
     */
    public String issueApprovalTicket(String approvalId, String connectionId, String sql) {
        Objects.requireNonNull(approvalId, "approvalId");
        Objects.requireNonNull(connectionId, "connectionId");
        String ticket = APPROVAL_SESSION_PREFIX + UUID.randomUUID().toString().replace("-", "");
        approvalTickets.put(
                ticket,
                new ApprovalTicket(
                        approvalId,
                        connectionId,
                        sqlFingerprint(sql),
                        Instant.now().plus(TICKET_TTL)
                )
        );
        return ticket;
    }

    /**
     * Validates and atomically consumes a previously issued ticket.
     * Prefix-only strings and reused tickets are rejected.
     * Mismatched connection/SQL do not consume the ticket (so the approved execute can still proceed).
     */
    public boolean consumeApprovedExecutionSession(String sessionKey, ConnectionEntity connection, String sql) {
        if (sessionKey == null || sessionKey.isBlank() || connection == null) {
            return false;
        }
        ApprovalTicket ticket = approvalTickets.get(sessionKey);
        if (ticket == null) {
            return false;
        }
        if (Instant.now().isAfter(ticket.expiresAt())) {
            approvalTickets.remove(sessionKey, ticket);
            return false;
        }
        String connectionId = connection.getId();
        if (connectionId == null || !connectionId.equals(ticket.connectionId())) {
            return false;
        }
        if (!Objects.equals(sqlFingerprint(sql), ticket.sqlFingerprint())) {
            return false;
        }
        return approvalTickets.remove(sessionKey, ticket);
    }

    /** Any team share of the connection requires approval (including team managers — maker-checker). */
    private boolean hasSharedTeamConnection(long userId, String connectionId) {
        for (TeamMemberEntity membership : teamStore.findMembersByUserId(userId)) {
            TeamEntity team = teamStore.findTeamById(membership.getTeamId()).orElse(null);
            if (team == null || !team.getSharedConnectionIds().contains(connectionId)) {
                continue;
            }
            return true;
        }
        return false;
    }

    private static String sqlFingerprint(String sql) {
        String normalized = sql == null ? "" : sql;
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(normalized.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    private record ApprovalTicket(
            String approvalId,
            String connectionId,
            String sqlFingerprint,
            Instant expiresAt
    ) {
    }
}
