package org.apache.datawise.backend.database.explorer;

import org.apache.datawise.backend.config.ExplorerSchemaProperties;
import org.apache.datawise.backend.connector.catalog.SchemaSession;
import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.jdbc.connection.ConnectionActivityRegistry;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.common.support.DatawiseMetricsCatalog;
import org.apache.datawise.backend.common.support.ExceptionLogging;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

import java.sql.SQLException;
import java.util.Comparator;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.locks.ReentrantLock;

/**
 * Reuses one {@link SchemaSession} per connection id for rapid explorer tree expands.
 * JDBC {@link java.sql.Connection} is not thread-safe; access is serialized per connection id.
 */
@Component
public class ExplorerSchemaSessionPool {

    private static final Logger log = LoggerFactory.getLogger(ExplorerSchemaSessionPool.class);

    private final ConnectorFacade connectorFacade;
    private final ExplorerSchemaProperties properties;
    private final ConnectionActivityRegistry activityRegistry;
    private final ConcurrentMap<String, PooledSession> sessions = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, ReentrantLock> locks = new ConcurrentHashMap<>();

    public ExplorerSchemaSessionPool(
            ConnectorFacade connectorFacade,
            ExplorerSchemaProperties properties,
            ConnectionActivityRegistry activityRegistry,
            ObjectProvider<MeterRegistry> meterRegistryProvider
    ) {
        this.connectorFacade = connectorFacade;
        this.properties = properties != null ? properties : new ExplorerSchemaProperties();
        this.activityRegistry = activityRegistry;
        MeterRegistry meterRegistry = meterRegistryProvider.getIfAvailable();
        if (meterRegistry != null) {
            Gauge.builder(DatawiseMetricsCatalog.EXPLORER_SCHEMA_SESSIONS_ACTIVE, sessions, ConcurrentMap::size)
                    .description("Cached explorer schema introspection sessions keyed by connection id")
                    .register(meterRegistry);
        }
    }

    public <T> T withSession(ConnectionEntity connection, SessionCallback<T> callback) throws Exception {
        String connectionId = connection.getId();
        ReentrantLock lock = locks.computeIfAbsent(connectionId, ignored -> new ReentrantLock());
        lock.lock();
        try {
            evictExpiredSession(connectionId);
            evictExpiredSessionsIfNeeded();
            PooledSession pooled = openOrReuse(connection);
            pooled.enterUse();
            try {
                return callback.apply(pooled.session());
            } catch (SQLException ex) {
                removeAndClose(connectionId, pooled);
                throw ex;
            } finally {
                pooled.exitUse();
                pooled.touch();
                activityRegistry.touch(connectionId);
            }
        } finally {
            lock.unlock();
        }
    }

    public void invalidate(String connectionId) {
        if (connectionId == null || connectionId.isBlank()) {
            return;
        }
        ReentrantLock lock = locks.computeIfAbsent(connectionId, ignored -> new ReentrantLock());
        lock.lock();
        try {
            PooledSession removed = sessions.remove(connectionId);
            if (removed != null) {
                removed.closeQuietly();
            }
        } finally {
            lock.unlock();
        }
    }

    private PooledSession openOrReuse(ConnectionEntity connection) throws SQLException {
        String connectionId = connection.getId();
        PooledSession existing = sessions.get(connectionId);
        if (existing != null && !existing.isExpired() && existing.isConnectionUsable()) {
            return existing;
        }
        if (existing != null) {
            sessions.remove(connectionId, existing);
            existing.closeQuietly();
        }
        enforceMaxEntries();
        SchemaSession session = connectorFacade.catalog().openSchemaSession(connection);
        PooledSession pooled = new PooledSession(session, properties.getIdleTimeoutMs());
        sessions.put(connectionId, pooled);
        return pooled;
    }

    private void evictExpiredSession(String connectionId) {
        if (connectionId == null || connectionId.isBlank()) {
            return;
        }
        PooledSession pooled = sessions.get(connectionId);
        if (pooled != null && pooled.isExpired() && sessions.remove(connectionId, pooled)) {
            pooled.closeQuietly();
        }
    }

    private void evictExpiredSessionsIfNeeded() {
        if (sessions.size() <= properties.getMaxEntries()) {
            return;
        }
        evictExpiredSessions();
    }

    private void evictExpiredSessions() {
        for (var entry : sessions.entrySet()) {
            evictIfExpired(entry.getKey(), entry.getValue());
        }
    }

    private void evictIfExpired(String connectionId, PooledSession pooled) {
        if (!pooled.isExpired() || pooled.isInUse()) {
            return;
        }
        ReentrantLock lock = locks.computeIfAbsent(connectionId, ignored -> new ReentrantLock());
        if (!lock.tryLock()) {
            return;
        }
        try {
            PooledSession current = sessions.get(connectionId);
            if (current == pooled && current.isExpired() && !current.isInUse()) {
                if (sessions.remove(connectionId, current)) {
                    current.closeQuietly();
                }
            }
        } finally {
            lock.unlock();
        }
    }

    private void enforceMaxEntries() {
        while (sessions.size() >= properties.getMaxEntries()) {
            boolean evicted = sessions.entrySet().stream()
                    .sorted(Comparator.comparingLong(entry -> entry.getValue().lastAccessMs()))
                    .anyMatch(entry -> tryEvictEntry(entry.getKey(), entry.getValue()));
            if (!evicted) {
                break;
            }
        }
    }

    private boolean tryEvictEntry(String connectionId, PooledSession candidate) {
        if (candidate.isInUse()) {
            return false;
        }
        ReentrantLock lock = locks.computeIfAbsent(connectionId, ignored -> new ReentrantLock());
        if (!lock.tryLock()) {
            return false;
        }
        try {
            PooledSession current = sessions.get(connectionId);
            if (current == candidate && !current.isInUse()) {
                if (sessions.remove(connectionId, current)) {
                    current.closeQuietly();
                    return true;
                }
            }
            return false;
        } finally {
            lock.unlock();
        }
    }

    private void removeAndClose(String connectionId, PooledSession pooled) {
        if (sessions.remove(connectionId, pooled)) {
            pooled.closeQuietly();
        }
    }

    @FunctionalInterface
    public interface SessionCallback<T> {
        T apply(SchemaSession session) throws Exception;
    }

    private static final class PooledSession {
        private final SchemaSession session;
        private final long idleTimeoutMs;
        private final AtomicInteger activeUses = new AtomicInteger();
        private volatile long lastAccessMs;

        private PooledSession(SchemaSession session, long idleTimeoutMs) {
            this.session = session;
            this.idleTimeoutMs = idleTimeoutMs;
            touch();
        }

        private SchemaSession session() {
            return session;
        }

        private void enterUse() {
            activeUses.incrementAndGet();
        }

        private void exitUse() {
            activeUses.decrementAndGet();
        }

        private boolean isInUse() {
            return activeUses.get() > 0;
        }

        private void touch() {
            lastAccessMs = System.currentTimeMillis();
        }

        private long lastAccessMs() {
            return lastAccessMs;
        }

        private boolean isExpired() {
            return System.currentTimeMillis() - lastAccessMs > idleTimeoutMs;
        }

        private boolean isConnectionUsable() {
            return session.isConnectionUsable();
        }

        private void closeQuietly() {
            try {
                session.close();
            } catch (SQLException ex) {
                ExceptionLogging.warn(log, "Failed to close explorer schema session", ex);
            }
        }
    }
}
