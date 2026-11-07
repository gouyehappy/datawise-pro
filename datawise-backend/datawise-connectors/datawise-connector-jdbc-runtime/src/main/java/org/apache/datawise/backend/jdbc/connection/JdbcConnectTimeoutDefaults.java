package org.apache.datawise.backend.jdbc.connection;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.jdbc.support.DbTypeFamilies;
import org.apache.datawise.backend.model.ConnectionEntity;

import java.util.Locale;
import java.util.Properties;
import java.util.concurrent.TimeUnit;

/**
 * Ensures JDBC drivers honor connect/socket timeouts.
 * Without these, {@code Driver.connect} can block across OS sleep/wake
 * (seen as multi-hour explorer pings and Hikari "clock leap" warnings).
 */
public final class JdbcConnectTimeoutDefaults {

    private JdbcConnectTimeoutDefaults() {
    }

    /**
     * @param connectTimeoutMs preferred TCP connect budget (from pool settings)
     * @param socketTimeoutMs  preferred read budget; {@code <=0} skips socket timeout
     */
    public static void apply(ConnectionEntity entity, Properties properties, long connectTimeoutMs, long socketTimeoutMs) {
        if (properties == null) {
            return;
        }
        long connectMs = Math.max(1_000L, connectTimeoutMs);
        long socketMs = socketTimeoutMs > 0 ? Math.max(connectMs, socketTimeoutMs) : 0L;
        String dbType = DbTypeFamilies.normalize(entity != null ? entity.getDbType() : null);

        if (DbTypeFamilies.isMysqlProtocol(dbType)) {
            putIfAbsent(properties, "connectTimeout", Long.toString(connectMs));
            if (socketMs > 0) {
                putIfAbsent(properties, "socketTimeout", Long.toString(socketMs));
            }
            return;
        }
        if (DbTypeFamilies.isPostgresqlFamily(dbType)) {
            putIfAbsent(properties, "connectTimeout", Long.toString(Math.max(1L, TimeUnit.MILLISECONDS.toSeconds(connectMs))));
            if (socketMs > 0) {
                putIfAbsent(properties, "socketTimeout", Long.toString(Math.max(1L, TimeUnit.MILLISECONDS.toSeconds(socketMs))));
            }
            putIfAbsent(properties, "loginTimeout", Long.toString(Math.max(1L, TimeUnit.MILLISECONDS.toSeconds(connectMs))));
            return;
        }
        if (isSqlServerFamily(dbType)) {
            putIfAbsent(properties, "loginTimeout", Long.toString(Math.max(1L, TimeUnit.MILLISECONDS.toSeconds(connectMs))));
            if (socketMs > 0) {
                putIfAbsent(properties, "socketTimeout", Long.toString(Math.max(1L, TimeUnit.MILLISECONDS.toSeconds(socketMs))));
            }
            return;
        }
        // Elasticsearch SQL JDBC rejects unknown properties (e.g. loginTimeout).
        // Official keys are connect.timeout / network.timeout (milliseconds).
        if (DbType.ELASTICSEARCH.matches(dbType)) {
            putIfAbsent(properties, "connect.timeout", Long.toString(connectMs));
            if (socketMs > 0) {
                putIfAbsent(properties, "network.timeout", Long.toString(socketMs));
            }
            return;
        }
        // Trino / Presto JDBC only accept documented connection parameters; skip loginTimeout.
        if (DbTypeFamilies.isTrinoFamily(dbType)) {
            return;
        }
        // Custom JDBC drivers may use strict property whitelists (same class of bug as Trino).
        if (DbType.GENERIC.matches(dbType) || DbType.OTHER.matches(dbType)) {
            return;
        }
        if (supportsLoginTimeoutProperty(dbType)) {
            putIfAbsent(properties, "loginTimeout", Long.toString(Math.max(1L, TimeUnit.MILLISECONDS.toSeconds(connectMs))));
        }
    }

    /**
     * Drivers known to accept (or safely ignore) {@code loginTimeout} as a JDBC connection property.
     * Strict whitelist drivers (Trino/Presto/Elasticsearch) and custom JDBC types are handled above.
     */
    private static boolean supportsLoginTimeoutProperty(String dbType) {
        return DbType.ORACLE.matches(dbType)
                || DbTypeFamilies.isDb2Family(dbType)
                || DbTypeFamilies.isDmFamily(dbType)
                || DbType.OSCAR.matches(dbType)
                || DbTypeFamilies.isHive(dbType)
                || DbType.SQLITE3.matches(dbType)
                || DbType.CLICKHOUSE.matches(dbType)
                || DbType.KYLIN.matches(dbType)
                || DbType.TDENGINE.matches(dbType)
                || DbType.HSQL.matches(dbType)
                || DbType.H2.matches(dbType)
                || DbType.CACHEDB.matches(dbType)
                || DbType.PHOENIX.matches(dbType)
                || DbType.FLINK.matches(dbType);
    }

    private static boolean isSqlServerFamily(String dbType) {
        if (dbType == null || dbType.isBlank()) {
            return false;
        }
        String n = dbType.toLowerCase(Locale.ROOT);
        return n.contains("sqlserver") || n.equals("mssql") || n.contains("sybase");
    }

    private static void putIfAbsent(Properties properties, String key, String value) {
        if (properties.containsKey(key)) {
            return;
        }
        for (String existing : properties.stringPropertyNames()) {
            if (existing != null && existing.equalsIgnoreCase(key)) {
                return;
            }
        }
        properties.setProperty(key, value);
    }
}
