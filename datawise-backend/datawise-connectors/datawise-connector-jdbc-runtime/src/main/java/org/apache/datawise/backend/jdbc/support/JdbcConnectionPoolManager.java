package org.apache.datawise.backend.jdbc.support;

import org.apache.datawise.backend.common.support.DatawiseMetricsCatalog;
import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.apache.datawise.backend.config.JdbcPoolProperties;
import org.apache.datawise.backend.jdbc.connection.JdbcConnectionFingerprint;
import org.apache.datawise.backend.jdbc.connection.JdbcConnectTimeoutDefaults;
import org.apache.datawise.backend.jdbc.connection.JdbcPoolDriverResolver;
import org.apache.datawise.backend.jdbc.connection.JdbcConnectionTargetResolver;
import org.apache.datawise.backend.jdbc.connection.ManagedJdbcPool;
import org.apache.datawise.backend.jdbc.error.JdbcConnectionErrors;
import org.apache.datawise.backend.model.ConnectionEntity;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Gauge;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.Properties;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

/**
 * Maintains per-connection HikariCP pools keyed by connection id and configuration fingerprint.
 */
@Component
public class JdbcConnectionPoolManager {

    private static final Logger log = LoggerFactory.getLogger(JdbcConnectionPoolManager.class);

    private final JdbcDriverLoader jdbcDriverLoader;
    private final JdbcDriverDefaultsProvider defaultsProvider;
    private final JdbcConnectionTargetResolver targetResolver;
    private final MeterRegistry meterRegistry;
    private final JdbcPoolProperties poolProperties;
    private final ConcurrentMap<String, PoolEntry> pools = new ConcurrentHashMap<>();

    private static final class PoolEntry {

        private final ManagedJdbcPool pool;
        private final long createdAtMs;

        private PoolEntry(ManagedJdbcPool pool) {
            this.pool = pool;
            this.createdAtMs = System.currentTimeMillis();
        }
    }

    public JdbcConnectionPoolManager(
                                     JdbcDriverLoader jdbcDriverLoader,
                                     JdbcDriverDefaultsProvider defaultsProvider,
                                     JdbcConnectionTargetResolver targetResolver,
                                     ObjectProvider<MeterRegistry> meterRegistryProvider,
                                     JdbcPoolProperties poolProperties) {
        this.jdbcDriverLoader = jdbcDriverLoader;
        this.defaultsProvider = defaultsProvider;
        this.targetResolver = targetResolver;
        this.meterRegistry = meterRegistryProvider.getIfAvailable();
        this.poolProperties = poolProperties != null ? poolProperties : new JdbcPoolProperties();
        if (this.meterRegistry != null) {
            Gauge.builder(DatawiseMetricsCatalog.JDBC_POOLS_ACTIVE, pools, ConcurrentMap::size)
                    .description("Cached HikariCP pools keyed by connection id")
                    .register(this.meterRegistry);
        }
    }

    /** Opens a one-off JDBC connection without caching a pool (health probes). */
    public Connection openDirect(ConnectionEntity entity) throws SQLException {
        return openDirectConnection(entity);
    }

    public java.util.List<String> listPooledConnectionIds() {
        return java.util.List.copyOf(pools.keySet());
    }

    public long getPoolCreatedAtMs(String connectionId) {
        if (connectionId == null || connectionId.isBlank()) {
            return Long.MAX_VALUE;
        }
        PoolEntry entry = pools.get(connectionId);
        return entry != null ? entry.createdAtMs : Long.MAX_VALUE;
    }

    /** Borrows a connection from pool, or opens a one-off direct connection when id is absent. */
    public Connection open(ConnectionEntity entity) throws SQLException {
        if (entity.getId() == null || entity.getId().isBlank()) {
            return openDirectConnection(entity);
        }
        String fingerprint = JdbcConnectionFingerprint.of(entity);
        try {
            ManagedJdbcPool pool = resolvePool(entity, fingerprint);
            return borrowConnection(entity, pool);
        } catch (PoolCreationException ex) {
            pools.remove(entity.getId());
            throw ex.sqlException();
        } catch (SQLException ex) {
            ExceptionLogging.error(
                    log,
                    "JDBC pool getConnection failed connectionId=" + entity.getId(),
                    ex);
            throw ex;
        } catch (RuntimeException ex) {
            pools.remove(entity.getId());
            SQLException sqlEx = unwrapSqlException(ex);
            ExceptionLogging.error(
                    log,
                    "JDBC pool open failed connectionId=" + entity.getId(),
                    sqlEx);
            throw sqlEx;
        }
    }

    /** Closes and removes cached pool for one connection id. */
    public void evict(String connectionId) {
        if (connectionId == null || connectionId.isBlank()) {
            return;
        }
        PoolEntry removed = pools.remove(connectionId);
        if (removed != null) {
            removed.pool.closeQuietly();
            log.info("Evicted JDBC pool for connectionId={}", connectionId);
        }
        targetResolver.evictTunnel(entityForEvict(connectionId));
    }

