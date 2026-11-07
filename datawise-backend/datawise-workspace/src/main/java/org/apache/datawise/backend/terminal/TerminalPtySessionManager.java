package org.apache.datawise.backend.terminal;

import org.springframework.stereotype.Service;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class TerminalPtySessionManager {

    private static final int MAX_SESSIONS_PER_USER = 1;

    private final Map<String, TerminalPtySession> sessionsById = new ConcurrentHashMap<>();
    private final Map<Long, String> sessionIdByUser = new ConcurrentHashMap<>();
    private final Map<String, Long> ownerBySessionId = new ConcurrentHashMap<>();

    public TerminalPtySession create(String sessionId, Long userId, int cols, int rows) throws IOException {
        if (userId == null) {
            throw new IllegalArgumentException("Authenticated user required for terminal session");
        }
        destroy(sessionId);
        String existingForUser = sessionIdByUser.get(userId);
        if (existingForUser != null) {
            destroy(existingForUser);
        }
        TerminalPtySession session = TerminalPtySession.start(sessionId, cols, rows);
        sessionsById.put(sessionId, session);
        sessionIdByUser.put(userId, sessionId);
        ownerBySessionId.put(sessionId, userId);
        return session;
    }

    public TerminalPtySession get(String sessionId) {
        return sessionsById.get(sessionId);
    }

    public Long getOwnerUserId(String sessionId) {
        return ownerBySessionId.get(sessionId);
    }

    public boolean isOwner(String sessionId, Long userId) {
        if (userId == null || sessionId == null || sessionId.isBlank()) {
            return false;
        }
        return userId.equals(ownerBySessionId.get(sessionId));
    }

    public void destroy(String sessionId) {
        TerminalPtySession session = sessionsById.remove(sessionId);
        if (session != null) {
            session.destroy();
            ownerBySessionId.remove(sessionId);
            sessionIdByUser.entrySet().removeIf(entry -> sessionId.equals(entry.getValue()));
        }
    }

    public boolean isPtyAvailable() {
        return TerminalPtySession.isPtyAvailable();
    }
}
