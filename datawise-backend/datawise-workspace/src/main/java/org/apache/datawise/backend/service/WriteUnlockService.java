package org.apache.datawise.backend.service;

import org.apache.datawise.backend.common.ConnectionAccessDeniedException;
import org.apache.datawise.backend.common.UnauthorizedException;
import org.apache.datawise.backend.common.support.ConnectionAccessLevel;
import org.apache.datawise.backend.configstore.ConnectionStore;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.security.UserContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * UI-only timed write unlock for connections with {@link ConnectionEntity#isWriteGuard()} (T-SAFE-1).
 * API tokens / MCP / CLI never inherit unlock windows.
 */
@Service
public class WriteUnlockService {

    private static final Logger auditLog = LoggerFactory.getLogger("datawise.audit.writeUnlock");

    public static final Set<Integer> ALLOWED_DURATIONS_SEC = Set.of(60, 300);

    private final ConnectionStore connectionStore;
    private final ConcurrentHashMap<String, UnlockWindow> windows = new ConcurrentHashMap<>();

    public WriteUnlockService(ConnectionStore connectionStore) {
        this.connectionStore = connectionStore;
    }

    public UnlockStatus unlock(Long userId, String connectionId, int durationSec) {
        requireInteractiveUiSession();
        if (!ALLOWED_DURATIONS_SEC.contains(durationSec)) {
            throw new IllegalArgumentException("durationSec must be 60 or 300");
        }
        ConnectionEntity connection = requireOwnedWriteGuard(userId, connectionId);
        Instant now = Instant.now();
        UnlockWindow window = new UnlockWindow(
                userId,
                UserContext.requireTenantId(),
                connection.getId(),
                UserContext.getSessionId(),
                durationSec,
                now,
                now.plus(Duration.ofSeconds(durationSec)));
        windows.put(key(userId, connection.getId()), window);
        auditLog.info(
                "WRITE_UNLOCK_GRANT userId={} connectionId={} durationSec={} uiSessionId={} expiresAt={}",
                userId, connection.getId(), durationSec, window.uiSessionId(), window.expiresAt());
        return toStatus(window);
    }

    public void clear(Long userId, String connectionId) {
        requireInteractiveUiSession();
        UnlockWindow removed = windows.remove(key(userId, connectionId));
        if (removed != null) {
            auditLog.info(
                    "WRITE_UNLOCK_CLEAR userId={} connectionId={} uiSessionId={}",
                    userId, connectionId, removed.uiSessionId());
        }
    }

    /** Clear all unlock windows for a user (logout / session teardown). */
    public int clearAllForUser(Long userId) {
        if (userId == null) return 0;
        int cleared = 0;
        for (var entry : windows.entrySet()) {
            if (Objects.equals(entry.getValue().userId(), userId)) {
                if (windows.remove(entry.getKey(), entry.getValue())) {
                    cleared++;
                }
            }
        }
        if (cleared > 0) {
            auditLog.info("WRITE_UNLOCK_CLEAR_ALL userId={} count={}", userId, cleared);
        }
        return cleared;
    }

    public Optional<UnlockStatus> current(Long userId, String connectionId) {
        if (UserContext.isApiTokenAuth()) {
            return Optional.empty();
        }
        UnlockWindow window = windows.get(key(userId, connectionId));
        if (window == null) {
            return Optional.empty();
        }
        if (!Objects.equals(window.uiSessionId(), UserContext.getSessionId())) {
            return Optional.empty();
        }
        if (window.expiresAt().isBefore(Instant.now())) {
            windows.remove(key(userId, connectionId), window);
            return Optional.empty();
        }
        return Optional.of(toStatus(window));
    }

    /**
     * Whether the current interactive UI session may bypass writeGuard for this connection.
     */
    public boolean isUnlockedForCurrentUiSession(Long userId, String connectionId) {
        return current(userId, connectionId).isPresent();
    }

    private ConnectionEntity requireOwnedWriteGuard(Long userId, String connectionId) {
        ConnectionEntity connection = connectionStore.findConnectionById(connectionId)
                .orElseThrow(() -> new ConnectionAccessDeniedException(
                        userId, connectionId, "UNLOCK", ConnectionAccessLevel.READONLY, "writeUnlock:missing"));
        if (connection.getUserId() == null || !connection.getUserId().equals(userId)) {
            throw new ConnectionAccessDeniedException(
                    userId, connectionId, "UNLOCK", ConnectionAccessLevel.READONLY, "writeUnlock:notOwner");
        }
        if (!connection.isWriteGuard()) {
            throw new IllegalArgumentException("writeGuard is not enabled on this connection");
        }
        return connection;
    }

    private static void requireInteractiveUiSession() {
        if (UserContext.isApiTokenAuth()) {
            throw new UnauthorizedException();
        }
        if (UserContext.getSessionId() == null || UserContext.getSessionId().isBlank()) {
            throw new UnauthorizedException();
        }
    }

    private static String key(Long userId, String connectionId) {
        return userId + "\0" + connectionId;
    }

    private static UnlockStatus toStatus(UnlockWindow window) {
        return new UnlockStatus(
                window.connectionId(),
                window.durationSec(),
                window.createdAt().toString(),
                window.expiresAt().toString(),
                Duration.between(Instant.now(), window.expiresAt()).getSeconds());
    }

    public record UnlockWindow(
            Long userId,
            String tenantId,
            String connectionId,
            String uiSessionId,
            int durationSec,
            Instant createdAt,
            Instant expiresAt) {
    }

    public record UnlockStatus(
            String connectionId,
            int durationSec,
            String createdAt,
            String expiresAt,
            long remainingSec) {
    }
}