    private static ConnectionEntity entityForEvict(String connectionId) {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setId(connectionId);
        return entity;
    }

    private ManagedJdbcPool resolvePool(ConnectionEntity entity, String fingerprint) {
        PoolEntry poolEntry = pools.compute(entity.getId(), (id, existing) -> {
            if (existing != null && existing.pool.fingerprint().equals(fingerprint)) {
                return existing;
            }
            if (existing != null) {
                existing.pool.closeQuietly();
            }
            try {
                ManagedJdbcPool created = ManagedJdbcPool.create(
                        entity,
                        fingerprint,
                        jdbcDriverLoader,
                        defaultsProvider,
                        targetResolver,
                        meterRegistry,
                        poolProperties);
                return new PoolEntry(created);
            } catch (SQLException ex) {
                ExceptionLogging.error(
                        log,
                        "JDBC pool create failed connectionId=" + entity.getId()
                                + " dbType=" + entity.getDbType(),
                        ex);
                throw new PoolCreationException(ex);
            }
        });
        if (poolEntry == null) {
            throw new PoolCreationException(new SQLException("Failed to create JDBC connection pool"));
        }
        return poolEntry.pool;
    }

    private Connection borrowConnection(ConnectionEntity entity, ManagedJdbcPool pool) throws SQLException {
        for (int attempt = 0; attempt < 2; attempt++) {
            try {
                // Guarded so a metadata lookup that switches database cannot leak that context
                // back into the pool (see JdbcConnectionScopeGuard).
                return JdbcConnectionScopeGuard.wrap(pool.dataSource().getConnection(), entity.getDbType());
            } catch (SQLException ex) {
                if (attempt == 0 && JdbcConnectionErrors.isTransientConnectionFailure(ex)) {
                    PoolEntry removed = pools.remove(entity.getId());
                    if (removed != null) {
                        removed.pool.closeQuietly();
                    }
                    log.warn(
                            "Evicted JDBC pool after transient getConnection failure connectionId={}",
                            entity.getId());
                    pool = resolvePool(entity, JdbcConnectionFingerprint.of(entity));
                    continue;
                }
                throw new SQLException(JdbcConnectionErrors.toUserMessage(entity, ex), ex);
            }
        }
        throw new SQLException(JdbcConnectionErrors.toUserMessage(
                entity,
                new SQLException("Failed to obtain JDBC connection after retry")));
    }

    private Connection openDirectConnection(ConnectionEntity entity) throws SQLException {
        String url = targetResolver.resolve(entity).jdbcUrl();
        Properties properties = JdbcPoolDriverResolver.buildConnectionProperties(entity);
        JdbcConnectTimeoutDefaults.apply(
                entity,
                properties,
                poolProperties.getConnectionTimeoutMs(),
                Math.max(poolProperties.getConnectionTimeoutMs() * 6L, 60_000L));
        JdbcPoolDriverResolver.ResolvedDriver driver = JdbcPoolDriverResolver.resolve(entity, defaultsProvider);
        if (driver != null) {
            try {
                JdbcDriverLoader.LoadedDriver loaded = jdbcDriverLoader.ensureDriver(
                        driver.mavenCoordinates(),
                        driver.driverClass());
                Connection connection = loaded.driver().connect(url, properties);
                if (connection == null) {
                    throw new SQLException("Driver rejected URL: " + url);
                }
                return connection;
            } catch (IOException ex) {
                SQLException sqlEx = new SQLException("Failed to load JDBC driver: " + ex.getMessage(), ex);
                ExceptionLogging.error(log, "JDBC direct open failed for " + entity.getDbType(), sqlEx);
                throw sqlEx;
            }
        }
        try {
            if (properties.containsKey("user")) {
                return java.sql.DriverManager.getConnection(url, properties);
            }
            return java.sql.DriverManager.getConnection(url);
        } catch (SQLException ex) {
            ExceptionLogging.error(log, "JDBC DriverManager open failed url=" + url, ex);
            throw ex;
        }
    }

    private static SQLException unwrapSqlException(RuntimeException ex) {
        Throwable current = ex;
        while (current != null) {
            if (current instanceof SQLException sqlEx) {
                return sqlEx;
            }
            current = current.getCause();
        }
        return new SQLException(ex.getMessage(), ex);
    }

    private static final class PoolCreationException extends RuntimeException {

        private final SQLException sqlException;

        private PoolCreationException(SQLException sqlException) {
            super(sqlException.getMessage(), sqlException);
            this.sqlException = sqlException;
        }

        private SQLException sqlException() {
            return sqlException;
        }
    }
}
