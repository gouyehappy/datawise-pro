package org.apache.datawise.backend.database.connection;

import jakarta.annotation.PreDestroy;
import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.common.DbTypeCatalogEntry;
import org.apache.datawise.backend.config.JdbcPoolProperties;
import org.apache.datawise.backend.jdbc.support.JdbcDriverConnectionFactory;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * On-demand pool priming after an <em>explicit</em> user connect.
 * Borrows up to {@link JdbcPoolProperties#getMinimumIdle()} so the first SQL / explorer load
 * avoids cold-pool latency. Tree load / create / update must not call this — idle datasources
 * stay disconnected until the user connects.
 */
@Service
public class JdbcConnectionPoolWarmupService {

    private static final Logger log = LoggerFactory.getLogger(JdbcConnectionPoolWarmupService.class);
    private static final int MAX_WARMUP_PARALLELISM = 3;

    private final JdbcDriverConnectionFactory connectionFactory;
    private final JdbcPoolProperties poolProperties;
    private final AtomicInteger backgroundThreadId = new AtomicInteger();
    private final ExecutorService backgroundExecutor = Executors.newFixedThreadPool(
            MAX_WARMUP_PARALLELISM,
            runnable -> {
                Thread thread = new Thread(
                        runnable,
                        "jdbc-pool-warmup-" + backgroundThreadId.incrementAndGet()
                );
                thread.setDaemon(true);
                return thread;
            }
    );
    private final Set<String> backgroundWarmups = ConcurrentHashMap.newKeySet();

    public JdbcConnectionPoolWarmupService(
            JdbcDriverConnectionFactory connectionFactory,
            JdbcPoolProperties poolProperties
    ) {
        this.connectionFactory = connectionFactory;
        this.poolProperties = poolProperties != null ? poolProperties : new JdbcPoolProperties();
    }

    public WarmupResult warmup(ConnectionEntity entity) {
        if (!usesJdbcPool(entity)) {
            return WarmupResult.skip();
        }
        int target = targetWarmupConnections();
        int parallelism = Math.min(MAX_WARMUP_PARALLELISM, target);
        ExecutorService executor = Executors.newFixedThreadPool(parallelism);
        try {
            List<Callable<Boolean>> tasks = new ArrayList<>(target);
            for (int attempt = 0; attempt < target; attempt++) {
                tasks.add(() -> borrowAndValidate(entity));
            }
            int warmed = 0;
            for (Future<Boolean> future : executor.invokeAll(tasks)) {
                try {
                    if (Boolean.TRUE.equals(future.get())) {
                        warmed++;
                    }
                } catch (ExecutionException ex) {
                    Throwable cause = ex.getCause() != null ? ex.getCause() : ex;
                    if (cause instanceof SQLException sqlEx) {
                        ExceptionLogging.warn(
                                log,
                                "JDBC pool warmup failed connectionId=" + entity.getId(),
                                sqlEx
                        );
                    } else {
                        ExceptionLogging.warn(
                                log,
                                "JDBC pool warmup failed connectionId=" + entity.getId(),
                                cause instanceof Exception exception ? exception : ex
                        );
                    }
                    break;
                }
            }
            if (warmed > 0) {
                log.debug("Warmed JDBC pool connectionId={} connections={}/{}", entity.getId(), warmed, target);
            }
            return new WarmupResult(warmed, target);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            return new WarmupResult(0, target);
        } finally {
            executor.shutdownNow();
        }
    }

    public WarmupResult warmupForConnect(ConnectionEntity entity) {
        if (!usesJdbcPool(entity)) {
            return WarmupResult.skip();
        }
        int target = targetWarmupConnections();
        int warmed = borrowAndValidateSafely(entity, "JDBC initial pool warmup failed connectionId=") ? 1 : 0;
        if (warmed > 0) {
            log.debug("Warmed initial JDBC pool connectionId={} connections={}/{}", entity.getId(), warmed, target);
            warmupRemainingInBackground(entity, target - warmed);
        }
        return new WarmupResult(warmed, target);
    }

    public void warmupInBackground(ConnectionEntity entity) {
        if (!usesJdbcPool(entity)) {
            return;
        }
        warmupRemainingInBackground(entity, targetWarmupConnections());
    }

    private int targetWarmupConnections() {
        return Math.max(1, poolProperties.getMinimumIdle());
    }

    private void warmupRemainingInBackground(ConnectionEntity entity, int remaining) {
        if (remaining <= 0) {
            return;
        }
        String connectionId = entity.getId();
        if (!backgroundWarmups.add(connectionId)) {
            return;
        }
        try {
            backgroundExecutor.submit(() -> {
                int warmed = 0;
                try {
                    for (int attempt = 0; attempt < remaining; attempt++) {
                        if (borrowAndValidateSafely(entity, "JDBC background pool warmup failed connectionId=")) {
                            warmed++;
                        }
                    }
                    if (warmed > 0) {
                        log.debug("Warmed JDBC pool in background connectionId={} connections={}", connectionId, warmed);
                    }
                } finally {
                    backgroundWarmups.remove(connectionId);
                }
            });
        } catch (RejectedExecutionException ex) {
            backgroundWarmups.remove(connectionId);
        }
    }

    private boolean borrowAndValidateSafely(ConnectionEntity entity, String messagePrefix) {
        try {
            return borrowAndValidate(entity);
        } catch (SQLException ex) {
            ExceptionLogging.warn(log, messagePrefix + entity.getId(), ex);
            return false;
        }
    }

    private boolean borrowAndValidate(ConnectionEntity entity) throws SQLException {
        try (Connection connection = connectionFactory.open(entity)) {
            return connection.isValid(3);
        }
    }

    @PreDestroy
    void shutdown() {
        backgroundExecutor.shutdownNow();
    }

    /**
     * Whether connect should warm a Hikari pool.
     * Uses catalog metadata ({@code catalog.kind=nonJdbc} ⇒ false) so SSH/Redis/Kafka
     * never hit {@code DriverManager} / "No suitable driver".
     */
    public static boolean usesJdbcPool(ConnectionEntity entity) {
        if (entity == null || entity.getId() == null || entity.getId().isBlank()) {
            return false;
        }
        String dbType = entity.getDbType();
        if (dbType == null || dbType.isBlank()) {
            return false;
        }
        return DbType.find(dbType)
                .flatMap(DbType::catalogEntry)
                .map(DbTypeCatalogEntry::jdbcDriverRequired)
                .orElse(true);
    }

    public record WarmupResult(int warmed, int target, boolean skipped) {
        public static WarmupResult skip() {
            return new WarmupResult(0, 0, true);
        }

        public WarmupResult(int warmed, int target) {
            this(warmed, target, false);
        }
    }
}
