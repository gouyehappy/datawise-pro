package org.apache.datawise.backend.database.explorer;

import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.database.connection.JdbcConnectionPoolWarmupService;
import org.apache.datawise.backend.database.context.ConnectionExecutionContext;
import org.apache.datawise.backend.domain.ConnectionTestResult;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.common.support.PerfLogger;
import org.apache.datawise.backend.jdbc.connection.ConnectionActivityRegistry;
import org.apache.datawise.backend.jdbc.support.JdbcConnectionPoolManager;
import org.apache.datawise.backend.jdbc.support.JdbcDriverConnectionFactory;
import org.apache.datawise.backend.service.outbound.OutboundEventSignals;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/** Explorer 连接生命周期：断开池/会话、探测连通性、重连。 */
@Service
public class ExplorerConnectionLifecycleService {

    private static final Logger log = LoggerFactory.getLogger(ExplorerConnectionLifecycleService.class);

    private final ConnectionExecutionContext connectionContext;
    private final ConnectorFacade connectorFacade;
    private final JdbcDriverConnectionFactory jdbcDriverConnectionFactory;
    private final ExplorerSchemaSessionPool schemaSessionPool;
    private final JdbcConnectionPoolWarmupService poolWarmupService;
    private final ConnectionActivityRegistry activityRegistry;
    private final JdbcConnectionPoolManager poolManager;
    private final OutboundEventSignals outboundEventSignals;

    public ExplorerConnectionLifecycleService(
            ConnectionExecutionContext connectionContext,
            ConnectorFacade connectorFacade,
            JdbcDriverConnectionFactory jdbcDriverConnectionFactory,
            ExplorerSchemaSessionPool schemaSessionPool,
            JdbcConnectionPoolWarmupService poolWarmupService,
            ConnectionActivityRegistry activityRegistry,
            JdbcConnectionPoolManager poolManager,
            OutboundEventSignals outboundEventSignals
    ) {
        this.connectionContext = connectionContext;
        this.connectorFacade = connectorFacade;
        this.jdbcDriverConnectionFactory = jdbcDriverConnectionFactory;
        this.schemaSessionPool = schemaSessionPool;
        this.poolWarmupService = poolWarmupService;
        this.activityRegistry = activityRegistry;
        this.poolManager = poolManager;
        this.outboundEventSignals = outboundEventSignals;
    }

    public void disconnect(String connectionId) {
        requireAvailableConnection(connectionId);
        evictConnectionResources(connectionId);
    }

    /** 空闲回收：无用户上下文，仅释放服务端 JDBC 池与 schema 会话。 */
    public void evictIdleResources(String connectionId) {
        if (connectionId == null || connectionId.isBlank()) {
            return;
        }
        evictConnectionResources(connectionId);
    }

    public java.util.List<String> listPooledConnectionIds() {
        return poolManager.listPooledConnectionIds();
    }

    /**
     * 释放 JDBC 池与 schema 会话，但<strong>保留</strong> schema 树缓存。
     * 数据源按需连接：断开后仍可用本地缓存展开目录，下次显式 connect 再温热连接池。
     */
    private void evictConnectionResources(String connectionId) {
        schemaSessionPool.invalidate(connectionId);
        jdbcDriverConnectionFactory.evictPool(connectionId);
        activityRegistry.clear(connectionId);
    }

    public ConnectionTestResult ping(String connectionId) {
        ConnectionEntity entity = requireAvailableConnection(connectionId);
        connectionContext.requireUserId();
        long startedAt = System.currentTimeMillis();
        ConnectionTestResult result = connectorFacade.catalog().pingConnection(entity);
        if (!result.ok()) {
            outboundEventSignals.connectionHealthFailed(
                    connectionId,
                    entity.getName() != null ? entity.getName() : "",
                    result.message() != null ? result.message() : "",
                    result.latencyMs()
            );
        }
        PerfLogger.log(
                log,
                "connection.ping",
                startedAt,
                "connectionId", connectionId,
                "ok", result.ok(),
                "probeMs", result.latencyMs()
        );
        return result;
    }

    /**
     * 轻量保活：仅在连接池已存在时刷新活跃时间，不建新池、不探测。
     * @return true 若已建池并刷新；false 表示当前未连接（调用方不应强制 connect）
     */
    public boolean touchIfPooled(String connectionId) {
        if (connectionId == null || connectionId.isBlank()) {
            return false;
        }
        requireAvailableConnection(connectionId);
        if (!poolManager.listPooledConnectionIds().contains(connectionId)) {
            return false;
        }
        activityRegistry.touch(connectionId);
        return true;
    }

    public ConnectionTestResult connect(String connectionId) {
        ConnectionEntity entity = requireAvailableConnection(connectionId);
        long startedAt = System.currentTimeMillis();
        if (JdbcConnectionPoolWarmupService.usesJdbcPool(entity)) {
            JdbcConnectionPoolWarmupService.WarmupResult warmup = poolWarmupService.warmupForConnect(entity);
            long latency = System.currentTimeMillis() - startedAt;
            if (warmup.warmed() > 0) {
                activityRegistry.touch(connectionId);
                ConnectionTestResult result = new ConnectionTestResult(
                        true,
                        String.format(
                                "Connected to %s (pool warmed %d/%d) in %dms",
                                entity.getName(),
                                warmup.warmed(),
                                warmup.target(),
                                latency
                        ),
                        latency
                );
                PerfLogger.log(
                        log,
                        "connection.connect",
                        startedAt,
                        "connectionId", connectionId,
                        "ok", true,
                        "probeMs", latency,
                        "poolWarmed", warmup.warmed(),
                        "poolWarmTarget", warmup.target()
                );
                return result;
            }
        }
        ConnectionTestResult result = connectorFacade.catalog().pingConnection(entity);
        JdbcConnectionPoolWarmupService.WarmupResult warmup = JdbcConnectionPoolWarmupService.WarmupResult.skip();
        if (result.ok() && JdbcConnectionPoolWarmupService.usesJdbcPool(entity)) {
            warmup = poolWarmupService.warmupForConnect(entity);
        }
        PerfLogger.log(
                log,
                "connection.connect",
                startedAt,
                "connectionId", connectionId,
                "ok", result.ok(),
                "probeMs", result.latencyMs(),
                "poolWarmed", warmup.skipped() ? 0 : warmup.warmed(),
                "poolWarmTarget", warmup.skipped() ? 0 : warmup.target()
        );
        if (result.ok()) {
            activityRegistry.touch(connectionId);
        }
        return result;
    }

    public ConnectionTestResult reconnect(String connectionId) {
        long startedAt = System.currentTimeMillis();
        disconnect(connectionId);
        ConnectionTestResult result = connect(connectionId);
        PerfLogger.log(
                log,
                "connection.reconnect",
                startedAt,
                "connectionId", connectionId,
                "ok", result.ok(),
                "probeMs", result.latencyMs()
        );
        return result;
    }

    private ConnectionEntity requireAvailableConnection(String connectionId) {
        return connectionContext.requireAvailableConnectionForCurrentUser(
                connectionId,
                ConnectionExecutionContext.EXPLORER_CONNECTION_NOT_FOUND
        ).entity();
    }
}
