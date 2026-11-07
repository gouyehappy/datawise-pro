package org.apache.datawise.backend.domain.pack;

import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Connector marketplace id → commercial pack.
 * Free Standard connectors (PRODUCT_EXTENSION_PACKS §2.1 / §2.2) have no pack mapping.
 */
public final class PackConnectorMap {

    /** Free forever in Standard Core (MariaDB ships via mysql plugin). */
    public static final Set<String> FREE_CONNECTOR_IDS = Set.of(
            "mysql",
            "mariadb",
            "postgresql",
            "sqlite",
            "sqlite3");

    private static final Map<String, String> BY_CONNECTOR = Map.ofEntries(
            Map.entry("oracle", PackIds.CONNECTOR_ENTERPRISE),
            Map.entry("sqlserver", PackIds.CONNECTOR_ENTERPRISE),
            Map.entry("db2", PackIds.CONNECTOR_ENTERPRISE),
            Map.entry("sybase", PackIds.CONNECTOR_ENTERPRISE),
            Map.entry("greenplum", PackIds.CONNECTOR_ENTERPRISE),
            Map.entry("h2", PackIds.CONNECTOR_ENTERPRISE),
            Map.entry("hsql", PackIds.CONNECTOR_ENTERPRISE),
            Map.entry("cachedb", PackIds.CONNECTOR_ENTERPRISE),
            Map.entry("dm", PackIds.CONNECTOR_DOMESTIC),
            Map.entry("oceanbase", PackIds.CONNECTOR_DOMESTIC),
            Map.entry("gaussdb", PackIds.CONNECTOR_DOMESTIC),
            Map.entry("kingbase", PackIds.CONNECTOR_DOMESTIC),
            Map.entry("opengauss", PackIds.CONNECTOR_DOMESTIC),
            Map.entry("highgo", PackIds.CONNECTOR_DOMESTIC),
            Map.entry("gbase8a", PackIds.CONNECTOR_DOMESTIC),
            Map.entry("oscar", PackIds.CONNECTOR_DOMESTIC),
            Map.entry("tidb", PackIds.CONNECTOR_DOMESTIC),
            Map.entry("hive", PackIds.CONNECTOR_BIGDATA),
            Map.entry("kafka", PackIds.CONNECTOR_BIGDATA),
            Map.entry("flink", PackIds.CONNECTOR_BIGDATA),
            Map.entry("clickhouse", PackIds.CONNECTOR_BIGDATA),
            Map.entry("starrocks", PackIds.CONNECTOR_BIGDATA),
            Map.entry("doris", PackIds.CONNECTOR_BIGDATA),
            Map.entry("trino", PackIds.CONNECTOR_BIGDATA),
            Map.entry("presto", PackIds.CONNECTOR_BIGDATA),
            Map.entry("elasticsearch", PackIds.CONNECTOR_BIGDATA),
            Map.entry("kudu", PackIds.CONNECTOR_BIGDATA),
            Map.entry("yarn", PackIds.CONNECTOR_BIGDATA),
            Map.entry("redis", PackIds.CONNECTOR_BIGDATA),
            Map.entry("mongodb", PackIds.CONNECTOR_BIGDATA),
            Map.entry("tdengine", PackIds.CONNECTOR_BIGDATA),
            Map.entry("kylin", PackIds.CONNECTOR_BIGDATA),
            Map.entry("phoenix", PackIds.CONNECTOR_BIGDATA));

    private PackConnectorMap() {
    }

    public static boolean isFreeConnector(String connectorId) {
        if (connectorId == null || connectorId.isBlank()) {
            return false;
        }
        return FREE_CONNECTOR_IDS.contains(connectorId.trim().toLowerCase(Locale.ROOT));
    }

    public static Optional<String> packIdForConnector(String connectorId) {
        if (connectorId == null || connectorId.isBlank()) {
            return Optional.empty();
        }
        String id = connectorId.trim().toLowerCase(Locale.ROOT);
        if (FREE_CONNECTOR_IDS.contains(id)) {
            return Optional.empty();
        }
        return Optional.ofNullable(BY_CONNECTOR.get(id));
    }
}
