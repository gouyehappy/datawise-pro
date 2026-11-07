package org.apache.datawise.backend.kubernetes.exec;

import org.apache.datawise.backend.model.ConnectionEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class KubernetesExecSessionManager {

    private static final Logger log = LoggerFactory.getLogger(KubernetesExecSessionManager.class);
    private static final int MAX_SESSIONS_PER_USER = 8;

    private final Map<String, ManagedSession> sessionsById = new ConcurrentHashMap<>();
    private final Map<Long, Integer> activeCountByUser = new ConcurrentHashMap<>();

    public KubernetesExecSession create(
            String sessionId,
            Long userId,
            ConnectionEntity entity,
            String namespace,
            String podName,
            String container,
            int cols,
            int rows,
            List<String> command
    ) throws Exception {
        if (userId == null) {
            throw new IllegalArgumentException("Authenticated user required for Kubernetes exec session");
        }
        destroy(sessionId);
        int active = activeCountByUser.getOrDefault(userId, 0);
        if (active >= MAX_SESSIONS_PER_USER) {
            throw new IllegalStateException("Too many active Kubernetes exec sessions. Close an existing session and retry.");
        }
        KubernetesExecSession session = KubernetesExecSession.open(
                sessionId, entity, namespace, podName, container, cols, rows, command
        );
        sessionsById.put(
                sessionId,
                new ManagedSession(session, userId, entity.getId(), namespace, podName, System.currentTimeMillis())
        );
        activeCountByUser.merge(userId, 1, Integer::sum);
        log.info(
                "Opened k8s exec sessionId={} connectionId={} userId={} pod={}/{}",
                sessionId,
                entity.getId(),
                userId,
                namespace,
                podName
        );
        return session;
    }

    public KubernetesExecSession get(String sessionId) {
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

    public void touch(String sessionId) {
        ManagedSession managed = sessionsById.get(sessionId);
        if (managed != null) {
            sessionsById.put(
                    sessionId,
                    new ManagedSession(
                            managed.session(),
                            managed.userId(),
                            managed.connectionId(),
                            managed.namespace(),
                            managed.podName(),
                            System.currentTimeMillis()
                    )
            );
        }
    }

    public void destroy(String sessionId) {
        ManagedSession managed = sessionsById.remove(sessionId);
        if (managed == null) {
            return;
        }
        managed.session().destroy();
        activeCountByUser.computeIfPresent(managed.userId(), (id, count) -> count <= 1 ? null : count - 1);
        log.info("Closed k8s exec sessionId={} connectionId={}", sessionId, managed.connectionId());
    }

    private record ManagedSession(
            KubernetesExecSession session,
            Long userId,
            String connectionId,
            String namespace,
            String podName,
            long lastTouchMs
    ) {
    }
}
