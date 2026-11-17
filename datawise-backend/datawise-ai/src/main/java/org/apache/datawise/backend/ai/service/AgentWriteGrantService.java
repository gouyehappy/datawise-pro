package org.apache.datawise.backend.ai.service;

import com.alibaba.cloud.ai.graph.CompiledGraph;
import com.alibaba.cloud.ai.graph.RunnableConfig;
import com.alibaba.cloud.ai.graph.state.StateSnapshot;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphKeys;
import org.apache.datawise.backend.ai.analysis.graph.stream.AiAnalysisGraphStreamSupport;
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
import java.util.concurrent.atomic.AtomicReference;

/**
 * Exact-SQL one-shot write grant for Agent mode (T-AI-1).
 * Ask mode never issues grants; consumed grants cannot be reused.
 */
@Service
public class AgentWriteGrantService {

    private static final Logger auditLog = LoggerFactory.getLogger("datawise.audit.ai");
    private static final Duration TTL = Duration.ofMinutes(5);

    private final ConcurrentHashMap<String, Grant> grants = new ConcurrentHashMap<>();
    private final CompiledGraph compiledGraph;

    public AgentWriteGrantService(CompiledGraph aiAnalysisCompiledGraph) {
        this.compiledGraph = aiAnalysisCompiledGraph;
    }

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
        purgeExpired();
        String normalizedSql = normalizeSql(request.confirmedSql());
        if (request.threadId() != null && !request.threadId().isBlank()) {
            CheckpointScope scope = loadCheckpointScope(request.threadId());
            requireConfirmedSqlMatchesSafeSql(normalizedSql, scope.safeSql());
            requireConnectionMatches(request.connectionId(), scope.connectionId());
        }
        Instant now = Instant.now();
        String grantId = UUID.randomUUID().toString();
        String sqlHash = sha256(normalizedSql);
        Grant grant = new Grant(
                grantId,
                userId,
                tenantId,
                request.conversationId(),
                request.connectionId(),
                request.database(),
                request.schema(),
                request.threadId(),
                normalizedSql,
                sqlHash,
                now,
                now.plus(TTL),
                false);
        grants.put(grantId, grant);
        auditLog.info(
                "WRITE_GRANT_ISSUE grantId={} userId={} conversationId={} connectionId={} threadId={} sqlHash={}",
                grantId, userId, request.conversationId(), request.connectionId(), request.threadId(), sqlHash);
        return toView(grant);
    }

    /**
     * Server-side issue for an interrupt checkpoint (SAFE_SQL already known).
     * Binds the grant to threadId so resume can only execute that checkpoint SQL.
     */
    public GrantView issueForInterrupt(IssueRequest request) {
        if (request.threadId() == null || request.threadId().isBlank()) {
            throw new IllegalArgumentException("threadId is required for interrupt grant");
        }
        return issue(request);
    }

    /**
     * Atomically consumes a one-shot grant. Concurrent double-consume fails.
     *
     * @return connection scope stored on the grant (for resume binding checks)
     */
    public ConsumedGrant consume(String grantId, String confirmedSql, Long userId) {
        requireInteractiveUiSession();
        if (grantId == null || grantId.isBlank()) {
            throw new IllegalArgumentException("grantId is required to approve Agent SQL");
        }
        purgeExpired();
        String normalized = normalizeSql(confirmedSql);
        AtomicReference<Grant> consumed = new AtomicReference<>();
        AtomicReference<RuntimeException> failure = new AtomicReference<>();
        grants.computeIfPresent(grantId, (id, grant) -> {
            if (!Objects.equals(grant.userId(), userId)) {
                failure.set(new UnauthorizedException());
                return grant;
            }
            if (grant.consumed()) {
                failure.set(new IllegalArgumentException("write grant already consumed"));
                return grant;
            }
            if (grant.expiresAt().isBefore(Instant.now())) {
                failure.set(new IllegalArgumentException("write grant expired"));
                return null;
            }
            if (!Objects.equals(grant.confirmedSql(), normalized)) {
                failure.set(new IllegalArgumentException("confirmedSql does not match issued grant"));
                return grant;
            }
            consumed.set(grant);
            // Remove on success so a concurrent second consume cannot observe a reusable entry.
            return null;
        });
        RuntimeException error = failure.get();
        if (error != null) {
            throw error;
        }
        Grant grant = consumed.get();
        if (grant == null) {
            throw new IllegalArgumentException("write grant not found or expired");
        }
        auditLog.info(
                "WRITE_GRANT_CONSUME grantId={} userId={} conversationId={} connectionId={} sqlHash={} outcome=ok",
                grantId, userId, grant.conversationId(), grant.connectionId(), grant.sqlHash());
        return new ConsumedGrant(
                grant.grantId(),
                grant.conversationId(),
                grant.connectionId(),
                grant.database(),
                grant.schema(),
                grant.threadId(),
                grant.sqlHash());
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

    /** Drop expired grants (lazy purge on issue/consume). */
    void purgeExpired() {
        Instant now = Instant.now();
        grants.entrySet().removeIf(entry -> entry.getValue().expiresAt().isBefore(now));
    }

    /** Test hook: number of in-memory grants after purge. */
    int grantCountForTest() {
        purgeExpired();
        return grants.size();
    }

    public static String normalizeSql(String sql) {
        return sql == null ? "" : sql.replace("\r\n", "\n").trim();
    }

    public static void requireConfirmedSqlMatchesSafeSql(String confirmedSql, String safeSql) {
        if (!Objects.equals(normalizeSql(confirmedSql), normalizeSql(safeSql))) {
            throw new IllegalArgumentException("confirmedSql does not match checkpoint SAFE_SQL");
        }
    }

    public static void requireConnectionMatches(String grantConnectionId, String sessionConnectionId) {
        if (grantConnectionId == null || grantConnectionId.isBlank()) {
            return;
        }
        if (sessionConnectionId == null || sessionConnectionId.isBlank()
                || !Objects.equals(grantConnectionId, sessionConnectionId)) {
            throw new IllegalArgumentException("grant connectionId does not match analysis session");
        }
    }

    private CheckpointScope loadCheckpointScope(String threadId) {
        RunnableConfig threadOnly = RunnableConfig.builder().threadId(threadId).build();
        RunnableConfig latest = AiAnalysisGraphStreamSupport.resolveLatestConfig(compiledGraph, threadOnly);
        StateSnapshot snapshot = compiledGraph.getState(latest);
        String safeSql = snapshot.state().value(AiAnalysisGraphKeys.SAFE_SQL, "");
        String connectionId = snapshot.state().value(AiAnalysisGraphKeys.CONNECTION_ID, "");
        String database = snapshot.state().value(AiAnalysisGraphKeys.DATABASE, "");
        return new CheckpointScope(safeSql, connectionId, database);
    }

    private static void requireInteractiveUiSession() {
        if (UserContext.isApiTokenAuth()) {
            throw new UnauthorizedException();
        }
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
            String confirmedSql,
            String threadId) {
        public IssueRequest(
                String conversationId,
                String connectionId,
                String database,
                String schema,
                String confirmedSql) {
            this(conversationId, connectionId, database, schema, confirmedSql, null);
        }
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

    public record ConsumedGrant(
            String grantId,
            String conversationId,
            String connectionId,
            String database,
            String schema,
            String threadId,
            String sqlHash) {
    }

    private record CheckpointScope(String safeSql, String connectionId, String database) {
    }

    private record Grant(
            String grantId,
            Long userId,
            String tenantId,
            String conversationId,
            String connectionId,
            String database,
            String schema,
            String threadId,
            String confirmedSql,
            String sqlHash,
            Instant createdAt,
            Instant expiresAt,
            boolean consumed) {
    }
}
