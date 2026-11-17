package org.apache.datawise.backend.configstore;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.model.SessionEntity;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 登录会话：落盘 {@code config/sessions.json}，支持 TTL 与滑动续期。
 */
@Service
@ConditionalOnProperty(prefix = "datawise.storage", name = "backend", havingValue = "file", matchIfMissing = true)
public class FileSessionStore implements SessionStore {

    private final JsonListFile<SessionEntity> sessions;
    private final AuthSessionPolicyService sessionPolicy;
    /** Per-session locks for authenticate/renew/upsert read-modify-write. */
    private final ConcurrentHashMap<String, Object> sessionLocks = new ConcurrentHashMap<>();

    public FileSessionStore(
                            ConfigDirectoryService configDirectory,
                            ObjectMapper objectMapper,
                            AuthSessionPolicyService sessionPolicy) {
        this.sessionPolicy = sessionPolicy;
        this.sessions = new JsonListFile<>(
                configDirectory,
                objectMapper,
                ConfigPaths.SESSIONS,
                new TypeReference<List<SessionEntity>>() {
                });
        purgeExpired();
    }

    @Override
    public Optional<SessionEntity> findById(String id) {
        if (id == null || id.isBlank()) {
            return Optional.empty();
        }
        String normalized = id.trim();
        return sessions.stream()
                .filter(session -> normalized.equals(session.getId()))
                .findFirst();
    }

    @Override
    public Optional<SessionEntity> authenticate(String id) {
        if (id == null || id.isBlank()) {
            return Optional.empty();
        }
        String normalized = id.trim();
        synchronized (lockFor(normalized)) {
            Optional<SessionEntity> found = findById(normalized);
            if (found.isEmpty()) {
                return Optional.empty();
            }
            SessionEntity session = found.get();
            if (!isActive(session)) {
                sessions.removeIf(item -> normalized.equals(item.getId()));
                sessionLocks.remove(normalized);
                return Optional.empty();
            }
            if (sessionPolicy.shouldRenewNow(session.getExpiresAt())) {
                try {
                    return Optional.of(renewLocked(session));
                } catch (IllegalStateException ex) {
                    return Optional.empty();
                }
            }
            return Optional.of(session);
        }
    }

    @Override
    public SessionEntity save(SessionEntity session) {
        if (session == null || session.getId() == null || session.getId().isBlank()) {
            throw new IllegalArgumentException("Session id is required");
        }
        String normalized = session.getId().trim();
        synchronized (lockFor(normalized)) {
            return sessions.upsert(session, existing -> existing.getId().equals(session.getId()));
        }
    }

    @Override
    public SessionEntity create(SessionEntity session) {
        Instant now = Instant.now();
        if (session.getCreatedAt() == null) {
            session.setCreatedAt(now);
        }
        session.setExpiresAt(now.plus(sessionPolicy.ttlMinutes(), ChronoUnit.MINUTES));
        return save(session);
    }

    @Override
    public SessionEntity renew(SessionEntity session) {
        if (session == null || session.getId() == null || session.getId().isBlank()) {
            throw new IllegalStateException("Session no longer exists");
        }
        String normalized = session.getId().trim();
        synchronized (lockFor(normalized)) {
            return renewLocked(session);
        }
    }

    private SessionEntity renewLocked(SessionEntity session) {
        // Do not resurrect a session that was deleted (logout) between authenticate() and renew().
        if (session.getId() == null || findById(session.getId()).isEmpty()) {
            throw new IllegalStateException("Session no longer exists");
        }
        session.setExpiresAt(Instant.now().plus(sessionPolicy.ttlMinutes(), ChronoUnit.MINUTES));
        return sessions.upsert(session, existing -> existing.getId().equals(session.getId()));
    }

    @Override
    public void deleteById(String id) {
        if (id == null || id.isBlank()) {
            return;
        }
        String normalized = id.trim();
        synchronized (lockFor(normalized)) {
            sessions.removeIf(session -> normalized.equals(session.getId()));
            sessionLocks.remove(normalized);
        }
    }

    private Object lockFor(String sessionId) {
        return sessionLocks.computeIfAbsent(sessionId, ignored -> new Object());
    }

    @Override
    public void deleteByUserId(long userId) {
        sessions.removeIf(session -> session.getUserId() != null && session.getUserId() == userId);
    }

    @Override
    public void purgeExpired() {
        Instant now = Instant.now();
        sessions.removeIf(session -> session.getExpiresAt() != null && !session.getExpiresAt().isAfter(now));
    }

    private boolean isActive(SessionEntity session) {
        Instant expiresAt = session.getExpiresAt();
        return expiresAt == null || expiresAt.isAfter(Instant.now());
    }
}
