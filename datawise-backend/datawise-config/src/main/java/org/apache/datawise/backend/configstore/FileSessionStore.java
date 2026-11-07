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

/**
 * 登录会话：落盘 {@code config/sessions.json}，支持 TTL 与滑动续期。
 */
@Service
@ConditionalOnProperty(prefix = "datawise.storage", name = "backend", havingValue = "file", matchIfMissing = true)
public class FileSessionStore implements SessionStore {

    private final JsonListFile<SessionEntity> sessions;
    private final AuthSessionPolicyService sessionPolicy;

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
        Optional<SessionEntity> found = findById(id);
        if (found.isEmpty()) {
            return Optional.empty();
        }
        SessionEntity session = found.get();
        if (!isActive(session)) {
            deleteById(id);
            return Optional.empty();
        }
        if (sessionPolicy.slidingRenewal()) {
            return Optional.of(renew(session));
        }
        return Optional.of(session);
    }

    @Override
    public SessionEntity save(SessionEntity session) {
        return sessions.upsert(session, existing -> existing.getId().equals(session.getId()));
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
        session.setExpiresAt(Instant.now().plus(sessionPolicy.ttlMinutes(), ChronoUnit.MINUTES));
        return save(session);
    }

    @Override
    public void deleteById(String id) {
        if (id == null || id.isBlank()) {
            return;
        }
        String normalized = id.trim();
        sessions.removeIf(session -> normalized.equals(session.getId()));
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
