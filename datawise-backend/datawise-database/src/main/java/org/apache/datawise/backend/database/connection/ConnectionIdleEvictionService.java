package org.apache.datawise.backend.database.connection;

import org.apache.datawise.backend.config.ConnectionLifecycleProperties;
import org.apache.datawise.backend.database.explorer.ExplorerConnectionLifecycleService;
import org.apache.datawise.backend.jdbc.connection.ConnectionActivityRegistry;
import org.apache.datawise.backend.jdbc.support.JdbcConnectionPoolManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/** 定时回收长时间未使用的 JDBC 连接池与 Explorer schema 会话；并按上限 LRU 裁剪池数量。 */
@Component
public class ConnectionIdleEvictionService {

    private static final Logger log = LoggerFactory.getLogger(ConnectionIdleEvictionService.class);

    private final ConnectionLifecycleProperties properties;
    private final JdbcConnectionPoolManager poolManager;
    private final ConnectionActivityRegistry activityRegistry;
    private final ExplorerConnectionLifecycleService connectionLifecycleService;

    public ConnectionIdleEvictionService(
            ConnectionLifecycleProperties properties,
            JdbcConnectionPoolManager poolManager,
            ConnectionActivityRegistry activityRegistry,
            ExplorerConnectionLifecycleService connectionLifecycleService
    ) {
        this.properties = properties != null ? properties : new ConnectionLifecycleProperties();
        this.poolManager = poolManager;
        this.activityRegistry = activityRegistry;
        this.connectionLifecycleService = connectionLifecycleService;
    }

    @Scheduled(fixedDelayString = "${datawise.connection.idle-evict-poll-ms:60000}")
    void evictIdleConnectionsScheduled() {
        if (properties.isIdleEvictEnabled()) {
            long cutoffMs = System.currentTimeMillis() - properties.getIdleEvictMs();
            List<String> staleIds = new ArrayList<>();
            for (String connectionId : poolManager.listPooledConnectionIds()) {
                if (isStale(connectionId, cutoffMs)) {
                    staleIds.add(connectionId);
                }
            }
            for (String connectionId : staleIds) {
                connectionLifecycleService.evictIdleResources(connectionId);
                log.info("Evicted idle JDBC resources connectionId={} idleMs={}", connectionId, properties.getIdleEvictMs());
            }
        }
        trimExcessPools();
    }

    /** 池数量超过 maxActivePools 时，按最近活跃时间（无则创建时间）升序 LRU 回收。 */
    void trimExcessPools() {
        int maxActivePools = properties.getMaxActivePools();
        if (maxActivePools <= 0) {
            return;
        }
        List<String> pooledIds = new ArrayList<>(poolManager.listPooledConnectionIds());
        int excess = pooledIds.size() - maxActivePools;
        if (excess <= 0) {
            return;
        }
        pooledIds.sort(Comparator.comparingLong(this::resolveActivityMs));
        for (int i = 0; i < excess; i++) {
            String connectionId = pooledIds.get(i);
            connectionLifecycleService.evictIdleResources(connectionId);
            log.info(
                    "Evicted LRU JDBC pool connectionId={} activePools={} maxActivePools={}",
                    connectionId,
                    pooledIds.size() - i,
                    maxActivePools
            );
        }
    }

    private long resolveActivityMs(String connectionId) {
        Long activityMs = activityRegistry.getLastActivityMs(connectionId);
        if (activityMs != null) {
            return activityMs;
        }
        return poolManager.getPoolCreatedAtMs(connectionId);
    }

    private boolean isStale(String connectionId, long cutoffMs) {
        Long activityMs = activityRegistry.getLastActivityMs(connectionId);
        if (activityMs != null) {
            return activityMs < cutoffMs;
        }
        return poolManager.getPoolCreatedAtMs(connectionId) < cutoffMs;
    }
}
