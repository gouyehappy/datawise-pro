package org.apache.datawise.backend.jdbc.connection;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.apache.datawise.backend.config.JdbcPoolProperties;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.jdbc.support.ClassLoaderDriverDataSource;
import org.apache.datawise.backend.jdbc.support.HikariJdbcPoolTuning;
import org.apache.datawise.backend.jdbc.error.JdbcConnectionErrors;
import org.apache.datawise.backend.jdbc.support.JdbcDriverDefaultsProvider;
import org.apache.datawise.backend.jdbc.support.JdbcDriverLoader;
import org.apache.datawise.backend.jdbc.support.JdbcPoolSizeResolver;
import org.apache.datawise.backend.jdbc.metrics.JdbcPoolMicrometerSupport;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.Properties;

/**
 * One HikariCP pool bound to a single connection configuration fingerprint.
 */
public final class ManagedJdbcPool {

    private static final Logger log = LoggerFactory.getLogger(ManagedJdbcPool.class);

    private final String fingerprint;
    private final HikariDataSource dataSource;

    private ManagedJdbcPool(String fingerprint, HikariDataSource dataSource) {
        this.fingerprint = fingerprint;
        this.dataSource = dataSource;
    }

    public String fingerprint() {
        return fingerprint;
    }

    public HikariDataSource dataSource() {
        return dataSource;
    }

    /** Creates and probes a new pool; caller owns eviction on failure after this returns. */
    public static ManagedJdbcPool create(
            ConnectionEntity entity,
            String fingerprint,
            JdbcDriverLoader jdbcDriverLoader,
            JdbcDriverDefaultsProvider defaultsProvider,
            JdbcConnectionTargetResolver targetResolver,
            MeterRegistry meterRegistry,
            JdbcPoolProperties poolProperties
    ) throws SQLException {
        if ("redis".equalsIgnoreCase(entity.getDbType())) {
            throw new SQLException("Redis connections do not use JDBC");
        }

        String jdbcUrl = targetResolver.resolve(entity).jdbcUrl();
        Properties driverProperties = JdbcPoolDriverResolver.buildConnectionProperties(entity);
        JdbcPoolDriverResolver.ResolvedDriver driver = JdbcPoolDriverResolver.resolve(entity, defaultsProvider);

        JdbcPoolProperties pool = poolProperties != null ? poolProperties : new JdbcPoolProperties();
        JdbcConnectTimeoutDefaults.apply(
                entity,
                driverProperties,
                pool.getConnectionTimeoutMs(),
                Math.max(pool.getConnectionTimeoutMs() * 6L, 60_000L)
        );
        HikariConfig config = new HikariConfig();
        config.setPoolName("dw-" + entity.getId());
        int maximumPoolSize = JdbcPoolSizeResolver.resolveMaximumPoolSize(entity, pool);
        config.setMaximumPoolSize(maximumPoolSize);
        config.setMinimumIdle(JdbcPoolSizeResolver.resolveMinimumIdle(entity, pool, maximumPoolSize));
        config.setIdleTimeout(pool.getIdleTimeoutMs());
        config.setMaxLifetime(pool.getMaxLifetimeMs());
        config.setConnectionTimeout(pool.getConnectionTimeoutMs());
        config.setValidationTimeout(pool.getValidationTimeoutMs());
        config.setKeepaliveTime(pool.getKeepaliveTimeMs());

        if (driver != null) {
            try {
                JdbcDriverLoader.LoadedDriver loaded = jdbcDriverLoader.ensureDriver(
                        driver.mavenCoordinates(),
                        driver.driverClass()
                );
                config.setDataSource(new ClassLoaderDriverDataSource(
                        loaded.driver(),
                        jdbcUrl,
                        driverProperties,
                        loaded.classLoader()
                ));
            } catch (IOException ex) {
                throw new SQLException("Failed to load JDBC driver: " + ex.getMessage(), ex);
            }
        } else {
            config.setJdbcUrl(jdbcUrl);
            if (entity.getAuthType() == null || !"NONE".equalsIgnoreCase(entity.getAuthType())) {
                if (entity.getUsername() != null) {
                    config.setUsername(entity.getUsername());
                }
                if (entity.getPassword() != null) {
                    config.setPassword(entity.getPassword());
                }
            }
        }

        HikariJdbcPoolTuning.apply(config, entity);
        JdbcPoolMicrometerSupport.apply(config, meterRegistry);

        try {
            HikariDataSource dataSource = new HikariDataSource(config);
            try (Connection probe = dataSource.getConnection()) {
                if (!probe.isValid(3)) {
                    throw new SQLException("Connection probe failed for connectionId=" + entity.getId());
                }
            } catch (SQLException ex) {
                dataSource.close();
                throw new SQLException(JdbcConnectionErrors.toUserMessage(entity, ex), ex);
            }
            log.info("Created JDBC pool connectionId={} url={}", entity.getId(), jdbcUrl);
            return new ManagedJdbcPool(fingerprint, dataSource);
        } catch (RuntimeException ex) {
            SQLException sqlEx = unwrapSqlException(ex);
            throw new SQLException(
                    "Failed to initialize JDBC pool for connectionId=" + entity.getId() + ": " + sqlEx.getMessage(),
                    sqlEx
            );
        }
    }

    public void closeQuietly() {
        if (dataSource != null && !dataSource.isClosed()) {
            dataSource.close();
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
}
