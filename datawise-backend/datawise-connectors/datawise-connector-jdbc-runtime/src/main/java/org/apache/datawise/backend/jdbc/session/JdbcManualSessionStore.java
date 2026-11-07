package org.apache.datawise.backend.jdbc.session;

import org.apache.datawise.backend.common.SqlSessionGoneException;
import org.apache.datawise.backend.domain.SqlSessionStatus;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;

/** 控制台手动 JDBC 会话的内存存储。 */
@Component
public class JdbcManualSessionStore {

    private static final Logger log = LoggerFactory.getLogger(JdbcManualSessionStore.class);

    private static final long IDLE_TTL_MS = 30L * 60L * 1000L;

    private final Map<String, ManagedSession> sessions = new ConcurrentHashMap<>();

    public SqlSessionStatus getStatus(long userId, String sessionKey) {
        ManagedSession session = sessions.get(key(userId, sessionKey));
        if (session == null) {
            return SqlSessionStatus.idle(null, null);
        }
        return session.toStatus();
    }

    public ManagedSession get(long userId, String sessionKey) {
        return sessions.get(key(userId, sessionKey));
    }

    public ManagedSession getOrCreate(long userId, String sessionKey, String connectionId, String database) {
        return sessions.computeIfAbsent(
                key(userId, sessionKey),
                ignored -> new ManagedSession(connectionId, database)
        ).touch();
    }

    /** 连接被 abort 后清掉会话内引用，避免后续 SQL 复用已失效连接。 */
    public void invalidateConnection(String executionKey) {
        int colon = executionKey.indexOf(':');
        if (colon <= 0 || colon >= executionKey.length() - 1) {
            return;
        }
        try {
            long userId = Long.parseLong(executionKey.substring(0, colon));
            String sessionKey = executionKey.substring(colon + 1);
            ManagedSession session = sessions.get(key(userId, sessionKey));
            if (session == null) {
                return;
            }
            session.lock.lock();
            try {
                closeQuietly(session.connection);
                session.connection = null;
            } finally {
                session.lock.unlock();
            }
        } catch (NumberFormatException ignored) {
            // not a console execution key
        }
    }

    public ManagedSession requireSession(long userId, String sessionKey) {
        ManagedSession session = sessions.get(key(userId, sessionKey));
        if (session == null || session.connection == null) {
            throw new SqlSessionGoneException();
        }
        return session.touch();
    }

    public ManagedSession requireManualSession(long userId, String sessionKey) {
        ManagedSession session = sessions.get(key(userId, sessionKey));
        if (session == null || session.autocommit) {
            return null;
        }
        return session.touch();
    }

    public ManagedSession remove(long userId, String sessionKey) {
        return sessions.remove(key(userId, sessionKey));
    }

    public void markPending(long userId, String sessionKey) {
        ManagedSession session = sessions.get(key(userId, sessionKey));
        if (session != null && !session.autocommit) {
            session.pending = true;
        }
    }

    @Scheduled(fixedRate = 60_000)
    void evictIdleSessionsScheduled() {
        evictIdleSessions(System.currentTimeMillis() - IDLE_TTL_MS);
    }

    void evictIdleSessions(long cutoffMs) {
        List<String> staleKeys = new ArrayList<>();
        sessions.forEach((sessionKey, session) -> {
            if (session.lastAccessedAtMs < cutoffMs) {
                staleKeys.add(sessionKey);
            }
        });
        for (String sessionKey : staleKeys) {
            ManagedSession session = sessions.remove(sessionKey);
            if (session == null) {
                continue;
            }
            boolean openTx = session.connection != null && !session.autocommit;
            if (openTx || session.pending) {
                log.warn(
                        "Evicting idle JDBC console session key={} connectionId={} database={} pending={} openTx={} idleTtlMs={}",
                        sessionKey,
                        session.connectionId,
                        session.database,
                        session.pending,
                        openTx,
                        IDLE_TTL_MS
                );
            } else if (log.isDebugEnabled()) {
                log.debug("Evicting idle JDBC console session key={} connectionId={}", sessionKey, session.connectionId);
            }
            session.lock.lock();
            try {
                closeQuietly(session.connection);
                session.connection = null;
            } finally {
                session.lock.unlock();
            }
        }
    }

    public static String key(long userId, String sessionKey) {
        return userId + ":" + sessionKey;
    }

    private static void closeQuietly(Connection connection) {
        if (connection == null) {
            return;
        }
        try {
            if (!connection.getAutoCommit()) {
                connection.rollback();
            }
        } catch (SQLException ignored) {
            // best effort
        }
        try {
            connection.close();
        } catch (SQLException ignored) {
            // best effort
        }
    }

    public static final class ManagedSession {
        public final ReentrantLock lock = new ReentrantLock(true);
        public Connection connection;
        public String connectionId;
        public String database;
        public boolean autocommit = true;
        public boolean pending;
        public long lastAccessedAtMs = System.currentTimeMillis();

        ManagedSession(String connectionId, String database) {
            this.connectionId = connectionId;
            this.database = database;
        }

        ManagedSession touch() {
            lastAccessedAtMs = System.currentTimeMillis();
            return this;
        }

        public SqlSessionStatus toStatus() {
            return new SqlSessionStatus(autocommit, pending, connectionId, database);
        }
    }
}
