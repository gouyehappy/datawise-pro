package org.apache.datawise.backend.connector.ssh;

import org.apache.datawise.backend.model.ConnectionEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class SshShellSessionManager {

    private static final Logger log = LoggerFactory.getLogger(SshShellSessionManager.class);
    private static final int MAX_SESSIONS_PER_USER = 8;

    private final SshClientProperties sshClientProperties;
    private final Map<String, ManagedSession> sessionsById = new ConcurrentHashMap<>();
    private final Map<Long, Integer> activeCountByUser = new ConcurrentHashMap<>();

    public SshShellSessionManager(SshClientProperties sshClientProperties) {
        this.sshClientProperties = sshClientProperties != null ? sshClientProperties : new SshClientProperties();
    }

    public SshShellSession create(
            String sessionId,
            Long userId,
            ConnectionEntity entity,
            int cols,
            int rows
    ) throws SshConnectionException {
        if (userId == null) {
            throw new IllegalArgumentException("Authenticated user required for SSH shell session");
        }
        // Replace only this tab's shell id. Other tabs on the same connection stay independent.
        destroy(sessionId);
        int active = activeCountByUser.getOrDefault(userId, 0);
        if (active >= MAX_SESSIONS_PER_USER) {
            // Heal counter drift (e.g. races) before failing hard.
            reconcileActiveCount(userId);
            active = activeCountByUser.getOrDefault(userId, 0);
        }
        if (active >= MAX_SESSIONS_PER_USER) {
            throw new SshConnectionException("Too many active SSH sessions. Close an existing session and retry.");
        }
        SshShellSession session = SshShellSession.open(sessionId, entity, cols, rows, sshClientProperties);
        sessionsById.put(sessionId, new ManagedSession(session, userId, entity.getId(), System.currentTimeMillis()));
        activeCountByUser.merge(userId, 1, Integer::sum);
        log.info(
                "Opened SSH shell sessionId={} connectionId={} userId={} target={}:{}",
                sessionId,
                entity.getId(),
                userId,
                entity.getHost(),
                SshConnectionSupport.sshPort(entity)
        );
        return session;
    }

    public SshShellSession get(String sessionId) {
        ManagedSession managed = sessionsById.get(sessionId);
        return managed != null ? managed.session() : null;
    }

    public Long getOwnerUserId(String sessionId) {
        ManagedSession managed = sessionsById.get(sessionId);
        return managed != null ? managed.userId() : null;
    }

    public String getConnectionId(String sessionId) {
        ManagedSession managed = sessionsById.get(sessionId);
        return managed != null ? managed.connectionId() : null;
    }

    public boolean isOwner(String sessionId, Long userId) {
        if (userId == null || sessionId == null || sessionId.isBlank()) {
            return false;
        }
        return userId.equals(getOwnerUserId(sessionId));
    }

    public void destroy(String sessionId) {
        ManagedSession managed = sessionsById.remove(sessionId);
        if (managed == null) {
            return;
        }
        managed.session().destroy();
        activeCountByUser.computeIfPresent(managed.userId(), (id, count) -> count <= 1 ? null : count - 1);
        log.info("Closed SSH shell sessionId={} connectionId={}", sessionId, managed.connectionId());
    }

    public void destroyByConnection(ConnectionEntity entity) {
        if (entity == null || entity.getId() == null || entity.getId().isBlank()) {
            return;
        }
        destroyByConnectionId(entity.getId().trim());
    }

    public void destroyByConnectionId(String connectionId) {
        if (connectionId == null || connectionId.isBlank()) {
            return;
        }
        String id = connectionId.trim();
        for (String sessionId : sessionIdsForConnection(id)) {
            destroy(sessionId);
        }
    }

    @Scheduled(fixedRate = 60_000)
    void evictIdleSessionsScheduled() {
        int idleTtlMinutes = sshClientProperties.getIdleTtlMinutes();
        if (idleTtlMinutes <= 0) {
            return;
        }
        long cutoff = System.currentTimeMillis() - idleTtlMinutes * 60_000L;
        List<String> expired = new ArrayList<>();
        for (Map.Entry<String, ManagedSession> entry : sessionsById.entrySet()) {
            if (entry.getValue().lastUsedAtMs() < cutoff) {
                expired.add(entry.getKey());
            }
        }
        for (String sessionId : expired) {
            destroy(sessionId);
            log.info("Closed idle SSH shell sessionId={}", sessionId);
        }
    }

    public void touch(String sessionId) {
        ManagedSession managed = sessionsById.get(sessionId);
        if (managed != null) {
            managed.touch();
        }
    }

    private List<String> sessionIdsForConnection(String connectionId) {
        List<String> ids = new ArrayList<>();
        for (Map.Entry<String, ManagedSession> entry : sessionsById.entrySet()) {
            if (connectionId.equals(entry.getValue().connectionId())) {
                ids.add(entry.getKey());
            }
        }
        return ids;
    }

    private void reconcileActiveCount(Long userId) {
        int actual = 0;
        for (ManagedSession managed : sessionsById.values()) {
            if (userId.equals(managed.userId())) {
                actual += 1;
            }
        }
        if (actual <= 0) {
            activeCountByUser.remove(userId);
        } else {
            activeCountByUser.put(userId, actual);
        }
    }

    private static final class ManagedSession {
        private final SshShellSession session;
        private final Long userId;
        private final String connectionId;
        private volatile long lastUsedAtMs;

        private ManagedSession(SshShellSession session, Long userId, String connectionId, long lastUsedAtMs) {
            this.session = session;
            this.userId = userId;
            this.connectionId = connectionId;
            this.lastUsedAtMs = lastUsedAtMs;
        }

        private SshShellSession session() {
            return session;
        }

        private Long userId() {
            return userId;
        }

        private String connectionId() {
            return connectionId;
        }

        private long lastUsedAtMs() {
            return lastUsedAtMs;
        }

        private void touch() {
            lastUsedAtMs = System.currentTimeMillis();
        }
    }
}
