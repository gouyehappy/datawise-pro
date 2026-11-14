package org.apache.datawise.backend.ai.service;

import org.apache.datawise.backend.common.UnauthorizedException;
import org.apache.datawise.backend.security.UserContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Exact-SQL one-shot write grant for Agent mode (T-AI-1).
 * Ask mode never issues grants; consumed grants cannot be reused.
 */
@Service
public class AgentWriteGrantService {

    private static final Logger auditLog = LoggerFactory.getLogger("datawise.audit.ai");
    private static final Duration TTL = Duration.ofMinutes(5);

    private final ConcurrentHashMap<String, Grant> grants = new ConcurrentHashMap<>();

    public GrantView issue(IssueRequest request) {
        requireInteractiveUiSession();
        Long userId = UserContext.requireUserId();
        String tenantId = UserContext.requireTenantId();
        if (request.confirmedSql() == null || request.confirmedSql().isBlank()) {
            throw new IllegalArgumentException("confirmedSql is required");
        }
        if (request.connectionId() == null || request.connectionId().isBlank()) {
            throw new IllegalArgumentException("connectionId is required");
        }
        Instant now = Instant.now();
        String grantId = UUID.randomUUID().toString();
        String sqlHash = sha256(normalizeSql(request.confirmedSql()));
        Grant grant = new Grant(
                grantId,
                userId,
                tenantId,
                request.conversationId(),
                request.connectionId(),
                request.database(),
                request.schema(),
                normalizeSql(request.confirmedSql()),
                sqlHash,
                now,
                now.plus(TTL),
                false);
        grants.put(grantId, grant);
        auditLog.info(
                "WRITE_GRANT_ISSUE grantId={} userId={} conversationId={} connectionId={} sqlHash={}",
                grantId, userId, request.conversationId(), request.connectionId(), sqlHash);
        return toView(grant);
    }

    public void consume(String grantId, String confirmedSql, Long userId) {
        requireInteractiveUiSession();
        if (grantId == null || grantId.isBlank()) {
            throw new IllegalArgumentException("grantId is required to approve Agent SQL");
        }
        Grant grant = grants.get(grantId);
        if (grant == null) {
            throw new IllegalArgumentException("write grant not found or expired");
        }
        if (!Objects.equals(grant.userId(), userId)) {
            throw new UnauthorizedException();
        }
        if (grant.consumed()) {
            throw new IllegalArgumentException("write grant already consumed");
        }
        if (grant.expiresAt().isBefore(Instant.now())) {
            grants.remove(grantId, grant);
            throw new IllegalArgumentException("write grant expired");
        }
        String normalized = normalizeSql(confirmedSql);
        if (!Objects.equals(grant.confirmedSql(), normalized)) {
            throw new IllegalArgumentException("confirmedSql does not match issued grant");
        }
        Grant consumed = grant.consume();
        grants.put(grantId, consumed);
        auditLog.info(
                "WRITE_GRANT_CONSUME grantId={} userId={} conversationId={} connectionId={} sqlHash={} outcome=ok",
                grantId, userId, grant.conversationId(), grant.connectionId(), grant.sqlHash());
    }

    public void revokeConversation(String conversationId, Long userId) {
        if (conversationId == null || conversationId.isBlank()) return;
        grants.entrySet().removeIf(entry -> {
            Grant g = entry.getValue();
            return Objects.equals(g.userId(), userId)
                    && Objects.equals(g.conversationId(), conversationId)
                    && !g.consumed();
        });
    }

    private static void requireInteractiveUiSession() {
        if (UserContext.isApiTokenAuth()) {
            throw new UnauthorizedException();
        }
    }

    private static String normalizeSql(String sql) {
        return sql == null ? "" : sql.replace("\r\n", "\n").trim();
    }

    private static String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (Exception ex) {
            throw new IllegalStateException("sha256 unavailable", ex);
        }
    }

    private static GrantView toView(Grant grant) {
        return new GrantView(
                grant.grantId(),
                grant.conversationId(),
                grant.connectionId(),
                grant.database(),
                grant.schema(),
                grant.sqlHash(),
                grant.expiresAt().toString(),
                grant.consumed());
    }

    public record IssueRequest(
            String conversationId,
            String connectionId,
            String database,
            String schema,
            String confirmedSql) {
    }

    public record GrantView(
            String grantId,
            String conversationId,
            String connectionId,
            String database,
            String schema,
            String sqlHash,
            String expiresAt,
            boolean consumed) {
    }

    private record Grant(
            String grantId,
            Long userId,
            String tenantId,
            String conversationId,
            String connectionId,
            String database,
            String schema,
            String confirmedSql,
            String sqlHash,
            Instant createdAt,
            Instant expiresAt,
            boolean consumed) {
        Grant consume() {
            return new Grant(
                    grantId, userId, tenantId, conversationId, connectionId, database, schema,
                    confirmedSql, sqlHash, createdAt, expiresAt, true);
        }
    }
}
