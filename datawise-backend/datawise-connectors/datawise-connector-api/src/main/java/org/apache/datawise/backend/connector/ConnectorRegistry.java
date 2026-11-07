package org.apache.datawise.backend.connector;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.model.ConnectionEntity;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

/**
 * 按连接器优先级解析 dbType，类似 SeaTunnel FactoryUtil 按 factoryIdentifier 发现插件。
 */
public class ConnectorRegistry {

    private volatile List<DataSourceConnector> connectors;
    private final ConcurrentMap<String, DataSourceConnector> resolveCache = new ConcurrentHashMap<>();

    public ConnectorRegistry(List<DataSourceConnector> connectors) {
        this.connectors = sortConnectors(connectors);
    }

    /**
     * Hot-reload support: swap the connector set (e.g. after loading new JARs from {@code config/plugins})
     * and clear the resolve cache.
     */
    public synchronized void replaceAll(List<DataSourceConnector> next) {
        this.connectors = sortConnectors(next != null ? next : List.of());
        resolveCache.clear();
    }

    /** {@code config/plugins} 优先于 classpath 上同 id 的连接器。 */
    public static ConnectorRegistry merge(
                                          List<DataSourceConnector> pluginConnectors,
                                          List<DataSourceConnector> classpathConnectors) {
        Set<String> pluginIds = new LinkedHashSet<>();
        List<DataSourceConnector> merged = new ArrayList<>();
        if (pluginConnectors != null) {
            for (DataSourceConnector connector : pluginConnectors) {
                if (connector == null || connector.id() == null || connector.id().isBlank()) {
                    continue;
                }
                // Keep first occurrence — protects against accidental duplicate SPI registrations.
                if (!pluginIds.add(connector.id())) {
                    continue;
                }
                merged.add(connector);
            }
        }
        if (classpathConnectors != null) {
            for (DataSourceConnector connector : classpathConnectors) {
                if (!pluginIds.contains(connector.id())) {
                    merged.add(connector);
                }
            }
        }
        return new ConnectorRegistry(merged);
    }

    private static List<DataSourceConnector> sortConnectors(List<DataSourceConnector> connectors) {
        return connectors.stream()
                .sorted(Comparator.comparingInt(DataSourceConnector::priority))
                .toList();
    }

    public DataSourceConnector resolve(ConnectionEntity entity) {
        String dbType = normalizeDbType(entity != null ? entity.getDbType() : null);
        return resolve(dbType);
    }

    public DataSourceConnector resolve(String dbType) {
        String normalized = normalizeDbType(dbType);
        DataSourceConnector cached = resolveCache.get(normalized);
        if (cached != null) {
            return cached;
        }
        return resolveCache.computeIfAbsent(normalized, this::resolveUncached);
    }

    private DataSourceConnector resolveUncached(String normalized) {
        return connectors.stream()
                .filter(connector -> connector.supports(normalized))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("No connector for dbType: " + normalized));
    }

    public List<DataSourceConnector> all() {
        return connectors;
    }

    private static String normalizeDbType(String dbType) {
        return DbType.normalizeId(dbType);
    }
}
