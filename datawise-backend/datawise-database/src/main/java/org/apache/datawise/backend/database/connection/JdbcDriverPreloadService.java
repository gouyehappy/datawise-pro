package org.apache.datawise.backend.database.connection;

import org.apache.datawise.backend.configstore.ConnectionStore;
import org.apache.datawise.backend.domain.ConnectionConfig;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.connector.api.support.ConnectionMapper;
import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.apache.datawise.backend.jdbc.support.JdbcDriverDefaultsProvider;
import org.apache.datawise.backend.jdbc.support.JdbcDriverLoader;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.LinkedHashSet;
import java.util.Set;

/**
 * 启动时将 {@code config/drivers/} 下已存在的 JDBC 驱动 JAR 预加载到内存。
 */
@Service
public class JdbcDriverPreloadService {

    private static final Logger log = LoggerFactory.getLogger(JdbcDriverPreloadService.class);

    private final JdbcDriverLoader jdbcDriverLoader;
    private final JdbcDriverDefaultsProvider defaultsProvider;
    private final ConnectionStore connectionStore;

    public JdbcDriverPreloadService(
            JdbcDriverLoader jdbcDriverLoader,
            JdbcDriverDefaultsProvider defaultsProvider,
            ConnectionStore connectionStore
    ) {
        this.jdbcDriverLoader = jdbcDriverLoader;
        this.defaultsProvider = defaultsProvider;
        this.connectionStore = connectionStore;
    }

    public PreloadReport preloadExistingDrivers() {
        Set<DriverSpec> specs = collectDriverSpecs();
        int preloaded = 0;
        int skipped = 0;
        int failed = 0;
        long startedAt = System.currentTimeMillis();

        for (DriverSpec spec : specs) {
            try {
                if (jdbcDriverLoader.preloadIfPresent(spec.mavenCoordinates(), spec.driverClass()).isPresent()) {
                    preloaded++;
                } else {
                    skipped++;
                }
            } catch (Throwable ex) {
                failed++;
                ExceptionLogging.recoverable(
                        log,
                        "JDBC driver preload failed for " + spec.mavenCoordinates(),
                        ex
                );
            }
        }

        long durationMs = System.currentTimeMillis() - startedAt;
        return new PreloadReport(preloaded, skipped, failed, durationMs);
    }

    private Set<DriverSpec> collectDriverSpecs() {
        Set<DriverSpec> specs = new LinkedHashSet<>();
        for (JdbcDriverDefaultsProvider.DriverDefaults defaults : defaultsProvider.allDefaults()) {
            specs.add(new DriverSpec(defaults.mavenCoordinates(), defaults.driverClass()));
        }
        for (ConnectionEntity connection : connectionStore.findAllConnections()) {
            addConnectionSpec(specs, ConnectionMapper.toDto(connection));
        }
        return specs;
    }

    private void addConnectionSpec(Set<DriverSpec> specs, ConnectionConfig config) {
        if (config.getDbType() != null && "redis".equalsIgnoreCase(config.getDbType())) {
            return;
        }
        String mavenCoordinates = config.getDriver();
        String driverClass = config.getDriverClass();
        try {
            if (mavenCoordinates != null && !mavenCoordinates.isBlank()) {
                mavenCoordinates = JdbcDriverLoader.normalizeDriverInput(mavenCoordinates);
            }
        } catch (IllegalArgumentException ex) {
            JdbcDriverDefaultsProvider.DriverDefaults defaults = defaultsProvider
                    .defaultsFor(config.getDbType())
                    .orElse(null);
            if (defaults == null) {
                return;
            }
            mavenCoordinates = defaults.mavenCoordinates();
            if (driverClass == null || driverClass.isBlank()) {
                driverClass = defaults.driverClass();
            }
        }
        if (mavenCoordinates == null || mavenCoordinates.isBlank()
                || driverClass == null || driverClass.isBlank()) {
            return;
        }
        specs.add(new DriverSpec(mavenCoordinates.trim(), driverClass.trim()));
    }

    public record PreloadReport(int preloaded, int skipped, int failed, long durationMs) {
    }

    private record DriverSpec(String mavenCoordinates, String driverClass) {
    }
}
